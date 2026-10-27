# Contratos y grafo compartidos — T0.2

Schemas Zod y tipos derivados para el motor, el simulador y el mapa. El contrato
vigente está en `../docs/CONTRATO_GRAFO.md` y `../docs/HOJA_DE_RUTA.md` §2.
No implementa A*, movimiento de zombies, mordidas, DynamoDB ni endpoints.

## Uso

```ts
import { crearGrafo } from "@abcstack/shared";
import mapa from "@abcstack/shared/data/manta.json";

// Una sola vez al cargar el grafo estático, no por sobreviviente.
const grafo = crearGrafo(mapa);
const vecinos = grafo.vecinos("N-0001");
const valido = grafo.esMovimientoValido("N-0001", "N-0002", new Set<string>());
```

| API | Contrato |
|---|---|
| `GrafoSchema.parse(input)` | Valida campos, IDs únicos, referencias, parejas no repetidas y geometrías orientadas con extremos exactos. Acepta fixtures reducidos. |
| `crearGrafo(input)` | Valida y copia el grafo; precalcula adyacencia bidireccional y búsqueda de calles mediante `Map`. No modifica la entrada. |
| `vecinos(nodo)` | Vecinos estáticos de un nodo; colección inmutable, vacía para un nodo desconocido. |
| `calleEntre(a, b)` | La misma calle inmutable en ambos sentidos, o `undefined`. Conserva la orientación original de su geometría. |
| `esMovimientoValido(a, b, bloqueos)` | Admite quedarse en un nodo existente o ir a un vecino por una calle no bloqueada. Acepta array o `ReadonlySet` de IDs; reutilizar un set para muchas consultas. No evalúa peligro. |
| `nodosBloqueadosPorHordas(zombies)` | Nuevo `Set` con cada horda y sus vecinos estáticos, sin extenderse a dos saltos. |
| `VELOCIDADES_M_S` | Constantes compartidas por tipo de calle; no duplicadas en el JSON. |
| `EstadoTurnoSchema` | Valida el contrato común de turno; su colección `zombies` rechaza dormidos. `ZombieSchema` sí admite los cuatro tipos para las reglas internas. |

El fixture `data/fixture-mini.json` es sintético: 12 nodos, 15 calles, un puente
y dos refugios, con los cuatro barrios representados. Sus distancias y capacidades
son datos de prueba, no mediciones reales ni capacidades oficiales. El archivo
real `data/manta.json` no se modifica; sus limitaciones están en `data/README.md`.

Los exports existentes de `/paso` conservan su comportamiento y nombres. Los
campos opcionales `refugio` y `callesRestantes` del sobreviviente se conservan.
Estos schemas no sustituyen las comprobaciones de estado contra el grafo vigente
ni implementan la persistencia: `PK`, `SK` y `ttl` pertenecen a la capa de datos.

## Verificación

```sh
npm test -w shared
npm run typecheck -w shared
```

K1 implementará A* con cola de prioridad y costo por turnos más tiempo de calle,
reutilizando esta adyacencia. T0.2 no cambia esa decisión ni activa funcionalidades
Pro. La integración del frontend y la aprobación del PR por los tres integrantes
siguen pendientes.
