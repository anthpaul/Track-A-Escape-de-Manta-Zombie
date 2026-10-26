# INFRA.md — Infraestructura y diseño de DynamoDB

Un dominio de CloudFront sirve el sitio estático (mapa en vivo) y la API, una Lambda con Hono atiende todo `/api/*`, y DynamoDB guarda el estado del mundo en una sola tabla. El modelo de datos vive en `AGENTS.md` §4.

## Quick path (30 minutos, lo hace Alex)

1. Login en la cuenta del equipo: `aws sts get-caller-identity` debe mostrar tu usuario IAM.
2. Bootstrap del bucket del state, una sola vez por cuenta (`infra/README.md` §1).
3. Desde la raíz: `npm ci`, `npm run build -w backend`.
4. En `infra/`: copiar `backend.hcl.example` a `backend.hcl` con el bucket real, exportar `TF_VAR_api_key`, `terraform init -backend-config=backend.hcl`, `terraform plan -out=tfplan`, leer el plan, `terraform apply tfplan`.
5. Verificar: `curl "$(terraform output -raw site_url)/api/health"` → `{"ok":true,...}`.

---

## 1. Arquitectura

```text
                         ┌──────────────── CloudFront (un solo dominio) ────────────────┐
 celular / navegador ──▶ │  /*          → S3 (sitio estático, privado, OAC)              │
                         │  /api/*      → API Gateway (sin cache)                         │
                         └───────────────────────────────┬───────────────────────────────┘
                                                         ▼
                                  API Gateway HTTP API ($default, throttling 300 rps / 600)
                                                         ▼
                                  Lambda nodejs24.x arm64 1024 MB 10 s (Hono, basePath /api)
                                                         ▼
                                  DynamoDB spookython_mundo (PK, SK, GSI1, on-demand, PITR)
```

**Por qué un solo dominio:** el front llama a `/api` relativo, así que no hay CORS en producción ni URLs distintas por entorno. CORS solo existe en `backend/src/dev.ts` para desarrollo local (3000 → 3001).

**Por qué la API no se cachea en CloudFront:** `/paso` y `/estado` cambian cada turno (2 s). La caché que importa es la del turno N dentro de cada Lambda (`AGENTS.md` §4.3).

| Archivo | Recursos |
|---|---|
| `main.tf` | Providers, backend S3 del state (bucket y región salen de `backend.hcl`), tags por defecto |
| `variables.tf` | `project`, `env`, región (`us-east-2` por defecto, `us-east-1` permitido), tabla, memoria de la Lambda, `api_key`, throttling, logs |
| `dynamodb.tf` | Tabla `PK`/`SK` + `GSI1` (`GSI1PK`/`GSI1SK`, `ALL`), PITR |
| `iam.tf` | Rol de la Lambda: logs + Get/Put/Update/Delete/Query/ConditionCheck/BatchGet. **Sin `Scan`** |
| `lambda.tf` | `archive_file` de `backend/dist/handler.js`, función, log group (7 días) |
| `apigateway.tf` | HTTP API, CORS (local), integración proxy v2, ruta `$default`, stage con throttling |
| `s3.tf` | Bucket del sitio (privado, `force_destroy`), policy solo para CloudFront |
| `cloudfront.tf` | OAC, función que reescribe `/ruta` → `/ruta.html`, behavior de `/api/*` sin cache |
| `outputs.tf` | `site_url`, `api_url`, `bucket_name`, `cloudfront_id`, `table_name`, `lambda_name` |
| `bootstrap/` | Bucket del state `spookython-tfstate-<account_id>` (versionado, cifrado, `prevent_destroy`) |

## 2. Secretos y configuración local

| Qué | Dónde vive | Cómo llega a cada integrante |
|---|---|---|
| Nombre del bucket del state y región | `infra/backend.hcl` (gitignored) | Por privado; se copia de `backend.hcl.example` |
| API key de `/paso` | `TF_VAR_api_key` en la terminal | Por privado; nunca en un archivo commiteado |
| Credenciales AWS | `aws configure` de cada uno | Cada integrante con su propio usuario IAM |
| State de Terraform | Bucket S3 remoto con lockfile | Compartido automáticamente |

## 3. Deploy y verificación

### Primer deploy

```bash
npm ci && npm run build -w backend
cd infra
terraform init -backend-config=backend.hcl   # nunca -reconfigure ni -migrate-state
terraform plan -out=tfplan     # primera vez: todo "to add", nada "to destroy"
terraform apply tfplan         # CloudFront tarda 5–15 min la primera vez
terraform output
```

### Cada cambio de backend

```bash
npm run build -w backend
cd infra && terraform plan -out=tfplan
# esperado: "0 to add, 1 to change, 0 to destroy" (solo source_code_hash de la Lambda)
terraform apply tfplan
```

Si el plan muestra cualquier `destroy` o `replace` que no esperabas: **no se aplica**. Se mira con el equipo.

### Cada cambio de frontend

```bash
MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*' NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_API_URL=/api npm run build -w frontend
cat frontend/out/_next/static/chunks/*.js | grep -o 'apiUrl:[^,]\{0,30\}\|useMocks:![01]' | sort -u
# debe imprimir exactamente: apiUrl:"/api"  y  useMocks:!1
aws s3 sync frontend/out/ "s3://$(cd infra && terraform output -raw bucket_name)/" --delete
aws cloudfront create-invalidation --distribution-id "$(cd infra && terraform output -raw cloudfront_id)" --paths "/*"
```

### Verificación rápida en AWS

| Prueba | Esperado |
|---|---|
| `curl <site_url>/api/health` | `{"ok":true,"service":...}` (CloudFront → API → Lambda funciona) |
| `curl -o /dev/null -w "%{http_code}" -X POST <site_url>/api/paso` | `401` (la ruta existe y está protegida) |
| `curl <site_url>/api/estado` con el simulador corriendo | El `turno` sube cada 2 s |

---

## 4. Reglas de diseño de DynamoDB

El modelo concreto (ítems, claves y access patterns) está en `AGENTS.md` §4.2. Estas son las reglas que lo sostienen:

- **Primero las preguntas, después las claves.** Cada endpoint o pantalla → una pregunta concreta → una operación (`GetItem` o `Query`). Si se empieza por las tablas, se termina en `Scan`.
- **Una partición por partida** (`PK = PARTIDA#<id>`): todo lo de una partida sale con un `Query`.
- **Prefijos en `SK`** (`TURNO#`, `RUTA#`, `REFUGIO#`): un `begins_with` responde "todos los X".
- **Números con ceros a la izquierda en claves** (`TURNO#000142`): ordenan bien como texto.
- **`data` como map** con el payload validado por Zod; las claves quedan afuera.
- **Prohibido `Scan`** en producción. Si un patrón lo necesita, el diseño está mal.
- **`ttl` en todos los ítems** para que DynamoDB los borre solos.

### Concurrencia: capacidad de refugios (Pro)

Dos sobrevivientes pueden pedir el último lugar de un refugio al mismo tiempo. Se resuelve con un contador atómico condicional, sin transacciones:

```text
UpdateItem PARTIDA#<id> / REFUGIO#<id>
  SET asignados = asignados + 1
  IF asignados < capacidad
→ ConditionalCheckFailed: el refugio está lleno, se elige el siguiente mejor
```

Test obligatorio: N asignaciones simultáneas sobre K lugares libres → exactamente K éxitos.

---

## 5. Costos y limpieza

| Servicio | Costo en el hackathon |
|---|---|
| DynamoDB on-demand, Lambda, API Gateway, S3, CloudFront | Prácticamente $0 con tráfico de demo (free tier y pago por uso) |
| PITR de DynamoDB | Centavos para una tabla chica |
| ElastiCache (Valkey) | **Cobra desde el minuto uno**: por eso está apagado |
| *Provisioned concurrency* (solo si hace falta en la prueba) | Se cobra mientras está activa: activarla solo durante las rondas y declararla en `docs/costos.md` |

Al terminar: `terraform destroy` en `infra/` (el bucket del sitio tiene `force_destroy`; el del state se queda por `prevent_destroy`). Cada integrante borra sus access keys.

## 6. Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `terraform: command not found` en MSYS2 (UCRT64) | MSYS2 no hereda el PATH de Windows | `export PATH="$PATH:/c/Users/<user>/AppData/Local/Microsoft/WinGet/Packages/Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe"` o usar Git Bash |
| `aws` no se reconoce | Mismo motivo | `export PATH="$PATH:/c/Program Files/Amazon/AWSCLIV2"` |
| `Backend initialization required` | Primera vez en esa máquina | `terraform init -backend-config=backend.hcl` |
| `No value for required variable "api_key"` | Falta exportar la API key | `export TF_VAR_api_key="..."` |
| `No configuration files` | Se corrió Terraform fuera de `infra/` | `cd infra` |
| El mapa no muestra datos reales | Se publicó un build en modo mock | Rebuild con el comando de §3 y verificar `useMocks:!1` |
| `file:///C:/Program%20Files/Git/api/...` en la consola | MSYS convirtió `/api` en una ruta de Windows | `MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*'` en el build |
| `EBUSY ... rmdir frontend/out` | Una terminal o el explorador está parado dentro de `out/` | Salir de esa carpeta y repetir |
| `/api/...` da 404 por CloudFront pero `api_url` responde | Hono perdió `basePath('/api')` | Restaurarlo; `npm test -w backend` lo detecta |
| 404 de `/<ruta>/__next.<algo>.txt` en la consola | Next pide los payloads con puntos y el export los guarda con barras | No rompe (cae a carga completa). Mejora: regla extra en la función de CloudFront |
| `Missing Authentication Token` (XML de `cloudfront.amazonaws.com`) | Se abrió en el navegador el `Location` de una invalidación | No es un error del sitio: el sitio es `site_url` |
| `AccessDeniedException ... service control policy` | La cuenta bloquea esa región por SCP | Cambiar `aws_region` (y `region` en `backend.hcl`) a una región permitida |
| Un push directo a `main` falla con `GH013` | El ruleset funciona | Abrir PR |
