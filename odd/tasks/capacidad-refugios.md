# Capacidad de refugios (Pro)

Objetivo: que ningún sobreviviente llegue a un refugio lleno (Pro del reto) y que se vea en la R3.
Rama: `feat/k4-capacidad` · Entrega: un PR con commits por unidad · Tests: `npm test -w backend`, `npm test -w shared`, `npx tsx --test tools/simulador/*.test.ts`, `npm test -w frontend`.

## Specs

- **S1** Reto: "Capacidad de refugios (que ninguno llegue a un refugio lleno)". Capacidad **50 por refugio** (decisión de Anthony: "vamos continua" sobre "Recomiendo 50 por refugio").
- **S2** Simulador: un refugio lleno no admite a nadie más; quien llega queda en ruta en la puerta. Si llegan varios al mismo turno y quedan menos cupos, entran por id hasta llenarlo.
- **S3** Motor: lee del turno los sobrevivientes (id, nodo, estado), cuenta la ocupación (a salvo en cada refugio) y reparte los cupos libres: cada sobreviviente en ruta queda asignado al refugio más cercano con lugar (pares ordenados por distancia en calles, sin calles bloqueadas). A* solo apunta a su refugio asignado y a los que todavía tengan cupos sin asignar. Si así no hay ruta, prueba cualquier refugio con lugar; si no, escape. Determinista por turno, sin escrituras en `/paso`. Sin datos de sobrevivientes, se comporta como hoy.
- **S4** El mismo reparto en las rondas demo (motor en proceso) y en `GET /sobrevivientes/:id/ruta`.
- **S5** Mapa y docs: la ocupación y "LLENO" ya existen; README (Pro) y resultados medidos.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S1, S2 | inline | hecho (shared 52, simulador 52, backend 149, front 129) | ver log |
| T2 | S3, S4 | inline | hecho (backend 159, simulador 53; RED confirmado contra el código viejo) | ver log |
| T3 | S5 + medición | inline | hecho (front 129, backend 159, shared 52) | ver log |

Hora de corte acordada: 02:00 (si no está, queda en su rama sin mergear y se pasa a los entregables).

## Log

- **L1** (27 oct, Anthony): "pero no seria mejor tener la parte del pro y despues vamos ya con lo demas cuando ya finalicemos todo" → plan con corte a las 02:00; luego "¿Vamos con 50 por refugio? vamos continua".
- **L2** Hallazgo: hoy nadie mira la capacidad. El motor solo ve zombies y bloqueos (`MundoTurno`), el simulador admite a todos (`resolverLlegadas`), y el front calcula la ocupación contando llegadas.
- **L3** Medición local (8 semillas, cupo 50 en el simulador): R3 sin reparto 275 turnos-persona en la puerta de un refugio lleno, con reparto 0; supervivencia igual (R1 91,9 %, R2 30,5 %, R3 14,7 %). En R1 y R2 ningún refugio se llena. RED confirmado de los tests del motor contra el código viejo (3 fallaban).
