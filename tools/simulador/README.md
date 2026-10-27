# Preparación local del simulador

Este primer paso carga y valida `shared/data/manta.json`, prepara el turno cero
y valida las entidades iniciales usando los schemas de `shared/`.

## Verificación

Desde la raíz del repositorio, con las dependencias existentes instaladas:

```powershell
node --import tsx --test tools/simulador/preparar.test.ts
node node_modules/typescript/bin/tsc -p tools/simulador/tsconfig.json
```

## Uso desde TypeScript

```ts
import { prepararPartida } from "./preparar";

const partida = await prepararPartida({
  semilla: 42,
  zombies: [],
  sobrevivientes: [],
});
```

Las cantidades y posiciones se reciben explícitamente; no son todavía las rondas
oficiales. Cada zombie usa `{ id, tipo, nodo }` y cada sobreviviente
`{ id, nodo, estado: "en_ruta" }`. Los nodos deben existir y los IDs no pueden
repetirse dentro de cada grupo. La semilla es un entero entre 0 y 4294967295.
El generador `partida.aleatorio()` produce la misma secuencia para la misma
semilla; se utilizará al implementar movimiento. Preparar no mueve entidades.

El mundo interno conserva los dormidos: no es un snapshot público de `/estado`.
No hay llamadas HTTP, escrituras en DynamoDB, reglas de mordida ni turnos de
dos segundos en este paso. El siguiente paso es conectar el loop local.
