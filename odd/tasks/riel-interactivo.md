# Riel interactivo (panel 2b) + grafo real

Objetivo: reemplazar el sidebar por el riel interactivo de 4 tabs con la paleta 2 y fuente pixel, dentro de la arquitectura de `features/mapa`, sin perder ningún DEBE del reto, y pasar del grafo de prueba al grafo real (`shared/data/manta.json`).
Rama: `feat/riel-interactivo` · Entrega: un PR con commits por unidad · Tests: `npm test -w frontend` (node:test + tsx).

## Specs

- **S1** Look del prompt "Panel 2b Riel interactivo": riel izquierdo con logo "EM" y 4 botones (REF, SOB, CAPAS, ALER con badge de no leídas), panel lateral con título del tab y "R{ronda} · T{turno}", toast "HORDA DETECTADA" con "VER ALERTAS" y ×, brújula "N", bottom sheet y barra inferior en móvil (<768px). Paleta 2 y fuente pixel.
- **S2** Tabs: Refugios (A salvo, Capacidad libre, tarjeta por refugio con LLENO/% y barra 100% `crimson2-700` / ≥60% `orange-500` / resto `teal-700`, selección con "VER RUTA"/"OCULTAR RUTA" y "EN CAMINO (n)"), Sobrevivientes (buscador por ID o destino, chips Todos · En ruta · Mordido · A salvo con conteos, lista, ficha del seleccionado), Capas (interruptores por tipo con conteo + ruta seleccionada), Alertas (NUEVA, UBICAR, MARCAR LEÍDA).
- **S3** Interacción con el mapa: clic en refugio → tab Refugios con ese refugio; clic en sobreviviente o mordido → tab Sobrevivientes con él; anillos de selección; capas apagadas no se dibujan; ruta punteada `teal-700`.
- **S4** DEBE del reto que se mantienen: ruta planificada siempre visible (auto-seguimiento + flechas, A9), calles bloqueadas visibles, ícono por tipo de zombie, indicador EN VIVO por edad real del snapshot, p95 y supervivencia visibles (encabezado del panel).
- **S5** Adaptaciones técnicas: estado con `useReducer` (sin Zustand), alertas calculadas en el front comparando snapshots, capas por `visibility` de MapLibre, polling (no SSE: el front es export estático), colores con nombres propios que no pisan las escalas de Tailwind, nada fuera de `features/mapa` salvo tema y fuentes.
- **S6** Grafo real: el mapa dibuja `shared/data/manta.json` (284 nodos, 384 calles, 4 refugios); la simulación de prueba corre sobre él con sobrevivientes en los 4 barrios.
- **S7** Destino y calles restantes por sobreviviente: campos opcionales `refugio` y `callesRestantes` en `/estado` (los calcula el simulador con la misma función de `shared/`); el mock los provee.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S6, S7 | inline | hecho (49 tests) | d6266ab |
| T2 | S1, S5 | inline | hecho (54 tests) | pendiente de commit |
| T3 | S2, S3, S5 | inline | pendiente | |
| T4 | S1–S4 | inline | pendiente | |

## Log

- **L1** (2026-10-26, pedido del usuario): "Mi propuesta — Implementar el Riel interactivo con su look exacto (paleta 2, fuente pixel, 4 tabs, toast, brújula, bottom sheet en celular), pero dentro de nuestra arquitectura y sin perder ningún DEBE: Mantener la ruta siempre visible, las calles bloqueadas, los íconos por tipo, el indicador EN VIVO, y el p95 y la supervivencia (en el encabezado del panel). Alertas calculadas en el front, capas con `visibility` de MapLibre, estado con `useReducer`. Y aprovechar para pasar al grafo real de Alex. ¿Avanzo con esa versión adaptada? sigue para poder continuar con el proceso y seguir con los parametros del hackathon"
- **L2** Ruta de implementación: inline, sin writers (una sola unidad de comportamiento encadenada; ningún disparador de delegación).
