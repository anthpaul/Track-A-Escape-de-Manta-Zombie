# Arquitectura del sistema

El diagrama describe la implementación del repositorio en `us-east-2`, con
CloudFront como servicio global, tal como está desplegada el 28 de octubre de 2026
(verificado con consultas de solo lectura a la cuenta: Lambdas, Scheduler y Budget).

![Arquitectura de la aplicación, la demo y la evaluación](arquitectura.png)

[Abrir la fuente editable en diagrams.net](arquitectura.drawio).
La imagen y el archivo editable contienen los mismos componentes y conexiones;
los conectores indican solicitudes o escrituras, no el sentido de las respuestas.

El paso a paso de un turno (simulador, motor y mapa) está en
[el diagrama de flujo](flujo-turno.drawio).

## Tres recorridos distintos

| Recorrido | Funcionamiento | Qué demuestra |
|---|---|---|
| Mapa | Navegador → CloudFront → S3 para el sitio; `/api/*` → HTTP API → Lambda API → DynamoDB para el estado | Visualización del último turno completo mediante polling cada 2 segundos |
| Demo S6 | Scheduler → Lambda simulador → DynamoDB; el motor se ejecuta dentro del simulador, con la flota de rescate, y las rondas se encadenan | Movimiento automático sin mantener una PC encendida; no mide HTTP `/paso` |
| Evaluación HTTP | Operador (`tools/demo/demo.sh evaluar`) → Lambda simulador → HTTP API → Lambda API; el simulador escribe cada turno en DynamoDB | Mide latencia, errores y resultados de `/paso` desde la misma región, tras calentar el API |

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

La demo usa por defecto R2; el Scheduler intenta cada minuto y, cuando una ronda
termina, la misma Lambda arranca la siguiente mientras le alcance el tiempo para una
ronda completa. La Lambda del simulador tiene 1024 MB (2048 MB solo durante la prueba
de fuego, con `demo.sh modo-prueba`) y timeout de 900 segundos; la Lambda API tiene
1024 MB.

Antes de evaluar se deshabilitan las demos (`demo.sh modo-prueba`) y
`demo.sh evaluar` espera a que termine cualquier ronda en curso. Las métricas de la
demo no se mezclan con las de la evaluación HTTP.

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
| Evaluación desde AWS y calentamiento | [`tools/simulador/lambda.ts`](../tools/simulador/lambda.ts), [`tools/demo/demo.sh`](../tools/demo/demo.sh) |

El mapa base externo de CARTO y la atribución OpenStreetMap se omiten del
diagrama del backend para mantenerlo legible. No se incluyen secretos,
identificadores de cuenta, ARN ni nombres del bucket de Terraform.
