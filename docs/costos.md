# Costos

<!-- TODO (Alex): completar con los recursos reales tras el primer deploy y actualizar el gasto real después de la prueba de fuego. -->

La cuenta está en el plan gratuito de AWS: el uso del evento se descuenta de los créditos. Abajo se declara el costo **sin créditos**, que es lo que costaría en una cuenta normal.

## 1. Costo mensual estimado

Supuestos de tráfico: `TODO` (por ejemplo, N partidas por día × 5 min × 200 sobrevivientes × 1 pedido cada 2 s).

| Servicio | Unidad de cobro | Cantidad mensual | Precio unitario (us-east-2) | Costo |
|---|---|---|---|---|
| Lambda (arm64, 1024 MB) | Pedidos + GB-segundo | `TODO` | `TODO` | `TODO` |
| API Gateway HTTP API | Millón de pedidos | `TODO` | `TODO` | `TODO` |
| DynamoDB on-demand | Lecturas y escrituras | `TODO` | `TODO` | `TODO` |
| CloudFront | GB transferidos + pedidos | `TODO` | `TODO` | `TODO` |
| S3 | GB almacenados + pedidos | `TODO` | `TODO` | `TODO` |
| CloudWatch Logs | GB ingeridos | `TODO` | `TODO` | `TODO` |
| SNS (alertas del Budget) | Notificaciones | `TODO` | `TODO` | `TODO` |
| **Total** | | | | **`TODO`** |

Cálculo visible: `TODO` (una línea por servicio, por ejemplo `pedidos × precio por millón`).

## 2. Gasto real del evento

| Fecha | Fuente | Gasto |
|---|---|---|
| `TODO` | Cost Explorer (sin créditos) | `TODO` |

## 3. Decisiones que bajan el costo

- ElastiCache apagado: cobraría desde el primer minuto sin mejorar el p95 de forma medible.
- Todo serverless y on-demand: sin tráfico, el costo es prácticamente cero.
- *Provisioned concurrency* solo durante la prueba de fuego, si hace falta.
