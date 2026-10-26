# AGENTS.md — SpookyThon 2026 · Track A · Escape de Manta Zombie

Fuente de verdad del proyecto para el equipo **abcstack** y para cualquier agente de IA (Claude Code, Kiro, GGA). Antes de un cambio no trivial, el AI confirma que entiende el reto y el contrato, y pregunta si toca algo marcado `TODO`. **Nunca inventa** endpoints, atributos, ítems de DynamoDB ni servicios que no estén acá.

> **El repo es público** (lo exige la entrega). Nada de Account ID, emails, usuarios IAM, API keys ni `.tfvars` en ningún archivo commiteado.

---

## 0. El reto

### Enunciado oficial (textual, de la plataforma SpookyThon 2026)

```text
Track A · Escape de Manta Zombie
La noche del 31 de octubre, Manta amanece infestada. Hay sobrevivientes atrapados en Tarqui, Los Esteros, Barbasquillo y Jocay, y los refugios están en puntos fijos de la ciudad. Los zombies no se quedan quietos: caminan, corren, se agrupan en hordas y algunos duermen escondidos hasta que alguien pasa cerca.
Tu sistema es la única radio que les queda a los sobrevivientes: les dice, paso a paso, por dónde ir.

LA PROBLEMÁTICA REAL
Encontrar la mejor ruta es fácil cuando el mapa no cambia. El problema real es cuando el mapa cambia mientras te mueves: calles cerradas, tráfico, accidentes, zonas peligrosas. Es el núcleo de Uber, de las apps de delivery y de las rutas de evacuación ante desastres.

01 Objetivo
Construir en AWS un motor de rutas que recalcule en tiempo real según obstáculos móviles y que responda rápido aunque haya cientos de personas pidiendo ruta al mismo tiempo. El servicio:
1. Recibe el mapa de Manta como grafo (intersecciones y calles).
2. Escucha la posición de los zombies, que se actualiza cada turno.
3. Decide para cada sobreviviente cuál es su siguiente paso para llegar a un refugio sin ser mordido y lo antes posible.
4. Muestra todo en un mapa en vivo: zombies, sobrevivientes, rutas y refugios.

02 Requisitos — EL MUNDO DEL JUEGO
- Mapa: el equipo construye el grafo de Manta (por ejemplo con datos abiertos de OpenStreetMap): unas 300 intersecciones (id, lat, lng), calles con distancia_m y tipo (avenida, calle, callejon, puente; cada tipo con su velocidad) y 4 refugios.
- Turnos de 2 segundos: primero se mueven los zombies y después los sobrevivientes.
- Zombies: Caminante (1 calle cada 2 turnos, dirección aleatoria) · Corredor (2 calles por turno; persigue si hay un sobreviviente a 3 nodos o menos) · Horda (casi inmóvil, bloquea su nodo y todos los vecinos) · Dormido (invisible hasta que un sobreviviente está a 2 nodos o menos; ahí despierta como caminante).
- Eventos de ciudad: un puente colapsa o una avenida se bloquea; la arista desaparece del mapa en vivo.
- Mordida: si al final de un turno comparte nodo con un zombie, o si se cruzan por la misma calle en direcciones opuestas. El mordido queda fuera.

CONTRATO TÉCNICO
- El equipo construye su Simulador del Apocalipsis: mueve a los zombies según sus reglas y publica el estado del mundo en cada turno por GET /estado o WebSocket (turno, zombies con id/tipo/nodo y aristasBloqueadas).
- El equipo DEBE exponer POST /paso, que su simulador consulta por cada sobreviviente en cada turno. Pregunta: {"sobrevivienteId": "S-0089", "nodoActual": "N-0117", "turno": 142}. Respuesta: {"siguienteNodo": "N-0118"}.
- DEBE responder en menos de 500 ms; si no, el sobreviviente se queda quieto ese turno.
- siguienteNodo DEBE ser vecino por una calle no bloqueada, o el mismo nodo. Un movimiento inválido equivale a quedarse quieto.
- Cada sobreviviente va al refugio que el equipo considere mejor.
- Autenticación por API key en la cabecera x-api-key.
- Mapa en vivo: interfaz web actualizada en cada turno con zombies (ícono por tipo), sobrevivientes, ruta planificada y refugios.

NIVEL BASE: POST /paso con rutas válidas que eviten zombies visibles · Algoritmo de rutas (Dijkstra, A* u otro) que considere distancia y tipo de calle · Mapa en vivo funcionando y todo desplegado en AWS.
NIVEL PRO (puntos extra): Predicción (anticipar hacia dónde se mueven los corredores) · Capacidad de refugios (que ninguno llegue a un refugio lleno) · Flota de rescate (5 camionetas el doble de rápidas, hasta 4 personas; a quién recoger y en qué orden).

03 Reglas
- Cuenta AWS propia (o sandbox de la organización) en la región us-east-1 (por confirmar). AWS Budget con alerta desde el primer día (captura en el README).
- Se permite IA para programar, pero el equipo DEBE poder explicar cualquier parte de su código.
- DEBE = obligatorio (si no se cumple, ese criterio vale 0) · DEBERÍA = esperado (resta) · PUEDE = opcional (suma).
RÚBRICA (sobre 10): Prueba de fuego 40 % · Calidad técnica 25 % (arquitectura, sin llaves en el código, mínimo privilegio, código legible) · Producto 15 % (usable sin explicación) · Costos 10 % · Presentación 10 %. Empate: mejor prueba de fuego; luego menor costo declarado.
PRUEBA DE FUEGO: tres rondas seguidas de 5 minutos con nuestro simulador — R1 Anochecer: 20 sobrevivientes, solo caminantes · R2 Medianoche: 80, caminantes + corredores + hordas, un puente colapsa · R3 Apocalipsis: 200 a la vez, todos los tipos incluidos dormidos, dos calles se bloquean en vivo.
Puntuación: Supervivencia 50 % (R1 ×1, R2 ×2, R3 ×3) · Eficiencia 20 % (turnos vs. ruta más corta sin zombies) · Latencia 15 % (p95 de POST /paso: ≤150 ms 10 · ≤300 ms 7 · ≤500 ms 4 · más 0) · Disponibilidad 15 % (errores o fuera de tiempo: <0,5 % 10 · <2 % 6 · <5 % 3 · más 0).
LO QUE EL JURADO VA A BUSCAR: calcular la ruta una sola vez y no recalcularla · evitar el nodo de la horda pero no sus vecinos · guardar el estado en memoria de una Lambda · arranques en frío de más de 500 ms en la ronda 3 · un mapa en vivo bonito pero congelado.

04 Entregables (hasta el miércoles 28 de octubre a las 10:00, hora de Ecuador)
Repo público con historial de commits real · README (qué hace, cómo desplegar, cómo probar, decisiones de diseño, limitaciones, captura del AWS Budget) · Diagrama de arquitectura en el repo (PNG/SVG + fuente) enlazado desde el README · Declaración de costos (mensual con cálculo visible + gasto real del evento) · App desplegada con URL pública hasta el pitch · Pitch (PDF/PPT/PPTX ≤ 20 MB) · Video (opcional) · Track A: URL de POST /paso, cómo ejecutar el simulador y cómo se mide la latencia.
Estructura sugerida: README.md · docs/arquitectura.png + .drawio · docs/costos.md · docs/budget.png · src/ · infra/.
DEMO EN VIVO: viernes 30 de octubre en la ULEAM, 5 min de pitch + 3 min de preguntas.

05 Servicios sugeridos (no obligatorios): API Gateway + Lambda o ECS Fargate · estado en DynamoDB o ElastiCache · mapa con Amazon Location Service o Leaflet · front en S3 + CloudFront o Amplify · tiempo real con API Gateway WebSocket o AppSync · CloudWatch · datos de OpenStreetMap (Overpass u OSMnx).
```

### Lo que entendimos

| Pregunta | Respuesta |
|---|---|
| Problema real | Rutear a muchas personas a la vez sobre un mapa que **cambia mientras se mueven**, con respuesta en tiempo real |
| Usuarios | El **sobreviviente** (recibe su próximo paso) y el **operador/jurado** (mira el mapa en vivo y las métricas) |
| Qué cambia | Antes: una ruta fija que te lleva directo a una horda. Después: cada 2 s el sistema recalcula y desvía antes del peligro |
| Qué gana puntos | **La prueba de fuego (40 %)**: supervivencia ponderada a la R3, latencia p95 ≤ 150 ms, menos de 0,5 % de errores |
| Utilidad real (pitch) | El mismo motor sirve para delivery, despacho de ambulancias o evacuación por tsunami en Manabí: "zombie" = calle cerrada o zona inundada |

### Alcance

- **Sí (Base, obligatorio):** grafo de Manta, simulador con las 4 reglas de zombies + eventos + mordidas, `POST /paso` con A*, `GET /estado`, mapa en vivo con MapLibre GL, todo en AWS. Plan detallado y prompts por tarea: `docs/PLAN_IMPLEMENTACION.md`.
- **Sí (Pro, en este orden):** 1) predicción de corredores, 2) capacidad de refugios, 3) flota de rescate **solo si sobra tiempo el martes a la noche**.
- **No:** WebSocket (polling cada 2 s alcanza y es más simple), Amazon Location Service, cuentas de usuario, deck.gl, API administrativa web en P0 (el simulador se controla por CLI).

### Demo y prueba de fuego

1. Mapa en vivo de Manta con los 4 refugios.
2. R1 → R2 (un puente colapsa en vivo y las rutas se desvían) → R3 (200 sobrevivientes, dos calles se bloquean).
3. Panel con supervivientes, mordidos, a salvo, turno actual y **latencia p95 en vivo**.
4. El momento "wow": se selecciona un sobreviviente, una horda aparece o una calle se bloquea en su ruta, y en el siguiente turno su ruta se recalcula con un *flash* visible y el tramo bloqueado en rojo.

### Equipo y entrega

| Integrante | Rol | Zona |
|---|---|---|
| **Anthony** | Frontend (mapa en vivo, panel, UX) + coordinación y merges | `frontend/` |
| **Kevin** | Motor de rutas (`/paso`), reglas de peligro, refugios | `backend/src/`, `shared/` |
| **Alex** | Grafo de Manta (OSM), simulador, infra y medición de latencia | `infra/`, `tools/`, `backend/src/db/` |

**Deadline de entrega:** **miércoles 2026-10-28, 10:00 (hora de Ecuador, UTC-5)**. Pitch: viernes 30 en la ULEAM.

### Preguntas abiertas para la organización (hacer hoy)

| # | Pregunta | Por qué importa |
|---|---|---|
| Q1 | `TODO:` ¿La región final es `us-east-1`? ¿Nos dan sandbox? | Usamos `us-east-2`, la región de la cuenta del equipo. Si exigen `us-east-1`, se cambia `aws_region` y `region` en `backend.hcl` |
| Q2 | `TODO:` ¿Un sobreviviente avanza **una arista por turno** sin importar su largo? | Define si "eficiencia" se mide en saltos (turnos) o en metros, y el costo del A* |
| Q3 | `TODO:` ¿El jurado corre **su** simulador contra nuestro `/paso`, o solo el nuestro? | Si corren el suyo, nuestro motor no puede depender de datos que solo escribe nuestro simulador |
| Q4 | `TODO:` ¿Capacidad de cada refugio (Pro)? ¿La fijamos nosotros? | Reparto de sobrevivientes |

Hasta que respondan: asumimos **Q2 = una arista por turno** y **Q3 = el motor lee el mundo de `GET /estado`/DynamoDB que publica el simulador**. Si Q3 es "corren el suyo", el motor sigue funcionando: solo cambia de dónde lee los zombies (ver §5).

> **Ojo con Q3:** el enunciado dice "tres rondas… con **nuestro** simulador", y lo escribe la organización. Lo más probable es que corran **su** simulador contra nuestro `/paso`. En ese caso `/paso` solo recibe `{sobrevivienteId, nodoActual, turno}` y nuestro DynamoDB estaría vacío. Hay que preguntar de dónde leemos los zombies (¿su `/estado`?, ¿su WebSocket?, ¿nos los mandan?). Por eso el motor lee el mundo **siempre a través de una interfaz `FuenteMundo`** (T0.6), nunca directo de DynamoDB.

### Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación | Dueño | Estado |
|---|---|---|---|---|---|
| R1 | Q3: el jurado corre su simulador y no tenemos los zombies | Supervivencia 50 % en cero (rutas ciegas) | Preguntar hoy. Interfaz `FuenteMundo` con dos implementaciones: `DynamoFuente` (nuestro simulador) y `HttpFuente` (el `/estado` de ellos) | Anthony (preguntar) · Kevin (interfaz) | `TODO` |
| R2 | Q1: exigen `us-east-1` y la cuenta nueva la bloquea | No podemos desplegar donde piden | Preguntar hoy. Desplegamos en `us-east-2`; `aws_region` también acepta `us-east-1` y la región del state va en `backend.hcl` | Anthony | `TODO` |
| R3 | Arranques en frío en la R3 (200 sobrevivientes, ~100 rps en ráfagas) | Latencia p95 y disponibilidad (30 % de la prueba) | Lambda a **1024 MB** (ya aplicado en `infra/`), bundle chico y llamadas de calentamiento antes de cada ronda. Si el p95 pasa de 150 ms, *provisioned concurrency* solo durante la prueba (declararla en costos) | Alex | Memoria lista · calentamiento `TODO` |
| R4 | Caché por turno sin el turno escrito: el simulador llama a `/paso` antes de escribir `TURNO#N` | El motor no ve los zombies del turno | Orden fijo en el simulador: mover zombies → **escribir `TURNO#N` y esperar el OK** → llamar a `/paso`. Si el turno no existe, el motor usa el último turno conocido (nunca "mundo vacío") | Alex · Kevin | `TODO` |
| R5 | El motor y el simulador aplican reglas distintas (vecinos, mordidas, horda) | El motor da un paso que "cree" seguro y el simulador lo muerde | Las reglas viven **solo** en `shared/`, con tests | Kevin | `TODO` |
| R6 | Optimizar en metros cuando la eficiencia se mide en turnos (Q2) | Eficiencia (20 %) más baja | Costo base `1 turno + ε × tiempo` (§4.4), no solo distancia ÷ velocidad | Kevin | Decidido |
| R7 | API key sin cablear o commiteada | Calidad técnica (25 %) y seguridad | `variable "api_key"` sensible en Terraform (mínimo 32 caracteres), cargada con `TF_VAR_api_key` y pasada a la Lambda como `API_KEY` (ya aplicado en `infra/`). Comparación en tiempo constante | Alex · Kevin | Infra lista · código `TODO` |
| R8 | Ids con formato distinto al contrato (la plantilla traía `z.ulid()`) | `/paso` responde 400 a todo | Schemas `N-0000`/`S-0000`/`C-0000` y `PasoInput`/`PasoOutput` en `shared/index.ts` con tests (ya aplicado) | Kevin (revisar) | Listo |
| R10 | La URL pública muestra un mapa congelado cuando nadie corre el simulador | Trampa del jurado y "todo desplegado en AWS" incumplido | Simulador como Lambda + EventBridge Scheduler en modo demo (S6) | Alex | `TODO` |
| R11 | El mapa no muestra ninguna "ruta planificada" si nadie selecciona un sobreviviente | Requisito DEBE del mapa en vivo | Auto-selección al cargar + flecha al `siguienteNodo` de cada sobreviviente (N4) | Anthony | `TODO` |
| R9 | Repo público con secretos en el historial | Descalificación por seguridad | Revisar `git log -p` antes de hacerlo público (§10) | Anthony | `TODO` |

---

## 1. Stack fijo

| Capa | Servicio | Estado |
|---|---|---|
| CDN + dominio único | CloudFront | Activo |
| Sitio estático (mapa) | S3 privado vía OAC | Activo |
| API | API Gateway HTTP API (v2) | Activo, throttling **300 rps / 600 burst** |
| Cómputo | Lambda `nodejs24.x` arm64 (una función, Hono) | Activo |
| Estado del mundo | DynamoDB single-table, on-demand | Activo |
| Cache | ElastiCache (Valkey) | **Apagado**: Lambda necesitaría VPC (más arranque en frío + NAT). DynamoDB + cache por turno alcanza |
| IaC | Terraform `~> 1.9`, provider `aws ~> 6.21` | Activo |
| Simulador en AWS | Lambda (ronda completa por invocación, hasta 15 min) + EventBridge Scheduler (rondas de demo periódicas) | `TODO` (S6) |
| Monitoreo | CloudWatch (logs + métricas de latencia) | Activo |

**Región:** `us-east-2`, la de la cuenta del equipo. `us-east-1` solo si la organización la exige (Q1). No se agregan otros servicios AWS sin discutirlo y registrarlo acá.

## 2. Stack de implementación

Monorepo con npm workspaces (`shared`, `backend`, `frontend`): Next.js con export estático en el front, Hono + Zod en la Lambda, TypeScript `strict` en todo. Además:

| Agregado | Para qué |
|---|---|
| **MapLibre GL JS** + **react-map-gl** (integración `react-map-gl/maplibre`) + estilo vectorial **CARTO Dark Matter** | Mapa en vivo. Versiones exactas y compatibles entre sí (`npm install -E -w frontend maplibre-gl@<x> react-map-gl@<x>`). Atribución OSM + CARTO visible |
| Script de extracción OSM con **OSMnx** (Python, una sola vez, en `tools/osm/`) | Generar `shared/data/manta.json` con ~300 nodos, geometría de cada calle y 4 refugios. Python solo vive en `tools/`, nunca en la Lambda |
| Simulador en Node (`tools/simulador/`) | Corre las rondas, mueve zombies, llama a `/paso`, mide latencia y supervivencia. Se despliega como **Lambda que juega una ronda completa** por invocación (escribe cada turno en DynamoDB); también corre en local para desarrollo. Modo evaluación: `aws lambda invoke` con ronda y semilla. Modo demo: EventBridge Scheduler arranca rondas periódicas para que la URL pública nunca muestre un mapa congelado. **Demo y evaluación no se mezclan:** cada ronda usa su propio `PARTIDA#<id>` y marca su modo; `/estado` muestra la partida activa más reciente. Antes de una ronda de evaluación se deshabilita el Scheduler (`aws scheduler update-schedule --state DISABLED`) para que ninguna ronda de demo corra en paralelo |

**Mapa (reglas):** cada tipo de entidad (calles, calles bloqueadas, zombies, sobrevivientes, refugios, zonas de horda) es una fuente GeoJSON con su capa; por snapshot se hace `setData`, nunca un componente React por entidad. Colores por tipo o estado con expresiones de estilo. Siempre hay una ruta planificada visible (lo exige el reto): al cargar, el mapa auto-selecciona un sobreviviente activo y dibuja su ruta completa; además, una flecha corta por sobreviviente hacia su `siguienteNodo`. Nunca se dibujan las 200 rutas completas. Las posiciones se interpolan visualmente entre turnos, pero la simulación y las mordidas usan siempre estados discretos. Zonas y colores salen del estado real, nunca de datos propios del front. deck.gl queda fuera de P0. Cambiar a estilos de Amazon Location Service requiere autenticación y revisar compatibilidad: no es solo cambiar una URL.

---

## 3. Estructura del repo

```
├── shared/       data/manta.json (grafo estático) · grafo.ts (A*, vecinos) · reglas.ts (zombies, mordidas) · schemas.ts · errors.ts
├── backend/src/  handler.ts · app.ts · dev.ts · routes/paso.ts · routes/estado.ts · motor/ (costos de peligro, refugios) · db/
├── frontend/src/ app/ (/, /mapa) · features/mapa/ (MapLibre, fuentes y capas GeoJSON, polling) · lib/
├── tools/        osm/ (extracción del grafo) · simulador/ (rondas, métricas)
├── infra/        *.tf
├── docs/         arquitectura.png + .drawio · costos.md · budget.png
├── AGENTS.md · INFRA.md · README.md · CLAUDE.md (@AGENTS.md)
```

**Regla clave:** las reglas del juego (vecinos, mordidas, movimiento de zombies, costos de calle) viven en `shared/`, porque **el motor y el simulador tienen que aplicar exactamente las mismas**. Si las reglas difieren, el motor "cree" que un paso es seguro y el simulador lo muerde.

---

## 4. Modelo de datos

### 4.1 Grafo de Manta (estático, no va a DynamoDB)

`shared/data/manta.json`, generado una vez desde OpenStreetMap y empaquetado en la Lambda y en el front:

```ts
type Nodo = { id: string; lat: number; lng: number; barrio?: string }   // id: "N-0001"
type Calle = { id: string; desde: string; hasta: string; distancia_m: number; tipo: "avenida" | "calle" | "callejon" | "puente";
               geometria: [number, number][] }   // [lng, lat] de OSMnx, solo para dibujar; el motor usa desde/hasta
type Refugio = { id: string; nodo: string; nombre: string; capacidad: number }  // 4 refugios
```

Velocidad por tipo (m/s, ajustable): `avenida 1.6 · calle 1.4 · puente 1.2 · callejon 1.0`. Tiempo de una calle = `distancia_m / velocidad`.

**Por qué no está en DynamoDB:** no cambia durante la partida. Leerlo en cada `/paso` sumaría latencia sin aportar nada. Cargarlo en memoria de la Lambda **no** es la trampa del jurado: la trampa es guardar en memoria el estado **que cambia** (zombies, sobrevivientes).

### 4.2 Estado del mundo (DynamoDB, tabla `spookython_mundo`)

| Ítem | PK | SK | `data` | Lo escribe |
|---|---|---|---|---|
| Partida | `PARTIDA#<id>` | `METADATA` | ronda, estado, turnoActual, config | Simulador |
| Turno | `PARTIDA#<id>` | `TURNO#<n 6 dígitos>` | zombiesVisibles `[{id,tipo,nodo}]`, aristasBloqueadas `[id]`, sobrevivientes `[{id,nodo,estado,siguienteNodo}]`, completo | Simulador |
| Ocupación de refugio (Pro) | `PARTIDA#<id>` | `REFUGIO#<id>` | asignados (contador atómico), capacidad | Motor |

Todos los ítems llevan `ttl` (epoch) para que DynamoDB los borre solos al día siguiente.

| # | Pregunta | Operación |
|---|---|---|
| 1 | Partida activa y su turno actual | `GetItem PARTIDA#<id> / METADATA` |
| 2 | Estado del turno N (lo que lee el motor) | `GetItem PARTIDA#<id> / TURNO#<N>` |
| 3 | Ocupación de refugios | `Query PARTIDA#<id>, SK begins_with REFUGIO#` |

Nunca `Scan`.

**Orden de escritura de un turno:** el simulador mueve los zombies → escribe `TURNO#N` con `completo: false` y sin `siguienteNodo` → llama a `/paso` por cada sobreviviente → con las respuestas hace **un** `UpdateItem` que agrega el `siguienteNodo` de cada uno y marca `completo: true`. El motor lee `TURNO#N` aunque esté incompleto (solo necesita zombies y bloqueos); `/estado` muestra el último turno con `completo: true`, así el mapa nunca ve un turno a medias.

**`/paso` no escribe en DynamoDB.** Guardar la ruta de cada sobreviviente serían 200 escrituras por turno en el camino crítico de la latencia. La ruta que muestra el mapa se calcula a pedido en `GET /api/sobrevivientes/:id/ruta`, con la misma función de `shared/` que usa `/paso`. La única escritura del motor es el contador de refugios (Pro).

### 4.3 Regla crítica: `/paso` siempre válido y siempre a tiempo

1. **Validez:** `siguienteNodo` es el mismo nodo o un vecino por una calle no bloqueada en ese turno. Se valida **antes de responder**, con la misma función de `shared/` que usa el simulador.
2. **A tiempo:** presupuesto interno de **300 ms**. Si el cálculo no termina, se responde un paso seguro de respaldo: quedarse quieto si el nodo es seguro, o el vecino seguro más cercano al refugio. Nunca un 500.
3. **Recalcular siempre:** A* en **cada** pedido, con los zombies del turno. No se guarda ninguna ruta entre turnos.
4. **Estado compartido:** el turno N se lee de DynamoDB. Cada instancia de Lambda lo cachea **por número de turno** (si el pedido trae `turno` = N, usa el N cacheado o lo lee). Así 200 pedidos del mismo turno cuestan pocas lecturas, y ninguna instancia usa un turno viejo.

### 4.4 Costo de peligro (lo que decide la supervivencia)

| Situación | Costo |
|---|---|
| Nodo con zombie visible | Prohibido |
| Horda: su nodo **y todos sus vecinos** | Prohibido (la trampa del jurado) |
| Calle bloqueada (evento) | No existe |
| Nodos a los que un **corredor** llega el próximo turno (2 calles; si persigue, hacia el sobreviviente) | Muy alto (Pro: predicción) |
| Nodos vecinos de un **caminante** | Alto |
| Calle por la que un zombie podría venir de frente en el próximo turno (regla del cruce) | Prohibido |
| Cerca de donde podría haber dormidos (no se ven: no hay datos) | Sin costo: el motor no hace trampa con información invisible |

Costo base de una calle: `1 turno + ε × tiempo(distancia_m, tipo)` (si Q2 confirma "una arista por turno"). **No** usar solo `distancia_m / velocidad`: la eficiencia se puntúa en turnos, y optimizar en tiempo elige rutas con más saltos. Objetivo: el refugio que minimiza el costo total, con penalización si está lleno (Pro).

### 4.5 Estados del sobreviviente

```text
en_ruta → a_salvo (llegó a un refugio)
en_ruta → mordido (fuera de la partida)
```

---

## 5. Contrato de la API

Base: `https://<dominio-cloudfront>/api`. CloudFront manda `/api/*` a API Gateway sin quitar el prefijo, y Hono usa `basePath('/api')`.

```text
POST /api/paso                     x-api-key obligatorio
  body  { "sobrevivienteId": "S-0089", "nodoActual": "N-0117", "turno": 142 }
  200   { "siguienteNodo": "N-0118" }
  400   body inválido · 401 sin API key o incorrecta
  Cache-Control: no-store · p95 objetivo ≤ 150 ms · tope interno 300 ms

GET  /api/estado                   público (solo lectura, sin secretos)
  200   { "turno": 142, "ronda": 2, "zombies": [{ "id", "tipo", "nodo" }], "aristasBloqueadas": ["C-0042"],
          "sobrevivientes": [{ "id", "nodo", "estado", "siguienteNodo" }], "refugios": [{ "id", "ocupacion", "capacidad" }],
          "metricas": { "vivos", "aSalvo", "mordidos", "p95ms" }, "generadoEn": "<ISO 8601>" }
  Cache-Control: no-store (cambia cada 2 s)
  Sin rutas: el snapshot queda chico. generadoEn alimenta el indicador "EN VIVO" (edad real del snapshot)

GET  /api/sobrevivientes/:id/ruta  público (solo lectura)
  200   { "sobrevivienteId": "S-0089", "turno": 142, "refugio": "R-01", "ruta": ["N-0117", "N-0118", "..."] }
  200   sobreviviente a_salvo o mordido → { ..., "ruta": [], "estado": "a_salvo" | "mordido" }
  200   sin refugio alcanzable este turno → { ..., "refugio": null, "ruta": ["<nodo actual>"], "motivo": "sin_ruta" }
  404   sobreviviente inexistente en la partida activa
  Usa el último turno con completo: true (el mismo que muestra /estado), para que ruta y mapa coincidan
  Se pide solo al seleccionar un sobreviviente en el mapa; la calcula la misma función de shared/ que usa /paso

GET  /api/health                   público → { ok: true, service }
```

- La API key se guarda como variable de entorno de la Lambda, cargada desde una variable de Terraform (`TF_VAR_api_key`), **nunca en el código ni en un archivo commiteado**. Se compara en tiempo constante.
- Los dormidos **no** aparecen en `/estado` hasta que despiertan.
- Formato de error: `{ "ok": false, "error": { "code", "message" } }`. `/paso` responde **exactamente** `{ "siguienteNodo" }`, sin el sobre `{ ok, data }`, porque así lo pide el contrato oficial.

---

## 6. Convenciones de código

- TypeScript `strict`, sin `any`. Zod en todo lo que entra.
- **Rendimiento de `/paso`:** nada de `await` innecesarios, una sola lectura a DynamoDB por turno y por instancia, A* con cola de prioridad (binary heap) y vecinos precalculados en un `Map` al cargar el grafo.
- Bundle de la Lambda chico (sin dependencias pesadas) para que el arranque en frío quede lejos de 500 ms. Memoria de la Lambda: **1024 MB** (más CPU = A* más rápido y arranque más corto).
- Las reglas del juego en `shared/`, con tests: movimiento de cada tipo de zombie, mordida por nodo, mordida por cruce, horda que bloquea vecinos, dormido que despierta a 2 nodos o menos.
- Front: TanStack Query con `refetchInterval: 2000` para `/estado`. MapLibre solo en client components (`"use client"` + `dynamic(..., { ssr: false })`, porque usa `window` y WebGL). Reglas del mapa en §2.

## 7. Flujo de trabajo con Git

- `main` protegida: PR + 1 aprobación. Una rama por tarea (`feat/k1-astar`, `feat/n2-capa-zombies`...).
- Conventional commits en inglés. **Historial real** (lo evalúan): commits chicos y frecuentes, nunca uno gigante al final.
- Antes de pushear: tests del paquete tocado + typecheck.

## 8. Deploy

Igual que en `INFRA.md` §3: **backend primero**, después el front con el comando largo (`MSYS_NO_PATHCONV=1 ... NEXT_PUBLIC_USE_MOCKS=false NEXT_PUBLIC_API_URL=/api npm run build -w frontend`), sync e invalidación. Siempre `terraform plan -out=tfplan` y leerlo antes de `apply tfplan`.

---

## 9. Plan de trabajo

Hoy es lunes 26. Hay **unas 48 horas** hasta el miércoles a las 10:00.

### Fase 0 — Base común (lunes, hasta las 14:00)

| ID | Tarea | Dueño | Listo cuando |
|---|---|---|---|
| T0.1 | Preguntas Q1–Q4 a la organización | Anthony | Respuestas anotadas en §0 |
| T0.2 | Tipos y schemas en `shared/`: `Nodo`, `Calle`, `Refugio`, `Zombie`, `EstadoTurno`, `PasoInput/Output` | Kevin | Tests en verde, PR aprobado por los 3 |
| T0.3 | Grafo de Manta desde OSM → `shared/data/manta.json` (~300 nodos, conectado, 4 refugios, barrios de inicio) | Alex | Test: el grafo es conexo y cada refugio es alcanzable desde los 4 barrios |
| T0.4 | Infra desplegada: tabla, Lambda 1024 MB, throttling, API key por `TF_VAR` | Alex | `curl <site>/api/health` responde; `/paso` sin key da 401 |
| T0.5 | AWS Budget con alerta + captura `docs/budget.png` | Anthony | Captura commiteada |
| T0.6 | Interfaz `FuenteMundo` (`obtenerTurno(n)`) con `DynamoFuente`; `HttpFuente` solo si Q3 = "corren el suyo" (R1) | Kevin | Test: el motor recibe el mundo por la interfaz, nunca importa DynamoDB directo |
| T0.7 | Primer commit y rama `main` en GitHub con la base actual (hoy todo está sin trackear en `master`) | Anthony | `main` protegida en GitHub, cada uno trabaja en su rama |

### Fase 1 — En paralelo (lunes tarde → martes tarde)

| Motor (Kevin) | Simulador + datos (Alex) | Mapa (Anthony) |
|---|---|---|
| K1 A* con costo base (turnos + tiempo por tipo) | S1 Mundo y turnos de 2 s (zombies primero, después sobrevivientes) | N1 Mapa MapLibre con el grafo (calles con geometría) y los refugios |
| K2 Costos de peligro de §4.4 (horda + vecinos, cruce) | S2 Las 4 reglas de zombies + eventos de ciudad | N2 Capas en vivo: zombies (ícono por tipo), sobrevivientes, calles bloqueadas, zonas de horda |
| K3 `POST /paso` con validación, respaldo a 300 ms y cache por turno | S3 Mordidas (nodo y cruce) y llegada a refugio | N3 Panel: ronda, turno, vivos / a salvo / mordidos, p95 |
| K4 Elección de refugio + capacidad (Pro) | S4 Las 3 rondas de la prueba de fuego + métricas (supervivencia, eficiencia, p95, errores) | N4 Polling de `/estado` cada 2 s + indicador "en vivo" con la edad real del snapshot + selección de un sobreviviente con su ruta y *flash* de recálculo |
| K5 Predicción de corredores (Pro) | S5 `GET /estado` alimentado desde DynamoDB | N5 Landing simple: qué es, cómo se usa |
| K6 `GET /api/sobrevivientes/:id/ruta` con la misma función de `shared/` que `/paso` (lo necesita N4) | S6 Simulador como Lambda (ronda completa por invocación) + EventBridge Scheduler para el modo demo, en Terraform con rol de mínimo privilegio | N6 Auto-selección de un sobreviviente al cargar + flecha al `siguienteNodo` de cada uno |

**Integración temprana:** apenas `/paso` responde en AWS (aunque sea con A* sin peligro), el simulador corre la R1 contra AWS. Nada de esperar al martes para probar de punta a punta.

### Fase 2 — Prueba de fuego propia (martes noche)

- Las 3 rondas seguidas contra AWS, 3 veces. Anotar supervivencia, eficiencia, p95 y errores de cada corrida.
- Ajustar costos de peligro según dónde mueren los sobrevivientes.
- Si el p95 de la R3 pasa de 150 ms: revisar arranques en frío en CloudWatch y, si hace falta, *provisioned concurrency* solo durante la prueba (y declararlo en costos).

### Fase 3 — Entregables (miércoles hasta las 10:00)

- [ ] README completo: qué hace, desplegar, probar, decisiones, limitaciones, budget, URL de `/paso`, cómo correr el simulador, cómo se mide la latencia.
- [ ] `docs/arquitectura.png` + `.drawio`, enlazado desde el README.
- [ ] `docs/costos.md`: costo mensual con cálculo visible + gasto real del evento.
- [ ] Repo **público**, sin secretos (revisar el historial completo antes de hacerlo público).
- [ ] URL pública funcionando hasta el viernes.
- [ ] Pitch (≤ 20 MB) y, si hay tiempo, video.

### Camino crítico

```text
T0.3 grafo → K1 A* → K3 /paso en AWS → S4 rondas → ajuste de costos → entrega
```

### Puntos de control (si uno falla, se para y se resuelve antes de seguir)

| Cuándo | Control | Si falla |
|---|---|---|
| Lunes 14:00 | Q1 y Q3 respondidas (R1, R2) | Seguir con lo asumido en §0, pero Kevin prioriza `FuenteMundo` |
| Lunes 18:00 | `/api/health` en AWS y `/paso` sin key → 401 | Alex deja todo y destraba la infra |
| Lunes noche | `/paso` con A* sin peligro en AWS + R1 del simulador contra AWS | No se arranca nada Pro |
| Martes 18:00 | R2 y R3 corren de punta a punta con el mapa en vivo | Se recortan Pro y landing |
| Martes noche | p95 de la R3 ≤ 150 ms y errores < 0,5 % (R3 de riesgos) | Calentamiento y luego *provisioned concurrency* solo para la prueba |
| Miércoles 08:00 | Repo público revisado sin secretos (R9) | Nada se entrega hasta revisarlo |

---

## 10. Secrets y cuenta

- Nunca se commitean `.env*`, `*.tfvars`, `*.tfstate`, `.terraform/`, `*.csv`, keys ni la API key. Revisar con `git log -p` antes de hacer público el repo.
- Cada integrante usa su usuario IAM con `aws configure --profile spookython` y `AWS_PROFILE=spookython` (región `us-east-2`; ver `CONTRIBUTING.md`). Los datos de la cuenta **no** van en este repo: el bucket del state va en `infra/backend.hcl` (gitignored) y la API key en `TF_VAR_api_key`.

## 11. Lecciones aprendidas

Ver `INFRA.md` §6 (troubleshooting). Las más importantes:
- el contrato (§5) se aprueba antes de codear;
- el build del front se hace solo con el comando de §8 y se verifica `useMocks:!1`;
- siempre `terraform plan` antes de `apply`;
- en PowerShell nunca crear archivos de configuración con `echo >`, porque quedan en UTF-16.
