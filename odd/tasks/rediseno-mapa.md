# Rediseño del mapa en vivo (señales, leyenda, panel, ayuda, móvil)

Objetivo: llevar el mapa en vivo al diseño de las 5 imágenes que mandó Anthony (27 oct), para que se entienda sin explicación (Producto, 15 %).
Rama: `feat/mapa-rediseno` · Entrega: un PR con commits por unidad · Tests: `npm test -w frontend` (node:test + tsx).

## Specs

- **S1** Señales de tránsito (imagen "5A Señales de tránsito"): "Usa los símbolos que la gente ya conoce: el disco de prohibido el paso y el triángulo de peligro. Es la opción más fácil de entender."
  - Calle bloqueada: línea roja con un tope en cada extremo y un disco rojo de prohibido el paso (barra blanca) en el medio.
  - Puente: doble línea celeste. Puente dañado: doble línea naranja punteada con un triángulo de peligro naranja en el medio.
  - Al tocar un puente o calle cortada, una tarjeta: "Puente dañado" / "Nadie puede cruzar desde el turno 21" (el turno es el primero en que el front la vio bloqueada).
  - Leyenda de la imagen: "Calle", "Puente", "Calle bloqueada", "Puente dañado".
- **S2** Leyenda (imagen 2): grupos "PERSONAS" (Sobreviviente, Mordido), "PELIGRO" (Zombie, "Horda (zona peligrosa)"), "LUGARES Y CALLES" (Refugio, "Refugio sin acceso", "Calle cerrada", "Ruta elegida"); botón píldora con tres puntos (celeste, rosa, naranja) "Cerrar leyenda"; cerrada, la píldora dice "Leyenda". Imagen 5: "Abre la leyenda cuando la necesites. Se cierra sola para no tapar el mapa."
- **S3** Panel (imagen 3): arriba "Ronda 2 · Turno 23" y "En vivo"; tres cifras "a salvo" (celeste), "en camino" (blanco), "mordidos" (rosa). Alertas agrupadas por turno ("ESTE TURNO · 23", "TURNO 22") con título y detalle en lenguaje claro, por ejemplo "7 sobrevivientes mordidos" / "La mayoría cerca del Aeropuerto Eloy Alfaro", "Nueva horda en Jaramijó" / "El Faro de Jaramijó quedó sin acceso", "2 llegaron a Universidad ULEAM" / "Ya son 20 a salvo", "Se cerró una calle en Tarqui" / "3 sobrevivientes cambiaron de camino", "4 sobrevivientes mordidos" / "Zona centro". Se mantiene el riel de 4 pestañas (respuesta de Anthony: "Mantener el riel").
- **S6** Notificaciones (imagen de la barra): píldora arriba al centro "TURNO 23 · 7 mordidos · 1 horda nueva · 2 llegaron" con "Ver qué pasó" y ×, en lugar del cartel rojo. Pedido: "quiero que se vean asi las notificaciones".
- **S7** Pestaña Refugios (imagen del panel): filas con nombre, "20 / 200", barra fina y una línea de estado: "3 en camino · 1 en peligro", "1 en camino", "Sin acceso: hay una horda en la entrada".
- **S4** Ayuda guiada (imágenes 3–5), tarjetas "1 DE 4" con "Saltar", "Atrás", "Siguiente" y puntos de progreso:
  1. "Así va la partida" — "Arriba ves cuántos están a salvo, en camino y mordidos. Abajo, cada refugio y quién va hacia él."
  2. "Toca un punto celeste" — "Cada punto celeste es un sobreviviente. Tócalo para ver a dónde va y su camino."
  3. "¿Qué significa cada color?" — "Abre la leyenda cuando la necesites. Se cierra sola para no tapar el mapa."
  4. `TODO:` paso 4 no llegó en las imágenes.
- **S5** Diseño móvil: `TODO:` Anthony no pudo mandar la imagen.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S1 | inline | hecho (120 tests, capturas) | 187efce |
| T2 | S2 (L7) | inline | rehecho (captura) | ver log |
| T3 | S3, S6, S7 | inline | hecho (126 tests, capturas) | ver log |
| T4 | S4 | inline | bloqueada por paso 4 | |
| T5 | S5 | inline | bloqueada por imagen | |

## Log

- **L1** (27 oct, Anthony): "te paso como quiero que se vea en caso de calle bloqueadas y punetes danados y calles blolqueadas y te mando como quiero que sea el rediseno de la interfaz asi se ve la leyenda y te mando como se ve la parte de ayuda y ademas te envio como seria el diseno movil pero no te lo puedo enviar"
- **L2** Decisión: arrancar por T1 y T2, que no dependen de nada abierto. El naranja del puente dañado repite el de los zombies; se respeta el diseño porque el triángulo y el punteado lo distinguen.
- **L3** T1: señales arriba de todas las capas (los zombies las tapaban). La tarjeta al tocar no se probó en captura (headless no hace clic); su texto está cubierto por tests.
- **L4** T2: leyenda abajo a la derecha (el mapa ocupa todo el ancho bajo el panel; a la izquierda quedaría tapada). Se cierra sola al tocar fuera. Se agregó "Puente dañado" (viene de la imagen 5A).
- **L5** (27 oct) Pregunta del panel → "Mantener el riel (Recomendado)". A mitad de T3 llegaron S6 (barra de notificaciones) y S7 (lista de refugios).
- **L6** T3: las llegadas son alertas nuevas que no abren la barra ni cuentan en el globito (pasan casi cada turno). "Cambiaron de camino" cuenta a quien cambió de refugio o cuya ruta se alargó tras dar su paso (necesita refugio/callesRestantes). "En peligro" = en camino a ese refugio y parado sobre o al lado de un zombie visible. En el mockup los zombies son puntos; se mantienen los íconos por tipo porque el reto los exige.
- **L7** (27 oct, Anthony): "la parte de la leyenda quiero que sea la que tenimos anterior mente pero actuializada con los punetes y las calles bloqueadas". S2 reemplazada: vuelve la leyenda anterior (abierta en pantallas anchas), con "Puente" en doble línea, "Calle bloqueada" con el disco y "Puente dañado" con el triángulo.
