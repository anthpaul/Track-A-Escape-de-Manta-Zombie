# Rondas de evaluación dentro de AWS, con calentamiento

Objetivo: que la prueba de fuego mida `POST /paso` sin internet de por medio y sin arranques en frío en el primer turno.
Rama: `feat/evaluacion-en-aws` · Entrega: un PR con commits por unidad · Tests: `npx tsx --test tools/simulador/*.test.ts`.

## Specs

- **S1** La Lambda del simulador acepta `{ "ronda": 1|2|3, "semilla": n, "modo": "evaluacion" }`. En ese modo llama a `POST /paso` **por HTTP** (`MotorHttp`, URL y key desde el entorno) y usa una partida `evaluacion-r<n>-…`, con los 150 turnos completos. Sin `modo` (o `"demo"`) se comporta como hoy.
- **S2** Antes del turno 1, la ronda de evaluación se calienta sola: oleadas simultáneas de tantos pedidos como sobrevivientes tenga la ronda (20, 80 o 200), con una instancia de motor aparte para que esas latencias no se mezclen con las de la ronda.
- **S3** La respuesta de la invocación trae el calentamiento por oleada y las métricas de la ronda: p50/p95/p99, errores, tasa de error, eficiencia, turnos. El panel ve el p95 en vivo (`medirP95`).
- **S4** Terraform: la Lambda del simulador recibe `PASO_URL` (API Gateway directo + `/api/paso`, misma región) y `PASO_KEY` (= `var.api_key`, sensible, nunca en un archivo commiteado).
- **S5** Documentar cómo correr la prueba de fuego (pausar demos, `aws lambda invoke` R1 → R2 → R3, leer la respuesta) y cómo se mide la latencia.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S1, S2, S3 | inline | hecho (49 tests, bundle carga sin efectos) | 53b7ff8 |
| T2 | S4, S5 | inline | hecho (terraform validate, prueba en seco de demo.sh) | ver log |

Risk: item 2 (la key de `/paso` pasa a una segunda Lambda) e item 5 (cambio de infra en producción).

## Log

- **L1** (27 oct, Anthony): "vamos implementa" — sobre la recomendación: "1 Correr las rondas de evaluación dentro de AWS … 2 Calentamiento automático antes de cada ronda"; provisioned concurrency queda como seguro opcional.
- **L2** Evidencia: `calentar.ts` desde la laptop dio oleada 1 con 192 errores (~527 ms, arranques en frío) y p95 214–241 ms en oleadas calientes; la Lambda del API tarda 44–70 ms (p95) y la conexión laptop → us-east-2 cuesta ~76 ms. La cuota de concurrencia ya es 1000.
- **L3** T2: `demo.sh evaluar` probado con un `aws` falso. La prueba encontró que `MSYS_NO_PATHCONV=1` también deja sin traducir las rutas temporales: `aws`/`node` de Windows buscaban `/tmp/...` en `C:/tmp`. Afectaba a `evaluar`, `ronda` y `pausar`/`reanudar` (`file://`); se arregló con `cygpath -w`. Sin verificar contra AWS: falta `terraform apply` y una corrida real.
