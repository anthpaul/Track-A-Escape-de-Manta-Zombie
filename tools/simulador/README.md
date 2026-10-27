# Preparación local del simulador

## S4: rondas reproducibles y métricas

Desde la raíz, consultar la ayuda o ejecutar una ronda local de cinco minutos:

```powershell
node --import tsx tools/simulador/correr.ts --help
node --import tsx tools/simulador/correr.ts --ronda=1 --semilla=42
```

| Ronda | Sobrevivientes | Composición | Eventos de prueba |
|---|---:|---|---|
| R1 | 20 | 10 caminantes | Ninguno |
| R2 | 80 | 15 caminantes, 10 corredores y 5 hordas | Colapso del puente real C-0199 en turno 30 |
| R3 | 200 | 20 caminantes, 15 corredores, 8 hordas y 10 dormidos | Bloqueo de C-0051 en turno 20 y C-0101 en turno 60 |

Los tipos y cantidades de sobrevivientes vienen del reto. Las cantidades de
zombies y los turnos concretos de eventos son elecciones de estos escenarios
de prueba, no parámetros oficiales de la organización. Cada ronda ejecuta 150
turnos de dos segundos, incluso si ya no quedan sobrevivientes en ruta, para
mantener la duración y publicar todos los eventos programados. El coordinador
genérico conserva el cierre anticipado para sus consumidores existentes.

La semilla reproduce posiciones y decisiones aleatorias, no latencias de red.
Cada ejecución tiene una identidad de partida distinta; no se reutiliza la
semilla como clave de DynamoDB. El motor local es deliberadamente simple:
respeta calles bloqueadas y zombies visibles, pero no sustituye al A* real ni
sirve para evaluar su supervivencia o rendimiento. La latencia local se muestra
como **no medida**, no como cero milisegundos.

### S6: rondas demo en AWS (Lambda + Scheduler)

`lambda.ts` juega una ronda completa por invocación y escribe cada turno en DynamoDB
con el mismo candado y cerco que `--modo=http`. `infra/simulador.tf` la invoca cada
6 minutos con EventBridge Scheduler (ronda `demo_ronda`, R2 por defecto), así el
mapa público nunca queda congelado. Si otra ronda tiene el candado, la demo sale sin
escribir nada. Las partidas se marcan `demo-r<N>-<epoch>` y `modo: "demo"`.

En modo demo el motor corre **en el mismo proceso** (`motor-en-proceso.ts`, la misma
`calcularSiguienteNodo` que usa `/paso`), sin HTTP: llamar a `/paso` en cada ronda demo
serían millones de pedidos diarios a API Gateway. Las rondas de evaluación siguen
saliendo de `correr.ts --modo=http`, que sí mide el `/paso` real.

Despliegue (lo corre Alex): `npm run build:simulador` y después `terraform plan` /
`apply` como siempre. Probar una ronda a mano:

```powershell
aws lambda invoke --function-name "$(terraform -chdir=infra output -raw simulador_lambda_name)" --invocation-type Event out.json
```

**Antes de una ronda de evaluación**, apagar las demos (`demo_enabled = false` y
`apply`, o `aws scheduler update-schedule ... --state DISABLED`) y esperar a que
termine la demo en curso (hasta 5 minutos, o 30 s si se cortó): el CLI no expulsa
partidas ajenas.

Costo estimado con las demos encendidas todo el día: unos US$ 0,5 de Lambda
(512 MB × ~305 s × 240 rondas) y unos US$ 0,5 de escrituras en DynamoDB, cerca de
**US$ 1 por día**. Es una estimación: confirmar con Cost Explorer.

### Calentamiento antes de cada ronda

En la R3 llegan unos 200 `POST /paso` en la misma ventana de 500 ms. Cada instancia
nueva de Lambda paga un arranque en frío, que sube el p95 y puede pasar de 500 ms.
Justo antes de cada ronda en AWS, con las mismas `PASO_URL` y `PASO_KEY`:

```powershell
node --import tsx tools/simulador/calentar.ts --concurrencia=200 --oleadas=3 --pausa=1000
```

Cada oleada dispara todos los pedidos a la vez; la primera paga los arranques en frío
y las siguientes miden instancias calientes. Termina con código 0 y `LISTO` si la
última oleada no tiene errores y su p95 es de 150 ms o menos; si no, `NO LISTO` y
código 1. Solo llama a `/paso`, que nunca escribe en DynamoDB.

Prueba local contra `npm run dev -w backend`, 50 pedidos por oleada: p95 de 476 ms
en la primera oleada (arranque en frío) y de 142 y 147 ms en las siguientes. No mide
AWS: los números reales salen al correrlo contra el despliegue.

### Evaluación HTTP y DynamoDB

**No ejecutar contra AWS sin autorización del equipo.** Confirmar destino,
tabla, región y perfil; deshabilitar el Scheduler de demo antes de evaluar.
Este CLI no despliega recursos, no deshabilita el Scheduler y no expulsa una
partida activa: si el candado está ocupado, informa que no inició y termina.

Configurar `PASO_URL` con la URL completa de `/api/paso`, `PASO_KEY` con la clave
obtenida por privado, `MUNDO_TABLE` con la tabla del mismo backend, `AWS_REGION`
y `AWS_PROFILE` con el perfil expresamente autorizado. No escribir claves en
archivos del repositorio ni pegarlas en el historial compartido de terminal.

```powershell
# Después de configurar esas variables por el canal privado autorizado:
node --import tsx tools/simulador/correr.ts --ronda=1 --semilla=42 --modo=http
node --import tsx tools/simulador/correr.ts --ronda=2 --semilla=42 --modo=http
node --import tsx tools/simulador/correr.ts --ronda=3 --semilla=42 --modo=http
```

El modo HTTP usa explícitamente el perfil elegido. Primero toma el candado
condicional y crea los metadatos. Por turno publica el mundo incompleto y
renueva el candado antes de pedir pasos; luego publica posiciones, estados y
decisiones finales. Las escrituras transaccionales verifican que la partida
sigue siendo dueña de un candado vigente. Perderlo aborta la ejecución. Al salir
se intenta liberar únicamente el candado de esa misma partida. Los registros
de turnos y metadatos llevan TTL de 24 horas; el candado vence a los 30 segundos.
No hay opción de forzar ni de reemplazar una partida ajena.

Los pedidos del turno comparten una ventana concurrente de 500 ms, no diez lotes
secuenciales de 20. Un timeout aborta la solicitud y cuenta como quedarse
quieto; los temporizadores se cancelan al resolver. La persistencia lenta todavía
puede extender un turno: el siguiente nunca comienza antes de completar el
anterior. No se afirma un límite extremo a extremo de dos segundos sin medir AWS.

### Interpretación de métricas

- Vivos: en ruta + a salvo; se informa también el porcentaje rescatado y los
  mordidos. No se presenta esto como la fórmula oficial de puntuación.
- Eficiencia: promedio de turnos reales hasta llegar dividido por la menor
  cantidad de aristas hasta cualquier refugio en el grafo original, sin zombies
  ni bloqueos. `1x` es óptimo; sin llegadas no existe promedio.
- Latencias: una muestra por llamada HTTP, desde antes de enviar hasta terminar
  de leer y validar el cuerpo, incluidos errores. p50/p95/p99 usan rango más
  cercano (`ceil(p*n)`). No se recortan duraciones para ocultar retrasos.
- Errores: HTTP/red, timeout o movimiento inválido, divididos por llamadas
  efectivamente realizadas. Las entidades a salvo o mordidas no generan llamadas.

### Verificación local

```powershell
node --import tsx --test tools/simulador/*.test.ts
node node_modules/typescript/bin/tsc -p tools/simulador/tsconfig.json
```

Las pruebas usan reloj acelerado, HTTP simulado y un emisor DynamoDB inyectado;
no contactan AWS ni leen credenciales. `npm test` del monorepo no incluye este
directorio. La aceptación de S4 requiere además una R1 real contra AWS con
métricas: la implementación local no constituye esa evidencia.

## Preparación inicial (S1)

Este primer paso carga y valida `shared/data/manta.json`, prepara el turno cero
y valida las entidades iniciales usando los schemas de `shared/`.

## Verificación

Desde la raíz del repositorio, con las dependencias existentes instaladas:

```powershell
node --import tsx --test tools/simulador/preparar.test.ts
node node_modules/typescript/bin/tsc -p tools/simulador/tsconfig.json
```

## Uso desde TypeScript

```ts
import { prepararPartida } from "./preparar";

const partida = await prepararPartida({
  semilla: 42,
  zombies: [],
  sobrevivientes: [],
});
```

Las cantidades y posiciones se reciben explícitamente; no son todavía las rondas
oficiales. Cada zombie usa `{ id, tipo, nodo }` y cada sobreviviente
`{ id, nodo, estado: "en_ruta" }`. Los nodos deben existir y los IDs no pueden
repetirse dentro de cada grupo. La semilla es un entero entre 0 y 4294967295.
El generador `partida.aleatorio()` produce la misma secuencia para la misma
semilla; se utilizará al implementar movimiento. Preparar no mueve entidades.

El mundo interno conserva los dormidos: no es un snapshot público de `/estado`.
La función `prepararPartida` por sí sola no llama HTTP ni escribe en DynamoDB;
el coordinador y el ejecutor S4 descritos arriba conectan los pasos posteriores.
