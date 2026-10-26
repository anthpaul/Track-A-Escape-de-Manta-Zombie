# INFRA.md — Infraestructura y diseño de DynamoDB

Receta probada en el hackathon de práctica: un dominio de CloudFront sirve el sitio estático y la API, una Lambda con Hono atiende todo `/api/*`, y DynamoDB guarda todo en una sola tabla. **No se rediseña para el reto nuevo:** se copia `infra/`, se cambian 3 valores y se deploya. Lo único que depende del reto es el modelo de datos (§4).

## Quick path (30 minutos, lo hace Alex)

1. Copiar la carpeta `infra/` del repo de práctica al repo nuevo (sin `.terraform/`, `*.tfstate`, `tfplan` ni `build/`).
2. Cambiar los 3 valores de §2.
3. Desde la raíz: `npm ci`, `npm run build -w backend`.
4. En `infra/`: copiar `backend.hcl.example` a `backend.hcl` con el bucket real, `terraform init -backend-config=backend.hcl`, `terraform plan -out=tfplan`, leer el plan, `terraform apply tfplan`.
5. Verificar: `curl "$(terraform output -raw site_url)/api/health"` → `{"ok":true,...}`.

---

## 1. Arquitectura

```text
                         ┌──────────────── CloudFront (un solo dominio) ────────────────┐
 celular / navegador ──▶ │  /*          → S3 (sitio estático, privado, OAC)              │
                         │  /api/n/*    → API Gateway (cache según Cache-Control, ≤300s) │
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

| Archivo | Recursos | Qué cambiar por reto |
|---|---|---|
| `main.tf` | Providers, backend S3 del state, tags por defecto | `key` del state (§2) |
| `variables.tf` | `project`, `env`, región (validada = `us-east-2`), tabla, throttling, logs | `project`, `table_name` |
| `dynamodb.tf` | Tabla `PK`/`SK` + `GSI1` (`GSI1PK`/`GSI1SK`, `ALL`), PITR | Nada (el modelo vive en el código) |
| `iam.tf` | Rol de la Lambda: logs + Get/Put/Update/Delete/Query/ConditionCheck/BatchGet. **Sin `Scan`** | Solo si un access pattern necesita otra acción |
| `lambda.tf` | `archive_file` de `backend/dist/handler.js`, función, log group (7 días) | Nada |
| `apigateway.tf` | HTTP API, CORS, integración proxy v2, ruta `$default`, stage con throttling | Nada |
| `s3.tf` | Bucket del sitio (privado, `force_destroy`), policy solo para CloudFront | Nada |
| `cloudfront.tf` | OAC, función que reescribe `/ruta` → `/ruta.html`, behaviors de `/api` | Los `path_pattern` si cambia el prefijo público cacheable |
| `outputs.tf` | `site_url`, `api_url`, `bucket_name`, `cloudfront_id`, `table_name`, `lambda_name` | Nada |
| `bootstrap/` | Bucket del state (versionado, cifrado, `prevent_destroy`) | **No se vuelve a correr**: el bucket ya existe |

## 2. Los 3 valores que se cambian

| Dónde | Valor actual (práctica) | Valor para el reto |
|---|---|---|
| `main.tf` → `backend "s3"` → `key` | `infra/terraform.tfstate` | `spookython/terraform.tfstate` ✓ ya aplicado |
| `variables.tf` → `project` | `alquileres` | `spookython` ✓ ya aplicado |
| `variables.tf` → `table_name` | `hackathon_alquileres` | `spookython_mundo` ✓ ya aplicado |

**Por qué un `key` nuevo:** con el mismo `key`, Terraform vería la infra de práctica como "la actual" y propondría reemplazarla. Con un `key` nuevo se crea todo de cero, al lado. Si ya no se usa la infra de práctica, se destruye **desde su carpeta** con su state (`terraform destroy`) para no pagar de más.

## 3. Deploy y verificación

### Primer deploy

```bash
npm ci && npm run build -w backend
cd infra
terraform init -backend-config=backend.hcl   # nunca -reconfigure ni -migrate-state
terraform plan -out=tfplan     # primera vez: "17 to add, 0 to change, 0 to destroy"
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
| `curl -o /dev/null -w "%{http_code}" <site_url>/api/me/<algo>` | `401` (la ruta existe y está protegida) |
| Una acción real en el sitio | Aparece el ítem en DynamoDB (consola → tabla → Explore items) |

---

## 4. Método para diseñar DynamoDB desde cualquier reto

DynamoDB no se diseña como SQL. **Primero se listan las preguntas que hace la app, después se eligen las claves que las responden.** Si se empieza por las tablas, se termina en `Scan`.

### 4.1 Los 6 pasos

| Paso | Qué hacer | Resultado en AGENTS.md |
|---|---|---|
| 1. Usuarios y acciones | Por cada usuario del enunciado, escribir qué lee y qué escribe | — |
| 2. Entidades | Sustantivos que se guardan (negocio, artículo, reserva, turno, pedido...) | §4.1 |
| 3. Access patterns | Cada pantalla o endpoint → una pregunta concreta ("reservas del negocio X que empiezan el día D") | §4.2 |
| 4. Claves | El "dueño" de los datos va en `PK`; lo que se lista o filtra por rango, en `SK` con prefijo y orden útil (fechas ISO primero) | §4.1 |
| 5. Índice | GSI1 solo para preguntas que la tabla base no responde. Nunca como fuente de verdad para reglas críticas (es eventualmente consistente) | §4.1 |
| 6. Concurrencia y estados | Qué recurso es escaso (stock, turno, cupo) y qué transiciones existen | §4.3, §4.4 |

### 4.2 Reglas de diseño

- **Una partición por dueño de datos** (`PK = NEGOCIO#<id>`): todo lo del negocio sale con un `Query`, y aislar dueños es trivial (cada uno solo toca su `PK`).
- **Prefijos en `SK`** (`ARTICULO#`, `RESERVA#<fecha>#<id>`): un `begins_with` responde "todos los X" o "los X de tal día".
- **ISO 8601 en claves de fecha:** ordenan como texto (`2026-10-31` > `2026-10-30`).
- **Ids ULID** generados en el servidor: únicos y ordenables por tiempo.
- **`data` como map** con el payload validado por Zod; las claves quedan afuera.
- **Prohibido `Scan`** en producción. Si un patrón lo necesita, el diseño está mal.
- **Datos viejos sin migración:** un campo nuevo se completa con su valor por defecto al **leer**, no con un `.default()` en el schema.

### 4.3 Ejemplo resuelto (práctica: alquileres)

| Entidad | PK | SK | GSI1PK / GSI1SK | `data` |
|---|---|---|---|---|
| Negocio | `NEGOCIO#<id>` | `METADATA` | — | nombre, slug, whatsapp, dirección, ownerToken |
| Artículo | `NEGOCIO#<id>` | `ARTICULO#<id>` | `ARTICULO_DISPONIBLE#<negocio>` / `<categoria>#<nombre>` | nombre, categoría, precioPorDia, fotos, activo, **cantidad** |
| Reserva | `NEGOCIO#<id>` | `RESERVA#<fechaInicio>#<id>` | `ARTICULO#<articulo>` / `RESERVA#<inicio>#<fin>` | cliente, fechas, **estado**, total |

| Pregunta | Operación |
|---|---|
| Negocio por id | `GetItem PK=NEGOCIO#<id>, SK=METADATA` |
| Catálogo del negocio | `Query PK=NEGOCIO#<id>, SK begins_with ARTICULO#` |
| Reservas que empiezan el día D | `Query PK=NEGOCIO#<id>, SK begins_with RESERVA#<D>#` |
| Disponibilidad / reglas | `Query PK=NEGOCIO#<id>, SK begins_with RESERVA#` con `ConsistentRead` + función pura de `shared/` |
| Auth del dueño | El token es `<negocioId>.<secreto>` → `GetItem` del negocio y comparación en tiempo constante |

### 4.4 Patrón de concurrencia (recurso escaso)

Sirve para stock, turnos, cupos, mesas: cualquier cosa donde dos usuarios pueden pedir lo último al mismo tiempo.

```text
loop (hasta 12 intentos, espera aleatoria corta entre intentos):
  recurso   = GetItem(ConsistentRead)              → data + version
  ocupación = Query tabla base (ConsistentRead, todas las páginas)
  si regla_pura(recurso, ocupación, pedido) falla → 409 (error de negocio claro)
  TransactWriteItems:
    Update recurso  IF data = :data AND version = :version   SET version = version + 1
    Put    pedido   IF attribute_not_exists(SK)
  si TransactionCanceled por la condición del recurso → reintentar
agotado → 500 (nunca disfrazarlo de "ocupado")
```

- La **versión** serializa los pedidos sobre el mismo recurso: de dos simultáneos, uno gana y el otro relee y vuelve a validar.
- Las **transiciones de estado** usan `UpdateItem` con `ConditionExpression #data.#estado IN (:desde...)`.
- Liberar un recurso (cancelar, devolver) no necesita la versión: nunca puede causar una sobreventa.
- Tests obligatorios: N pedidos simultáneos por las últimas K unidades → exactamente K éxitos.

### 4.5 Formas típicas de reto y su punto de partida

| Si el reto es de... | Recurso escaso | Partición | SK útiles |
|---|---|---|---|
| Reservas / alquileres | Unidades por fecha | Negocio | `ITEM#`, `RESERVA#<fecha>#` |
| Turnos / citas | Franja horaria | Local o profesional | `TURNO#<fecha>T<hora>#` |
| Pedidos / delivery | Stock o capacidad de cocina | Negocio | `PRODUCTO#`, `PEDIDO#<fecha>#`, estado en `data` |
| Inscripciones / cupos | Cupos del evento | Evento | `INSCRIPCION#<id>` + contador con versión |
| Reportes / incidencias | — (no hay escasez) | Organización o zona | `REPORTE#<fecha>#`, GSI por estado |

---

## 5. Costos y limpieza

| Servicio | Costo en el hackathon |
|---|---|
| DynamoDB on-demand, Lambda, API Gateway, S3, CloudFront | Prácticamente $0 con tráfico de demo (free tier y pago por uso) |
| PITR de DynamoDB | Centavos para una tabla chica |
| ElastiCache (Valkey) | **Cobra desde el minuto uno**: por eso está apagado |

Al terminar: `terraform destroy` en `infra/` (el bucket del sitio tiene `force_destroy`; el del state se queda por `prevent_destroy`). Cada integrante borra sus access keys.

## 6. Troubleshooting (casos reales)

| Síntoma | Causa | Solución |
|---|---|---|
| `terraform: command not found` en MSYS2 (UCRT64) | MSYS2 no hereda el PATH de Windows | `export PATH="$PATH:/c/Users/<user>/AppData/Local/Microsoft/WinGet/Packages/Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe"` o usar Git Bash |
| `aws` no se reconoce | Mismo motivo | `export PATH="$PATH:/c/Program Files/Amazon/AWSCLIV2"` |
| `Backend initialization required` | Primera vez en esa máquina | `terraform init -backend-config=backend.hcl` |
| `No configuration files` | Se corrió Terraform fuera de `infra/` | `cd infra` |
| El sitio no guarda nada en DynamoDB | Se publicó un build en modo mock | Rebuild con el comando de §3 y verificar `useMocks:!1` |
| `file:///C:/Program%20Files/Git/api/...` en la consola | MSYS convirtió `/api` en una ruta de Windows | `MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*'` en el build |
| `EBUSY ... rmdir frontend/out` | Una terminal o el explorador está parado dentro de `out/` | Salir de esa carpeta y repetir |
| `/api/...` da 404 por CloudFront pero `api_url` responde | Hono perdió `basePath('/api')` | Restaurarlo; `npm test -w backend` lo detecta |
| 404 de `/<ruta>/__next.<algo>.txt` en la consola | Next pide los payloads con puntos y el export los guarda con barras | No rompe (cae a carga completa). Mejora: regla extra en la función de CloudFront |
| `Missing Authentication Token` (XML de `cloudfront.amazonaws.com`) | Se abrió en el navegador el `Location` de una invalidación | No es un error del sitio: el sitio es `site_url` |
| `AccessDeniedException ... service control policy` | Región `us-east-1` | Usar `us-east-2` |
| Un push directo a `main` falla con `GH013` | El ruleset funciona | Abrir PR |
