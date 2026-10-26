# Infra — cómo bootstrapear y deployar

Todo en `us-east-2`, cuenta Hold My Coffee. Requisitos: Terraform `~> 1.9`, AWS CLI v2 configurado con tu usuario `<nombre>-dev` (`aws sts get-caller-identity` debe mostrarlo).

## Qué se crea

| Archivo | Recursos |
|---|---|
| `bootstrap/main.tf` | Bucket S3 del state (versionado, cifrado, privado, `prevent_destroy`) |
| `dynamodb.tf` | Tabla `hackathon_alquileres` (PK, SK, GSI1), on-demand, PITR |
| `iam.tf` | Rol de la Lambda: logs + DynamoDB sin `Scan` |
| `lambda.tf` | Lambda `nodejs24.x` arm64 + log group (7 días) |
| `apigateway.tf` | HTTP API con ruta `$default` → Lambda, throttling 20 rps / burst 50 |
| `s3.tf` | Bucket privado del sitio (solo CloudFront lee, vía OAC) |
| `cloudfront.tf` | Un dominio: `/` → S3, `/api/n/*` → API cacheada, `/api/*` → API sin cache |

Valkey (`elasticache.tf`) todavía no está: `enable_valkey` existe pero no crea nada.

## 1. Bootstrap (una sola vez, lo hace una sola persona)

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Crea `alquileres-tfstate-<account_id>`. Su propio state queda local en `infra/bootstrap/terraform.tfstate` (gitignored). Si ya existe el bucket, **no lo corras de nuevo**.

## 2. Primer deploy

```bash
npm ci                         # desde la raíz
npm run build -w backend       # genera backend/dist/handler.js (archive_file lo zipea)

cd infra
terraform init -backend-config=backend.hcl   # conecta al state en S3 (copiar backend.hcl.example)
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

Verificar:

```bash
curl "$(terraform output -raw api_url)/api/health"
```

> La Lambda usa `basePath('/api')`: el health check es `/api/health` tanto por API Gateway como por CloudFront y en local (`http://localhost:3001/api/health`). La respuesta esperada es HTTP 200 con `{"ok":true,"service":"alquileres-api"}`. La prueba local se ejecuta desde la raíz con `npm run test -w backend`, sin credenciales AWS.

## 3. Deploy del frontend

```bash
npm run build -w frontend
aws s3 sync frontend/out/ "s3://$(cd infra && terraform output -raw bucket_name)/" --delete
aws cloudfront create-invalidation --distribution-id "$(cd infra && terraform output -raw cloudfront_id)" --paths "/*"
```

Sitio: `terraform output -raw site_url`.

## 4. Cambios en el backend

```bash
npm run build -w backend
cd infra && terraform plan -out=tfplan && terraform apply tfplan
```

`source_code_hash` detecta el zip nuevo y actualiza solo la Lambda.

## Reglas

- Siempre `plan` antes de `apply`, y leer el plan.
- Un solo `apply` a la vez: el lock de S3 bloquea al segundo, no lo fuerces con `-lock=false`.
- `.terraform.lock.hcl` se commitea (tiene hashes para Windows, macOS y Linux).
- Al terminar el hackathon: `terraform destroy` en `infra/`. El bucket del state se queda (`prevent_destroy`).
