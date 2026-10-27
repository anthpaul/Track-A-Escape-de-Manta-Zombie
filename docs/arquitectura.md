# Arquitectura del sistema

El diagrama describe la implementación del repositorio en `us-east-2`, con
CloudFront como servicio global. Alex informó que S6 está desplegado y funciona;
esta documentación se preparó sin acceder a AWS y no certifica la configuración
actual de la cuenta.

![Arquitectura de la aplicación, la demo y la evaluación](arquitectura.png)

[Abrir la fuente editable en diagrams.net](arquitectura.drawio).
La imagen y el archivo editable contienen los mismos componentes y conexiones;
los conectores indican solicitudes o escrituras, no el sentido de las respuestas.

## Tres recorridos distintos

| Recorrido | Funcionamiento | Qué demuestra |
|---|---|---|
| Mapa | Navegador → CloudFront → S3 para el sitio; `/api/*` → HTTP API → Lambda API → DynamoDB para el estado | Visualización del último turno completo mediante polling cada 2 segundos |
| Demo S6 | Scheduler → Lambda simulador → DynamoDB; el motor se ejecuta dentro del simulador | Movimiento automático sin mantener una PC encendida; no mide HTTP `/paso` |
| Evaluación HTTP | CLI local → CloudFront → HTTP API → Lambda API; el CLI también escribe directamente en DynamoDB | Permite medir latencia, errores y resultados de `/paso` desde el cliente |

## Estado y reglas

- DynamoDB conserva el candado de partida activa, los metadatos y los turnos.
  Las escrituras del simulador verifican la propiedad del candado; una demo no
  reemplaza una partida que ya lo tiene.
- El simulador publica el turno incompleto antes de pedir movimientos y lo
  completa después de resolverlos. El API del mapa sirve el último completo.
- `shared/` aporta el grafo estático y las reglas reutilizadas. Es código
  empaquetado, no otro servicio ni una base de datos en memoria compartida.
- El sitio de S3 es privado mediante OAC. `/api/paso` requiere `x-api-key`;
  `/api/estado` y la consulta de ruta son públicos de solo lectura.
- Ambas Lambdas tienen grupos de CloudWatch Logs. El diagrama no representa
  access logs de API Gateway: el Terraform actual no los configura.

## Valores del repositorio

La demo usa por defecto R2 cada 6 minutos. La Lambda del simulador tiene
512 MB y timeout de 900 segundos; la Lambda API usa por defecto 1024 MB.
Son valores declarados, no mediciones del despliegue. La programación puede
tener intervalos sin una ronda en curso: no se garantiza movimiento continuo
entre el final de una ronda y el inicio de la siguiente.

Antes de evaluar se deshabilitan las demos y se espera a que termine cualquier
ronda en curso, según el procedimiento del simulador. No se deben mezclar sus
métricas con la evaluación HTTP.

## Trazabilidad

| Elemento | Fuente |
|---|---|
| Orígenes, OAC y `/api/*` sin caché | [`infra/cloudfront.tf`](../infra/cloudfront.tf) |
| HTTP API e integración Lambda | [`infra/apigateway.tf`](../infra/apigateway.tf) |
| Lambda del simulador, Scheduler y roles | [`infra/simulador.tf`](../infra/simulador.tf) |
| Valores de demo y memoria API | [`infra/variables.tf`](../infra/variables.tf) |
| Ronda demo con motor interno | [`tools/simulador/lambda.ts`](../tools/simulador/lambda.ts) |
| Escrituras y propiedad del candado | [`tools/simulador/dynamo-persistencia.ts`](../tools/simulador/dynamo-persistencia.ts) |
| Lectura del último turno completo | [`backend/src/db/estado-repo.ts`](../backend/src/db/estado-repo.ts) |
| Evaluación desde el CLI | [`tools/simulador/README.md`](../tools/simulador/README.md) |

El mapa base externo de CARTO y la atribución OpenStreetMap se omiten del
diagrama del backend para mantenerlo legible. No se incluyen secretos,
identificadores de cuenta, ARN ni nombres del bucket de Terraform.
