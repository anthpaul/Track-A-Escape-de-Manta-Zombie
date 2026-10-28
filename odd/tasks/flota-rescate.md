# Flota de rescate (Pro)

Objetivo: el tercer Pro del reto, sin tocar la prueba de fuego ni `/paso`.
Rama: `feat/flota-rescate` · Entrega: un PR con commits por unidad · Tests: `npm test -w shared`, `npx tsx --test tools/simulador/*.test.ts`, `npm test -w backend`, `npm test -w frontend`.

## Specs

- **S1** Reto, textual: "Flota de rescate (5 camionetas el doble de rápidas, hasta 4 personas; a quién recoger y en qué orden)".
- **S2** Modo aparte: la flota corre en las rondas demo (y con `"flota": true` en el evento); las rondas de evaluación R1–R3 quedan exactamente como hoy. `/paso` no cambia.
- **S3** Camionetas: 5, salen de los refugios, avanzan hasta 2 calles por turno (el doble que un sobreviviente), nunca pisan nodos con zombie visible ni zonas de horda ni calles bloqueadas, y no son mordidas. Llevan hasta 4 personas; quien va arriba no pide `/paso`, no puede ser mordido y viaja con la camioneta.
- **S4** A quién recoger y en qué orden (pura, testeada, `shared/flota.ts`): candidatos = sobrevivientes en ruta a pie sin otra camioneta asignada. Prioridad: primero los que tienen un zombie a 2 calles o menos; después, quien más lejos está de un refugio. Una camioneta solo va a buscar a alguien si llega antes de lo que esa persona tardaría en llegar sola (salvo que esté en peligro). Cada camioneta, por id, toma el mejor candidato según prioridad menos su propia distancia. Con 4 a bordo, o sin candidatos que valgan la pena y con gente arriba, va al refugio más cercano con lugar y baja a quienes entren.
- **S5** `/estado` publica las camionetas (id, nodo, pasajeros, destino) y el mapa las dibuja con ícono Lucide y cuántos lleva; leyenda; quien va arriba figura "En camioneta".
- **S6** Docs (README Pro) y medición local con y sin flota.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S3, S4 (shared) | inline | hecho (shared 60) | ver log |
| T2 | S2, S3 (simulador) | inline | hecho (simulador 56) | ver log |
| T3 | S5 (backend /estado) | inline | hecho (backend 160) | ver log |
| T4 | S5 (mapa) | inline | hecho (front 131, captura del ícono) | ver log |
| T5 | S6 | inline | pendiente | |

Corte: 05:00 (si no está, queda en su rama y el pitch cuenta dos Pro).

## Log

- **L1** (28 oct, 00:05, Anthony): "primero la flota y despues el pitch con los documentos" — sobre la propuesta de hacerla como modo aparte, solo en demos.
- **L2** T4: la simulación local no puede usar `shared/flota.ts`: Turbopack rechaza importar código de `shared` (su `package.json` dice CommonJS y el código es ESM; `transpilePackages` no alcanza). Cambiar el tipo de `shared` a medianoche arriesga backend y simulador, así que el mock queda sin flota; la flota real llega por `/estado`. El ícono se verificó con camionetas fijas inyectadas un momento en el mock.
