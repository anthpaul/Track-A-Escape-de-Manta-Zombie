# Infra — cómo bootstrapear y deployar

Región `us-east-2` (la de la cuenta del equipo; `us-east-1` solo si la organización la exige, `AGENTS.md` Q1). Requisitos: Terraform `~> 1.9` y AWS CLI v2 con **tu propio** usuario IAM en el perfil `spookython` (`$env:AWS_PROFILE = "spookython"`; ver `CONTRIBUTING.md`). `aws sts get-caller-identity` debe mostrar tu usuario.

## Qué se crea

| Archivo | Recursos |
|---|---|
| `bootstrap/main.tf` | Bucket S3 del state `spookython-tfstate-<account_id>` (versionado, cifrado, privado, `prevent_destroy`) |
| `dynamodb.tf` | Tabla `spookython_mundo` (PK, SK, GSI1), on-demand, PITR |
| `iam.tf` | Rol de la Lambda: logs + DynamoDB sin `Scan` |
| `lambda.tf` | Lambda `nodejs24.x` arm64 1024 MB + log group (7 días) |
| `apigateway.tf` | HTTP API con ruta `$default` → Lambda, throttling 300 rps / burst 600 |
| `s3.tf` | Bucket privado del sitio (solo CloudFront lee, vía OAC) |
| `cloudfront.tf` | Un dominio: `/` → S3, `/api/*` → API sin cache |
| `simulador.tf` | Lambda del simulador (512 MB, 15 min) con permisos mínimos de escritura en la tabla + EventBridge Scheduler que intenta arrancar una ronda demo cada minuto (S6). Ver `tools/simulador/README.md` |

Valkey (`elasticache.tf`) no existe: `enable_valkey` está apagado y no crea nada (ver `AGENTS.md` §1).

## 1. Bootstrap (una sola vez por cuenta, lo hace una sola persona)

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Crea `spookython-tfstate-<account_id>` e imprime `state_bucket`. Su propio state queda local en `infra/bootstrap/terraform.tfstate` (gitignored). Si el bucket ya existe, **no lo corras de nuevo**.

## 2. Primer deploy

```bash
npm ci                         # desde la raíz
npm run build -w backend       # genera backend/dist/handler.js (archive_file lo zipea)

cd infra
cp backend.hcl.example backend.hcl            # pegar el state_bucket real (se pasa por privado)
export TF_VAR_api_key="<mínimo 32 caracteres, se pasa por privado>"
terraform init -backend-config=backend.hcl
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

Verificar:

```bash
curl "$(terraform output -raw site_url)/api/health"                                   # {"ok":true,...}
curl -o /dev/null -w "%{http_code}" -X POST "$(terraform output -raw site_url)/api/paso"  # 401 sin x-api-key
```

> La Lambda usa `basePath('/api')`: el health check es `/api/health` tanto por API Gateway como por CloudFront y en local (`http://localhost:3001/api/health`).

## 3. Deploy del frontend

Ver el comando completo en `INFRA.md` §3 (el build necesita `NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_API_URL=/api`).

## 4. Cambios en el backend

```bash
npm run build -w backend && npm run build:simulador
cd infra && terraform plan -out=tfplan && terraform apply tfplan
```

`source_code_hash` detecta el zip nuevo y actualiza solo la Lambda.

## Reglas

- Siempre `plan` antes de `apply`, y leer el plan.
- Un solo `apply` a la vez: el lock de S3 bloquea al segundo, no lo fuerces con `-lock=false`.
- `.terraform.lock.hcl` se commitea (tiene hashes para Windows, macOS y Linux).
- `backend.hcl`, `*.tfstate` y la API key **nunca** se commitean.
- Al terminar el hackathon: `terraform destroy` en `infra/`. El bucket del state se queda (`prevent_destroy`).
