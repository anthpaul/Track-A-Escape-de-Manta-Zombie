# Costos: estimación y gasto real

**Escenario de referencia: USD 63.69 por 30 días de demo automática y uso ligero
del mapa, antes de créditos, franquicias gratuitas e impuestos.** No es el gasto
real ni un límite de facturación. Las cantidades no medidas son supuestos;
varias tarifas son referencias públicas pendientes de confirmación regional
para una cotización definitiva de Ohio (`us-east-2`).

Fuentes consultadas el **27 de octubre de 2026**. No se accedió a la cuenta AWS,
credenciales ni facturación. Se modela el código del repositorio, no se certifica
la configuración desplegada.

## 1. Supuestos y configuración

| Entrada | Valor del escenario | Procedencia |
|---|---|---|
| Horizonte | 30 días, demo habilitada todo el día | Supuesto; no es la duración real del evento |
| Demo | R2; el Scheduler intenta cada minuto y las rondas quedan casi seguidas (ciclo medio de 5,5 minutos) | Valores por defecto de `infra/variables.tf` |
| Ronda | 300 segundos, 150 turnos de 2 segundos | Supuesto de ronda completa; puede terminar antes |
| Lambda simulador | 512 MB = 0.5 GB, arm64 | `infra/simulador.tf` |
| Lambda API | 1024 MB = 1 GB, arm64 | Valor por defecto de `infra/variables.tf` |
| Duración media facturable API | 100 ms por petición | Supuesto; no es el p95 ni una medición |
| Uso del mapa | 100 horas-navegador mensuales, polling cada 2 s | Supuesto agregado entre todos los usuarios |
| Otras llamadas API | 10,000 consultas de ruta mensuales | Supuesto |
| Archivos estáticos CloudFront | 20,000 peticiones mensuales | Supuesto; ejecutan la función de reescritura |
| Transferencia CloudFront | 10 GB mensuales, incluyendo API y archivos | Supuesto |
| Turno almacenado | Hasta 16 KiB facturables por ítem, incluidas claves y atributos | Supuesto; debe medirse |
| Candado y metadatos | Hasta 1 KiB cada uno | Supuesto |
| DynamoDB: almacenamiento medio | 2 GB tabla; 2 GB base para PITR | Supuesto que contempla retención y demora de TTL |
| S3 | 0.5 GB entre sitio y state/versiones; 10,000 GET y 1,000 PUT/LIST | Supuesto agregado; no se leyó el state |
| CloudWatch Logs | 0.25 GB ingeridos y 0.1 GB-mes archivados | Supuesto; archivo es volumen comprimido medio |
| SNS | 100 publicaciones y 100 entregas email | Supuesto para las alertas descritas en `INFRA.md` |

La demo S6 usa el motor **en proceso**: no genera 80 llamadas HTTP por turno.
Las evaluaciones del CLI, calentamientos, reintentos y pruebas de carga son
consumo adicional y no forman parte de este escenario de demo.

## 2. Tarifas públicas de referencia

USD, modalidad bajo demanda y primer tramo de volumen. Se aplican precios brutos
a todo el consumo para no depender de franquicias o créditos compartidos.

| Unidad | Tarifa usada (USD) | Fuente y alcance |
|---|---|---|
| Lambda arm64, GB-segundo / millón de solicitudes | 0.0000133334 / 0.20 | [Lambda](https://aws.amazon.com/lambda/pricing/); primer tramo que incluye Ohio |
| HTTP API, millón de solicitudes | 1.00 | [API Gateway](https://aws.amazon.com/api-gateway/pricing/); referencia, confirmar tabla Ohio |
| DynamoDB Standard, millón WRU / RRU | 0.625 / 0.125 | [DynamoDB](https://aws.amazon.com/dynamodb/pricing/); referencia, confirmar tabla Ohio |
| DynamoDB Standard, GB-mes | 0.25 | [DynamoDB](https://aws.amazon.com/dynamodb/pricing/); misma reserva regional |
| DynamoDB PITR, GB-mes | 0.20 | [PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamodbDisasterRecoveryStrategy.html); referencia, confirmar Ohio |
| Scheduler, millón de invocaciones | 1.00 | [EventBridge](https://aws.amazon.com/eventbridge/pricing/); sin descontar franquicia |
| CloudFront, GB a internet / 10,000 HTTPS | 0.085 / 0.01 | [CloudFront pay-as-you-go](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/); entrega EE. UU., no tarifa regional Ohio |
| CloudFront Functions, millón de invocaciones | 0.10 | [CloudFront](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/) |
| S3 Standard, GB-mes / 1,000 GET / 1,000 PUT-LIST | 0.023 / 0.0004 / 0.005 | [S3](https://aws.amazon.com/s3/pricing/) y [ejemplo oficial](https://docs.aws.amazon.com/solutions/latest/automated-security-response-on-aws/cost.html); referencia, confirmar Ohio |
| Logs Standard, GB ingerido / GB-mes archivado | 0.50 / 0.03 | [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/); ejemplos de Virginia, no verificación Ohio |
| SNS, millón de publicaciones / 100,000 emails | 0.50 / 2.00 | [SNS](https://aws.amazon.com/sns/pricing/); referencia, confirmar Ohio |
| Budget de seguimiento sin acciones automáticas | 0 | [Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/); no incluye reportes de pago |

CloudFront usa `PriceClass_100`; el precio de entrega de EE. UU. es una referencia,
no se infiere el punto real de entrega por la ubicación del usuario. Para cerrar
la reserva regional, reproducir el escenario en [AWS Pricing Calculator](https://calculator.aws/)
con Ohio y guardar una exportación sin datos personales. No se obtuvo aquí una
cotización regional completa.

## 3. Cálculo visible

Separador decimal con punto en las fórmulas; 1 KiB = 1,024 bytes.

```text
Intentos del Scheduler = 30 dias × 24 horas × 60 minutos = 43,200
Rondas = 43,200 minutos / 5.5 minutos por ciclo = 7,855
Intentos con el candado ocupado = 43,200 - 7,855 = 35,345 (salen en menos de 1 s)
Turnos = 7,855 × 150 = 1,178,250
Polling = 100 horas-navegador × 3,600 / 2 = 180,000 solicitudes
API = 180,000 + 10,000 rutas = 190,000 solicitudes
CloudFront = 190,000 API + 20,000 estaticas = 210,000 solicitudes
```

### DynamoDB: el tamaño del turno importa

[`DynamoPersistencia`](../tools/simulador/dynamo-persistencia.ts) publica cada
turno dos veces mediante transacciones. No cuesta una WRU por turno sin importar
su tamaño: se redondea por operación y las escrituras transaccionales tienen
factor 2. Con turnos de hasta 16 KiB:

```text
WRU por turno = 2 escrituras de turno × 16 KiB × factor transaccional 2
             + 1 actualizacion de candado × 1 KiB × 2
             + 1 actualizacion de metadatos × 1 KiB × 2 = 68
WRU por ronda = 150 × 68 + 4 de inicio/cierre = 10,204
WRU mensuales = 7,855 × 10,204 + 35,345 Put condicionales fallidos = 80,187,765

RRU transaccionales = 7,855 × (150 × 2 + 2 de inicio) = 2,372,210
RRU API = 190,000 × (1 candado + 5 turnos × 16/4) = 3,990,000
RRU totales = 6,362,210
```

Inicio/cierre suma un Put de candado, un Put transaccional de metadatos y un
Delete de candado. Se incluye una comprobación transaccional por turno y otra
al iniciar. Las lecturas HTTP se aproximan como un candado más cinco turnos con
lectura fuerte: [EstadoRepo](../backend/src/db/estado-repo.ts) consulta hasta
cinco ítems. Se asigna el mismo presupuesto de lectura a las rutas para este
modelo, sin afirmar que todas ejecuten exactamente esas operaciones.

Los ítems actuales no contienen `GSI1PK`/`GSI1SK`: no se presuponen entradas del
índice disperso. Si se empiezan a poblar, sumar sus escrituras y almacenamiento.
TTL no garantiza borrado inmediato; almacenamiento y PITR no son gratuitos por
usar serverless.

### Resultado mensual bruto

Cuatro decimales por fila para no ocultar cargos pequeños. Total calculado antes
de redondear, no sumando filas ya redondeadas.

| Componente | Fórmula en USD | Costo mensual |
|---|---|---:|
| Lambda simulador | `7,855 × 0.5 × 300 × 0.0000133334 + 35,345 × 0.5 × 1 × 0.0000133334 + 43,200/1e6 × 0.20` | 15.9544 |
| Lambda API | `190,000 × 1 × 0.1 × 0.0000133334 + 190,000/1e6 × 0.20` | 0.2913 |
| API Gateway | `190,000/1e6 × 1.00` | 0.1900 |
| DynamoDB escrituras | `80,187,765/1e6 × 0.625` | 50.1174 |
| DynamoDB lecturas | `6,362,210/1e6 × 0.125` | 0.7953 |
| DynamoDB almacenamiento | `2 × 0.25` | 0.5000 |
| DynamoDB PITR | `2 × 0.20` | 0.4000 |
| EventBridge Scheduler | `43,200/1e6 × 1.00` | 0.0432 |
| CloudFront | `10 × 0.085 + 210,000/10,000 × 0.01` | 1.0600 |
| CloudFront Functions | `20,000/1e6 × 0.10` | 0.0020 |
| S3 | `0.5 × 0.023 + 10,000/1,000 × 0.0004 + 1,000/1,000 × 0.005` | 0.0205 |
| CloudWatch Logs | `0.25 × 0.50 + 0.1 × 0.03` | 0.1280 |
| SNS | `100/1e6 × 0.50 + 100/100,000 × 2.00` | 0.0021 |
| Budget de seguimiento | Sin acciones automáticas ni reportes de pago | 0.0000 |
| **Total de referencia** | **Redondeado desde 69.5040656** | **69.50** |

### Sensibilidad

El tamaño no se midió. Manteniendo el resto del escenario y escalando el
almacenamiento medio proporcionalmente:

| Turno facturable | Almacenamiento medio | Total mensual bruto |
|---|---:|---:|
| 8 KiB | 1 GB | USD 45.25 |
| 16 KiB | 2 GB | USD 69.50 |
| 32 KiB | 4 GB | USD 118.01 |

Son escenarios, no un intervalo estadístico ni un máximo. Más tráfico, tamaños,
demoras o reintentos pueden superar esos valores. Rondas que terminan antes
reducen duración y escrituras.

**Exclusiones:** evaluaciones HTTP y calentamientos, despliegues e invalidaciones
de pago, transferencias adicionales facturables entre servicios/regiones,
servicios ajenos al repositorio, métricas/alarmas personalizadas, Logs Insights,
backups adicionales/restauraciones, soporte, impuestos, dominio propio y
provisioned concurrency. La transferencia real de API Gateway y la geografía de
entrega de CloudFront requieren validación. CARTO es externo a esta estimación
AWS; no se presupone un contrato comercial.

## 4. Gasto real del evento: pendiente de evidencia

**Todavía no disponible. No se registra como USD 0.00 ni se sustituye por la
estimación mensual.** No se afirma un saldo de créditos o plan gratuito.

Alex o su compañero compartirán una captura o exportación de Billing / Cost
Explorer del período real, sin Account ID, ARN, correos, credenciales ni datos de
otros proyectos. Si hay otras cargas en la cuenta, documentar la atribución:
no adjudicar toda la cuenta al proyecto.

| Dato requerido | Estado |
|---|---|
| Inicio y fin del período, con zona horaria | Pendiente de confirmar |
| Fecha/hora de consulta y fuente | Pendiente de evidencia |
| Consumo por servicio antes de créditos/reembolsos | Pendiente de evidencia |
| Créditos, descuentos, ajustes e impuestos aplicables | Pendiente de evidencia |
| Importe neto atribuible al evento | Pendiente de evidencia |
| Captura/exportación anonimizada | Pendiente de evidencia |

En Cost Explorer: seleccionar el período, agrupar por servicio y registrar
`Unblended cost`, excluyendo créditos/reembolsos para el consumo bruto. Registrar
esos ajustes por separado y conciliar el neto con Billing; no sumar descuentos
dos veces. Los datos recientes pueden estar incompletos: rotular
**provisional al [fecha/hora]**, no factura final.
Fuente: [actualización de Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html).

## 5. Decisiones y controles

- Sin ElastiCache ni NAT en esta arquitectura. No se afirma un ahorro medido de
  rendimiento; no se incluyen recursos que el código no crea.
- La demo evita llamadas HTTP por sobreviviente, pero mantiene una Lambda
  activa y escribe snapshots: tiene costo aunque nadie abra el mapa.
- La API no escribe rutas por cada `/paso`; el simulador publica snapshots.
- PITR está activado en Terraform y se incluye. S3 y logs retenidos pueden
  generar cargos sin tráfico.
- Créditos y franquicias pueden reducir el neto. Se omiten del bruto para no
  depender de elegibilidad, saldo o consumo compartido no verificados.
- El Budget es una alerta, no un tope automático. Ver [captura](budget.png)
  y [descripción](../INFRA.md).

**Estado:** estimación orientativa documentada; quedan pendientes la confirmación
regional de las tarifas señaladas y el gasto real del evento.
