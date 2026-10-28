# Demo en vivo — viernes 30 de octubre, ULEAM

Guion operativo de la demo: 5 minutos de pitch y 3 de preguntas, con la laptop de Anthony. **La laptop solo muestra y dispara; todo corre en AWS.** El mapa se abre desde la URL pública y las rondas las juega la Lambda del simulador, así que si la laptop se reinicia, la demo sigue.

Todos los comandos se corren **desde la raíz del repo, en Git Bash**, con el perfil `spookython`:

| Comando | Qué hace |
|---|---|
| `tools/demo/demo.sh estado` | Ronda, turno, en ruta, a salvo, mordidos y p95 de lo que muestra el mapa ahora |
| `tools/demo/demo.sh pausar` | Apaga las rondas demo automáticas; la que está corriendo termina sola (hasta 5 min) |
| `tools/demo/demo.sh ronda 3 42` | Arranca ya una ronda R3 con semilla 42; necesita que ninguna otra ronda esté corriendo |
| `tools/demo/demo.sh reanudar` | Vuelve a prender las rondas demo automáticas |
| `tools/demo/demo.sh evaluar 3 42` | Ronda de **evaluación** R3 con semilla 42: calienta el API, juega 150 turnos llamando a `/paso` por HTTP desde AWS y muestra supervivencia, p95 y errores (espera unos 5 minutos) |

## Antes del viernes

| Qué | Cuándo | Estado |
|---|---|---|
| Ensayar `pausar`, `ronda 3 42` y `reanudar` con este guion completo | Jueves | ⬜ |
| Pitch en PDF y video de respaldo **descargados** en la laptop | Jueves | ⬜ |
| Navegador actualizado con WebGL; hotspot del celular probado con ese navegador | Jueves | ⬜ |
| API key de `/paso` en el gestor de contraseñas (nunca en una diapositiva) | Jueves | ⬜ |
| Cargador y adaptador HDMI | Viernes | ⬜ |
| Aumento de concurrencia de Lambda a 1000 | 27 oct | ✅ aplicado |
| Prueba de fuego completa: `pausar`, luego `evaluar 1`, `evaluar 2` y `evaluar 3`, y anotar los resultados en el README | Jueves | ⬜ |

## Antes de subir al escenario

1. **30 minutos antes.** Abrir tres pestañas: el [mapa en vivo](https://d2pm91xddlib8g.cloudfront.net/mapa), el README en GitHub y CloudWatch con las métricas de la Lambda del API. Correr `tools/demo/demo.sh estado` y confirmar que el mapa dice **EN VIVO**.
2. **8 minutos antes.** `tools/demo/demo.sh pausar`. La ronda demo que esté corriendo termina sola, en 5 minutos como máximo.
3. **Al presentarse, unos 20 segundos antes de mostrar el mapa.** `tools/demo/demo.sh ronda 3 42`. El comando espera unos segundos y muestra el estado: tiene que decir `R3 · turno ...`. Si sigue diciendo `R2`, la ronda anterior todavía tiene el candado: esperar unos segundos y repetir.

La R3 juega 200 sobrevivientes con todos los tipos de zombies. El motor corre dentro de la Lambda del simulador, así que funciona aunque la cuenta siga con el límite de 10 ejecuciones simultáneas.

## Guion de 5 minutos

| Tiempo | Qué se muestra | Qué se dice |
|---|---|---|
| 0:00 – 0:45 | Diapositiva del problema | Rutear a muchas personas sobre un mapa que cambia mientras se mueven: delivery, ambulancias, evacuación por tsunami en Manabí |
| 0:45 – 1:30 | Mapa en vivo, R3 recién empezada | 200 sobrevivientes en Tarqui, Los Esteros, Barbasquillo y Jocay; un ícono por tipo de zombie; 4 refugios reales; el panel con ronda, turno y supervivencia |
| 1:30 – 2:15 | Pestaña Sobrevivientes: elegir uno en ruta | El mapa lo sigue y dibuja su ruta planificada; la flecha corta de cada sobreviviente apunta a su siguiente paso |
| **~2:00** | **Turno 60: se bloquea la calle C-0101** (la primera, C-0051, se bloqueó a los 40 s) | La calle se pone roja, llega la alerta y en el turno siguiente las rutas se desvían: el motor recalcula en cada pedido, no guarda rutas viejas |
| 2:15 – 3:30 | Diagrama de arquitectura | `POST /paso` con A* sobre el turno en DynamoDB, presupuesto de 300 ms con paso seguro, horda que bloquea su nodo y sus vecinos, predicción de corredores, escape cuando no hay refugio alcanzable |
| 3:30 – 4:30 | Tabla de resultados del README y CloudWatch | Lo que medimos: supervivencia por ronda, p95 de 25 ms ya caliente, y el diagnóstico honesto de la primera R1 contra AWS (límite de concurrencia de la cuenta) |
| 4:30 – 5:00 | Costos | Budget con alertas desde el primer día y costo mensual estimado (`docs/costos.md`) |

Sobre el p95 del panel: en las rondas demo aparece **"—"**, porque el motor corre dentro de la Lambda y no pasa por `/paso`. Mostrar el p95 en vivo requiere una ronda `--modo=http` desde la CLI (`tools/simulador/README.md`). Hacerlo solo si AWS ya aprobó el aumento de concurrencia y se ensayó el jueves; si no, mostrar los números del README.

## Después de la demo

`tools/demo/demo.sh reanudar`, para que la URL pública siga mostrando rondas hasta el final del evento.

## Plan B

| Falla | Respuesta |
|---|---|
| El wifi de la ULEAM no anda | Hotspot del celular |
| Sin internet ni hotspot | Video de respaldo y capturas del README |
| `ronda 3` no arranca (sigue `R2`) | Mostrar la ronda R2 que ya está corriendo: también tiene corredores, hordas y un puente que colapsa en el turno 30 |
| `pausar` falla | No insistir: mostrar la ronda demo que esté corriendo |
| El mapa dice SIN CONEXIÓN | Sigue moviéndose con la simulación local y lo dice en pantalla: explicarlo y pasar al diagrama |
| Piden un `curl` a `/paso` en vivo | Cargar la key sin mostrarla (`read -rs KEY`) y usar el ejemplo de "Cómo probar" del README con `-H "x-api-key: $KEY"` |

## Preguntas probables

| Pregunta | Quién | Respuesta corta |
|---|---|---|
| ¿Por qué no guardan el estado en la memoria de la Lambda? | Kevin | Cambia cada turno y lo comparten todas las instancias: vive en DynamoDB, con caché por número de turno. En memoria solo está el grafo, que no cambia |
| ¿Cómo garantizan responder en menos de 500 ms? | Kevin | Presupuesto interno de 300 ms; si se pasa o falla, responde un paso seguro. Ya caliente, el p95 es de 25 ms |
| ¿Y los vecinos de la horda? | Kevin | Prohibidos, igual que su nodo: es una trampa del reto que cubrimos con tests |
| ¿Recalculan la ruta o la guardan? | Kevin | Se recalcula en cada pedido con los zombies del turno; ninguna ruta se guarda |
| ¿Arranques en frío en la R3? | Alex | Calentamiento antes de cada ronda (`calentar.ts`), Lambda de 1 GB y bundle chico. El límite de concurrencia de la cuenta está pedido a AWS |
| ¿Cuánto cuesta? | Anthony | `docs/costos.md`; Budget de US$ 20 con alertas por SNS |
| ¿Por qué el mapa no se congela? | Anthony | EventBridge Scheduler intenta arrancar una ronda demo cada minuto en una Lambda aparte: las rondas quedan casi seguidas. Una ronda demo termina cuando ya no queda nadie en camino, y entre ronda y ronda el mapa muestra el último turno real con "Esperando la próxima ronda" |
