# Hoja de ruta del equipo — paso a paso

Qué hace cada uno, en qué orden y cuándo nos juntamos, desde el lunes 26 hasta la entrega del **miércoles 28 de octubre a las 10:00 (hora de Ecuador)**.

- **Fuente de verdad:** `AGENTS.md` (reglas y contratos) y `docs/PLAN_IMPLEMENTACION.md` (prompts por tarea; su tabla de ajustes A1–A9 manda).
- **Cómo trabajamos:** `CONTRIBUTING.md`. Una tarea = una rama = un PR aprobado por otro integrante.
- **Al cerrar una tarea:** marcarla con ✅ en la sección 6 de este archivo, dentro del mismo PR.

---

## 1. Qué bloquea a qué

```text
T0.2 tipos en shared/ (Kevin) ─────┬──▶ todo lo demás usa estos tipos
T0.3 grafo manta.json (Alex) ──────┼──▶ K1 A* · S1 simulador · N1 mapa
T0.4 primer deploy (Alex) ─────────┼──▶ K3 /paso en AWS · integración
S5 GET /estado real (Alex) ────────┼──▶ N2/N3/N4 con datos reales
K6 GET /sobrevivientes/:id/ruta ───┴──▶ N4/N6 ruta del seleccionado
```

**Para no esperarse entre nosotros:** cada uno trabaja contra **datos de prueba con el formato acordado** hasta que la pieza real exista.

| Quién espera | Qué usa mientras tanto | Dónde |
|---|---|---|
| Kevin y Anthony, al grafo real | `shared/data/fixture-mini.json`: 12 nodos, 15 calles (un puente), 2 refugios | Lo crea Kevin en T0.2 |
| Anthony, a `/estado` real | Snapshot falso generado en el front a partir del fixture (`NEXT_PUBLIC_USE_MOCKS=true`) | `frontend/src/features/mapa/mocks/` |
| Alex, al motor | Un `/paso` falso local que devuelve el primer vecino válido | `tools/simulador/` |

---

## 2. El contrato que hay que cerrar primero (T0.2, Kevin, antes de las 15:00)

Todo esto vive en `shared/` y se aprueba por PR con **los tres**. Cambiarlo después obliga a tocar las tres zonas.

```ts
// Grafo estático (AGENTS.md §4.1)
type Nodo    = { id: string; lat: number; lng: number; barrio?: "tarqui" | "los_esteros" | "barbasquillo" | "jocay" }
type Calle   = { id: string; desde: string; hasta: string; distancia_m: number;
                 tipo: "avenida" | "calle" | "callejon" | "puente"; geometria: [number, number][] }
type Refugio = { id: string; nodo: string; nombre: string; capacidad: number }
type Grafo   = { version: string; nodos: Nodo[]; calles: Calle[]; refugios: Refugio[] }

// Estado de un turno (AGENTS.md §4.2 y §5)
type TipoZombie = "caminante" | "corredor" | "horda" | "dormido"
type Zombie     = { id: string; tipo: TipoZombie; nodo: string }
type EstadoSobreviviente = "en_ruta" | "a_salvo" | "mordido"
type Sobreviviente = { id: string; nodo: string; estado: EstadoSobreviviente; siguienteNodo?: string }
type EstadoTurno = { partidaId: string; ronda: 1 | 2 | 3; turno: number; completo: boolean;
                     zombies: Zombie[];            // solo visibles: los dormidos no aparecen
                     aristasBloqueadas: string[];
                     sobrevivientes: Sobreviviente[] }

// Contrato oficial (ya existe en shared/index.ts)
type PasoInput  = { sobrevivienteId: string; nodoActual: string; turno: number }
type PasoOutput = { siguienteNodo: string }
```

Más las funciones puras que **motor y simulador comparten** (`shared/grafo.ts`): `vecinos(nodo)`, `calleEntre(a, b)`, `esMovimientoValido(desde, hasta, aristasBloqueadas)` y `nodosBloqueadosPorHordas(zombies)` (nodo + vecinos).

---

## 3. Cronograma con puntos de control

| Bloque | Kevin (motor) | Alex (grafo, simulador, infra) | Anthony (mapa, coordinación) | Punto de control |
|---|---|---|---|---|
| **Lun 13–15** | T0.2 tipos + fixture | T0.3 grafo con OSMnx | T0.1 preguntas a la organización · N0 setup MapLibre | 15:00 PR de tipos aprobado por los 3 |
| **Lun 15–18** | T0.6 `FuenteMundo` · K1 A* | T0.4 primer deploy | N1 mapa con el grafo (fixture) | **18:00** `/api/health` en AWS y `/paso` sin key → 401 |
| **Lun 18–23** | K2 costos de peligro · K3 `/paso` real | S1 turnos · S2 zombies · S3 mordidas | N2 capas en vivo con mock · N3 panel | **23:00** `/paso` con A* en AWS + R1 del simulador contra AWS |
| **Mar 08–13** | K6 endpoint de ruta · K4 refugios | S4 rondas y métricas · S5 `/estado` real | N4 polling real + EN VIVO · N6 auto-selección y flechas | 13:00 mapa conectado a `/estado` real |
| **Mar 13–18** | Ajuste de costos según dónde mueren | S6 simulador como Lambda + Scheduler | N5 landing · pulido de producto | **18:00** R2 y R3 de punta a punta con el mapa en vivo |
| **Mar 18–24** | **Prueba de fuego propia (los tres):** R1→R2→R3 contra AWS, 3 corridas · ajustes · latencia | | | p95 de R3 ≤ 150 ms y errores < 0,5 % |
| **Mié 07–10** | Sección del README | README, diagrama, `docs/costos.md` | README, pitch, revisión final de secretos | **08:00** repo revisado · **10:00** entrega |
| **Jue 29** | Ensayo de preguntas del motor | Ensayo de preguntas de infra y simulador | **Ensayo completo de la demo en la laptop** (sección 7) + video de respaldo | La demo corre de punta a punta desde la laptop, con el hotspot del celular |
| **Vie 30** | Pitch en la ULEAM (5 min + 3 de preguntas) | | **Lleva la laptop y opera la demo** | — |

Si un punto de control falla, **se para y se resuelve entre los tres** antes de seguir (`AGENTS.md` §9). Lo Pro (K5 predicción, capacidad de refugios, flota) **solo** si el control de las 18:00 del martes está en verde.

---

## 4. Paso a paso por persona

Cada paso indica rama, qué hacer, prompt de `docs/PLAN_IMPLEMENTACION.md` a usar con Kiro/Codex/Claude y cuándo está listo. **Antes de pasar un prompt, el agente tiene que leer `AGENTS.md` y la tabla de ajustes del plan.**

### 4.1 Kevin — motor de rutas (`shared/`, `backend/src/`)

| # | Rama | Qué hacer | Prompt | Listo cuando |
|---|---|---|---|---|
| 1 | `feat/t02-shared-types` | Tipos y schemas Zod de la sección 2, funciones puras de `shared/grafo.ts`, `fixture-mini.json` | 1 (parte de contratos) | Tests de `vecinos`, `esMovimientoValido` y hordas + vecinos en verde; PR aprobado por los 3 |
| 2 | `feat/t06-fuente-mundo` | Interfaz `FuenteMundo` con `obtenerTurno(partidaId, n)`; implementación `DynamoFuente` con caché por número de turno | 3 | El motor nunca importa DynamoDB directo; test con una fuente falsa |
| 3 | `feat/k1-astar` | A* con cola de prioridad, costo `1 turno + ε × tiempo(distancia_m, tipo)` | 3 | Tests: ruta más corta en turnos sobre el fixture; respeta aristas bloqueadas |
| 4 | `feat/k2-costos-peligro` | Costos de `AGENTS.md` §4.4: zombie visible, horda + vecinos, cruce de frente, vecinos de caminantes | 3 | Un test por fila de la tabla §4.4 |
| 5 | `feat/k3-paso` | `POST /api/paso`: Zod, `x-api-key` en tiempo constante, presupuesto de 300 ms con paso seguro de respaldo, valida con `esMovimientoValido` antes de responder | 3 | 401 sin key, 400 con body inválido, nunca 500; desplegado por Alex; p95 local medido |
| 6 | `feat/k6-ruta-sobreviviente` | `GET /api/sobrevivientes/:id/ruta` con la misma función que `/paso`, estados de `AGENTS.md` §5 | 3 | Tests de `a_salvo`, `mordido`, `sin_ruta` y 404 |
| 7 | `feat/k4-refugios` | Elección del refugio de menor costo; Pro: contador atómico de capacidad (`INFRA.md` §4) | 3 | Test: N asignaciones simultáneas sobre K lugares → exactamente K |
| 8 | (en el PR de cada tarea) | Secciones del README: motor, costos de peligro, refugios | 8 | Sin `TODO (Kevin)` en el README |

### 4.2 Alex — grafo, simulador e infraestructura (`tools/`, `infra/`, `backend/src/db/`)

| # | Rama | Qué hacer | Prompt | Listo cuando |
|---|---|---|---|---|
| 1 | `feat/t03-grafo-osm` | Script OSMnx en `tools/osm/` → `shared/data/manta.json`: bbox de Tarqui, Los Esteros, Barbasquillo y Jocay; filtro de vías; `consolidate_intersections`; componente conexa mayor; ~300 nodos; geometría por calle; al menos un puente; 4 refugios; `barrio` en los nodos de inicio | 1 | Test: grafo conexo y cada refugio alcanzable desde los 4 barrios; método y licencia (ODbL) documentados |
| 2 | `chore/t04-primer-deploy` | `terraform apply` con `backend.hcl` y `TF_VAR_api_key` | 7 | `curl <site>/api/health` → `{"ok":true}`; `/paso` sin key → 401; URLs en el README |
| 3 | `feat/s1-turnos` | Loop de turnos de 2 s con semilla: zombies primero, orden de escritura de `AGENTS.md` §4.2 (`TURNO#N` incompleto → `/paso` → `UpdateItem` con `siguienteNodo` y `completo`) | 2 | Una ronda corre en local contra un `/paso` falso |
| 4 | `feat/s2-zombies` | Caminante, corredor (persigue a ≤ 3 nodos), horda, dormido (despierta a ≤ 2 nodos), eventos de ciudad. Usar las funciones de `shared/` | 2 | Un test por tipo de zombie y por evento |
| 5 | `feat/s3-mordidas` | Mordida por nodo y por cruce; llegada a refugio | 2 | Tests explícitos de los dos tipos de mordida |
| 6 | `feat/s4-rondas` | R1, R2 y R3 con su composición y eventos; métricas: supervivencia, eficiencia, p50/p95/p99, errores | 2 y 8 | La R1 corre contra `/paso` en AWS e imprime las métricas |
| 7 | `feat/s5-estado` | `GET /api/estado` desde DynamoDB: último turno con `completo: true`, `generadoEn`, sin dormidos ni rutas | 2 | El mapa de Anthony lo consume en modo real |
| 8 | `feat/s6-simulador-lambda` | Simulador empaquetado como Lambda (ronda completa por invocación) + EventBridge Scheduler para demo, en Terraform con rol de mínimo privilegio | 7 | `aws lambda invoke` corre una ronda; la URL pública nunca muestra un mapa congelado |
| 9 | `docs/arquitectura-costos` | `docs/arquitectura.drawio` + `.png`, `docs/costos.md` con cálculo visible y gasto real | 8 | Sin `TODO (Alex)` en el README ni en `docs/costos.md` |

### 4.3 Anthony — mapa en vivo y coordinación (`frontend/`)

| # | Rama | Qué hacer | Prompt | Listo cuando |
|---|---|---|---|---|
| 1 | — | **T0.1:** mandar Q1–Q4 a la organización y anotar respuestas en `AGENTS.md` §0 | — | Respuestas en el repo |
| 2 | `feat/n0-maplibre-setup` | Leer la guía de Next en `node_modules/next/dist/docs/`. Instalar `maplibre-gl` y `react-map-gl` con versión exacta; página `/mapa` con `dynamic(..., { ssr: false })`; estilo CARTO Dark Matter con atribución; centrado en Manta | 4 | `npm run build -w frontend` genera el export y el mapa base se ve |
| 3 | `feat/n1-mapa` | Capa de calles (GeoJSON desde `geometria`, color por `tipo`) y refugios; funciones puras de conversión a GeoJSON con tests | 4 | Grafo del fixture (después `manta.json`) dibujado; tests de las funciones GeoJSON |
| 4 | `feat/n2-capas-vivo` | Fuentes de zombies (ícono por tipo), sobrevivientes, calles bloqueadas en rojo, zonas de horda; `setData` por snapshot; snapshot falso cada 2 s | 4 | 200 sobrevivientes falsos sin trabarse (FPS medido) |
| 5 | `feat/n3-panel` | Panel fijo: ronda, turno, en ruta / a salvo / mordidos, p95; leyenda persistente | 4 | Se entiende sin explicación |
| 6 | `feat/n4-polling` | TanStack Query con `refetchInterval: 2000` contra `/api/estado`; indicador EN VIVO según `generadoEn`; estados de carga, error y desconexión; selección de un sobreviviente con su ruta (K6) y flash de recálculo | 4 y 5 | Con el simulador corriendo, el mapa se mueve; si se corta, el indicador lo muestra |
| 7 | `feat/n6-auto-seleccion` | Auto-selección al cargar (pasa a otro si llega o lo muerden) + flecha al `siguienteNodo` de cada sobreviviente | 4 | Sin tocar nada, siempre hay una ruta planificada visible |
| 8 | `feat/n5-landing` | Landing: qué es, cómo se usa, enlace al mapa | — | — |
| 9 | (miércoles) | README: qué hace, uso del mapa, `docs/mapa.png`; pitch (PDF/PPT/PPTX ≤ 20 MB); revisión final de secretos en el historial | 8 | Entregables enviados antes de las 10:00 |
| 10 | `docs/demo-runbook` | `docs/DEMO.md`: guion de la demo con los comandos exactos (sección 7), preparado con Alex | — | Ensayado el jueves en la laptop |
| 11 | (jueves) | Ensayo completo en la laptop y grabación del video de respaldo | — | Video guardado en la laptop y en la nube |

> **Carga de Alex:** es la zona con más tareas. Si a las 23:00 del lunes S2/S3 no están, Kevin toma las reglas puras de zombies y mordidas en `shared/` (su zona) y Alex solo las conecta al loop del simulador.

---

## 5. Integración: dónde se tocan las piezas

| Momento | Quiénes | Qué se prueba |
|---|---|---|
| Lun 15:00 | Los 3 | PR de tipos de `shared/` aprobado: desde acá nadie cambia un tipo sin avisar |
| Lun 18:00 | Alex + Kevin | Primer deploy; `/paso` responde en AWS |
| Lun 23:00 | Alex + Kevin | El simulador corre la R1 contra `/paso` en AWS |
| Mar 13:00 | Alex + Anthony | El mapa lee `/estado` real mientras corre el simulador |
| Mar 18:00 | Los 3 | R2 y R3 completas con mapa en vivo; se elige qué Pro entra |
| Mar noche | Los 3 | Prueba de fuego propia: 3 corridas, resultados a la tabla del README |

---

## 6. Estado de las tareas

Marcar ✅ en el PR que cierra la tarea.

| Fase 0 | Kevin | Alex | Anthony |
|---|---|---|---|
| ✅ T0.5 Budget · ✅ T0.7 repo | ⬜ T0.2 · ⬜ T0.6 | ⬜ T0.3 · ⬜ T0.4 | ⬜ T0.1 |

| Fase 1 | Kevin | Alex | Anthony |
|---|---|---|---|
| | ⬜ K1 · ⬜ K2 · ⬜ K3 · ⬜ K6 · ⬜ K4 | ⬜ S1 · ⬜ S2 · ⬜ S3 · ⬜ S4 · ⬜ S5 · ⬜ S6 | ✅ N0 · ✅ N1 · ✅ N2 · ✅ N3 · ⬜ N4 · ✅ N6 · ⬜ N5 |

| Entrega | Estado |
|---|---|
| Prueba de fuego propia (3 corridas) | ⬜ |
| README sin `TODO` | ⬜ |
| `docs/arquitectura.png` + `.drawio` | ⬜ |
| `docs/costos.md` | ⬜ |
| URL pública funcionando | ⬜ |
| Pitch (≤ 20 MB) | ⬜ |
| `docs/DEMO.md` + ensayo en la laptop | ⬜ |
| Video de respaldo de la demo | ⬜ |
| Revisión de secretos en el historial | ⬜ |

---

## 7. Demo en vivo — viernes 30 en la ULEAM (laptop de Anthony)

Anthony lleva la laptop y opera la demo. Eso define cómo se prepara:

**La laptop solo muestra y dispara; todo corre en AWS.** El mapa se abre desde la URL pública de CloudFront y las rondas las juega la Lambda del simulador (S6). Nada depende de `npm run dev` ni de un servidor local: si la laptop se reinicia, la demo sigue.

### Lo que tiene que tener la laptop (listo el miércoles a la noche)

| Qué | Para qué | Estado |
|---|---|---|
| Perfil AWS `spookython` con el usuario de Anthony | Lanzar rondas y prender o apagar el Scheduler | ✅ ya configurado |
| API key de `/paso` en el gestor de contraseñas | Mostrar un `curl` a `/paso` en vivo si el jurado lo pide | ⬜ |
| Comandos de `docs/DEMO.md` probados | Lanzar R1, R2 o R3 con su semilla en un solo comando | ⬜ |
| Pitch (PDF) **descargado** en la laptop | No depender de internet para las diapositivas | ⬜ |
| Video de respaldo **descargado** en la laptop | Plan B si falla la red o AWS | ⬜ |
| Pestañas preabiertas: mapa en vivo, README en GitHub, CloudWatch con la latencia | Mostrar cada cosa sin buscarla | ⬜ |
| Navegador actualizado con WebGL activo | MapLibre dibuja con la GPU | ⬜ |
| Cargador y adaptador HDMI | El proyector | ⬜ |

### Plan B por si algo falla en vivo

| Falla | Respuesta |
|---|---|
| El wifi de la ULEAM no anda | Hotspot del celular (probarlo el jueves con el mismo navegador) |
| Sin internet ni hotspot | Video de respaldo + capturas del README |
| La ronda no arranca | El Scheduler de demo mantiene una ronda corriendo: mostrar esa |
| Pregunta sobre una parte que no es de Anthony | La contesta su dueño (Kevin: motor; Alex: infra y simulador). Ensayado el jueves |

### Guion sugerido de la demo (dentro de los 5 minutos del pitch)

1. Mapa en vivo con la R3 corriendo: 200 sobrevivientes, zombies por tipo, refugios y el panel con p95 en vivo.
2. Un sobreviviente seleccionado y su ruta planificada.
3. Una calle se bloquea o aparece una horda: la ruta se recalcula con el *flash* y el tramo en rojo.
4. Cierre con los números de nuestra prueba de fuego (tabla del README) y el costo.

## 8. Reglas rápidas

- Partir siempre de `main` actualizado: `git switch main && git pull && git switch -c <rama>`.
- PR chico y el mismo día. Avisar en el grupo cuando se abre, porque necesita la aprobación de otro.
- Antes de pushear: `npm test` y `npm run typecheck`. Antes de commitear: `git status`, sin secretos.
- Nadie cambia un tipo de `shared/` sin avisar a los otros dos.
- Solo Alex hace `terraform apply`.
- Si algo se traba más de 30 minutos, se avisa en el grupo.
