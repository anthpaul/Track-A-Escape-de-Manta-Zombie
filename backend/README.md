# Fuente del mundo — T0.6

## `/paso`: verificación del handler de producción

`src/routes/paso.ts` exporta `crearRutaPaso` para inyectar la fuente, el resolver
de partida y la clave en pruebas sin llamadas a AWS. La instancia desplegada y
los tests usan el mismo handler; `paso.test-factory.ts` es solo un adaptador.

- Autenticación: compara resúmenes SHA-256 de longitud fija con `timingSafeEqual`,
  incluyendo todos los bytes de la clave; una clave configurada vacía rechaza todo.
- Éxito: devuelve exactamente `{ siguienteNodo }` y `Cache-Control: no-store`.
- Respaldo: captura errores del resolver, la fuente o el motor y limita la espera
  asíncrona a 300 ms. Sin un snapshot conocido, devuelve el nodo actual; no inventa
  un mundo vacío. Si conoce el peligro y el nodo actual es inseguro, busca un vecino
  transitable seguro próximo a un refugio; si no existe, permanece quieto.
- Antes de responder, valida el formato y el movimiento con
  `contextoGrafo.indexado.esMovimientoValido` y los bloqueos del snapshot leído.

Las pruebas usan el grafo real empaquetado, no suponen los IDs de refugios ni
las conexiones del fixture pequeño. No prueban despliegue ni latencia en AWS.
La fecha límite asíncrona no interrumpe trabajo JavaScript síncrono; el tiempo
real de cómputo y la latencia de red deben medirse con las rondas desplegadas.

El motor depende de `FuenteMundo`, no del SDK de DynamoDB. La implementación
`DynamoFuente` queda en `src/db/`; la interfaz y los errores de dominio están en
`src/motor/fuente-mundo.ts`. No implementa A*, `/paso`, el candado ni el simulador.

## Supervivencia: predicción de corredores (K5) y escape sin ruta

- **K5** (`src/motor/peligros.ts`): cada nodo al que un corredor llega en su próximo
  turno (hasta 2 calles no bloqueadas, igual que `moverZombie` en `shared/`) suma
  `RUNNER_PREDICTION_PENALTY` (0,9). Se penaliza, no se prohíbe: prohibirlo dejó más
  sobrevivientes sin ruta y bajó la supervivencia en las pruebas.
- **Escape** (`src/motor/evasion.ts`): si el A* no encuentra ningún refugio alcanzable,
  el sobreviviente ya no se queda quieto. Elige, entre quedarse y los vecinos legales,
  el nodo más lejano (en calles) de los zombies que se mueven (AGENTS.md §4.3, regla 2).

Medición local con los escenarios S4 de `tools/simulador`, el motor real en proceso y
16 semillas por ronda (no mide red ni AWS; los escenarios no son los del jurado):

| Ronda | Vivos antes | Vivos con K5 + escape |
|---|---|---|
| R1 | 95,6 % | 95,3 % |
| R2 | 25,2 % | 34,1 % |
| R3 | 13,8 % | 17,3 % |

Cálculo de un paso en proceso: p95 de 3 ms y máximo de 20 ms sobre 75 301 pasos.

## `GET /api/sobrevivientes/:id/ruta` — K6

`src/routes/sobrevivientes.ts` responde la ruta planificada completa de un
sobreviviente sobre el último turno completo, el mismo que muestra `/estado`.
`src/motor/ruta.ts` recorre `buscarRuta` paso a paso sobre ese mundo congelado,
sin modificar el A* de `/paso`: el primer paso coincide con lo que respondería
`/paso` y su latencia no cambia. Respuestas: `200` con `ruta` (en ruta), `ruta: []`
y `estado` (a salvo o mordido), `motivo: "sin_ruta"` si no hay refugio alcanzable;
`400` con un id fuera del formato `S-0000`; `404` si el sobreviviente no está en la
partida activa o no hay partida. En el grafo real de Manta, la ruta desde cualquiera
de los 284 nodos llega a un refugio, con un peor caso local de unos 100 ms.

## Contrato que consume el motor

```ts
import type { FuenteMundo } from "./src/motor/fuente-mundo";

async function leerPeligro(fuente: FuenteMundo, partidaId: string, turno: number) {
  return fuente.obtenerTurno(partidaId, turno);
}
```

El resultado `MundoTurno` contiene `partidaId`, el `turno` **realmente obtenido**,
`zombies` visibles y `aristasBloqueadas`. Es una proyección inmutable del peligro,
no un `EstadoTurno` completo: no inventa `ronda` ni lee METADATA para rellenarla.
La identidad sale de las claves; si también aparece en `data`, debe coincidir.

Esto permite cachear el peligro aunque el simulador actualice posiciones,
`siguienteNodo` y `completo` al cerrar el turno. `/estado` deberá leer snapshots
completos por su propio camino; no reutilizar esta caché para el mapa.

## Composición posterior en K3

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoFuente } from "./src/db/dynamo-fuente";
import type { FuenteMundo } from "./src/motor/fuente-mundo";

const table = process.env.DDB_TABLE;
if (!table) throw new Error("DDB_TABLE is required");

// Reuse the client and source outside the handler. AWS_REGION is supplied by Lambda.
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const fuente: FuenteMundo = new DynamoFuente(client, table);
```

El constructor no envía solicitudes. Las credenciales se mantienen en el mecanismo
normal de AWS, nunca en el código. Resolver la partida activa mediante `CONTROL`
corresponde a K3; esta interfaz recibe el `partidaId` explícito.

## Lectura y caché

| Caso | Comportamiento |
|---|---|
| Turno exacto | `GetCommand`, claves de `KEYS.turno` y `ConsistentRead: true`. |
| Turno ausente | `QueryCommand` de la misma partida entre los turnos 0 y N, descendente y `Limit: 1`, sin filtros ni `Scan`. Puede encontrar N si se publicó entre ambas lecturas. |
| Turno anterior de respaldo | Devuelve su número real y lo cachea bajo ese número, nunca bajo N. El siguiente pedido de N vuelve a buscarlo. |
| Turno incompleto | Acepta `completo: false`: zombies y bloqueos ya están publicados. |
| Lecturas simultáneas | Los pedidos de la misma pareja `(partidaId, N)` comparten una promesa en vuelo. Un fallo libera la entrada para reintentar. |
| Caché local | Como máximo 32 turnos por instancia; `maxTurnosEnCache` permite ajustar ese límite. La expulsión de entradas antiguas solo obliga a releer DynamoDB. |
| Vencimiento | Comprueba `ttl` en epoch segundos tanto al leer como al reutilizar la caché; no espera al borrado físico de DynamoDB. |

El payload permanece dentro de `data`, con `PK`, `SK` y `ttl` en la raíz
(`../INFRA.md` §4 y `../AGENTS.md` §4.2). Se validan con los schemas compartidos
los zombies visibles, bloqueos y flag `completo`; el motor no consume los otros
campos del snapshot. No se acepta silenciosamente un formato alternativo plano.

| Error de dominio | Significado |
|---|---|
| `INVALID_WORLD_REQUEST` | Partida vacía o turno fuera del rango entero 0–999999 que admite la clave de seis dígitos. |
| `TURN_NOT_FOUND` | No existe ningún turno menor o igual al solicitado en esa partida. |
| `INVALID_WORLD_DATA` | Payload inválido, dormidos visibles o identidad inconsistente. |
| `WORLD_EXPIRED` | El ítem ya venció lógicamente, aunque DynamoDB todavía lo conserve. |

Los errores de transporte del cliente se propagan y no se cachean. Ningún fallo
se convierte en un mundo vacío o una respuesta HTTP: K3 incorporará el presupuesto
de tiempo y la respuesta de respaldo. T0.6 no demuestra latencia contra AWS.

## Verificación local, sin AWS

```sh
npm test -w backend
npm run typecheck -w backend
```

Las pruebas inyectan un cliente falso y una fuente falsa; verifican lectura,
fallback, TTL, aislamiento, 200 pedidos simultáneos, recuperación tras fallos y
compatibilidad del cliente real a nivel de tipos. Se conservan los tests de
`KEYS` y el comportamiento de `/api/health`. No se necesitan credenciales.
