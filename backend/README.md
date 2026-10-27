# Fuente del mundo — T0.6

El motor depende de `FuenteMundo`, no del SDK de DynamoDB. La implementación
`DynamoFuente` queda en `src/db/`; la interfaz y los errores de dominio están en
`src/motor/fuente-mundo.ts`. No implementa A*, `/paso`, el candado ni el simulador.

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
