# Formato del grafo — acuerdo para Alex y Kevin

Alex generará el mapa y Kevin implementará su lectura y validación usando este mismo formato. Este documento cierra el paso A; no contiene datos reales de Manta ni inicia la extracción de OpenStreetMap.

## Qué hace cada uno

- **Alex:** genera `shared/data/manta.json` con las intersecciones, calles y cuatro refugios.
- **Kevin:** implementa los schemas Zod, exporta los tipos y construye las funciones de vecinos y movimientos válidos en `shared/`.
- **Anthony:** consume el mismo archivo para dibujar el mapa. No necesita otro formato.

## Formato elegido

Se conserva el modelo de `AGENTS.md` §4.1 y `docs/HOJA_DE_RUTA.md` §2. Los tipos siguientes describen el JSON; Kevin debe derivar los tipos definitivos de los schemas Zod, reutilizando los validadores de IDs existentes.

```ts
type Barrio = "tarqui" | "los_esteros" | "barbasquillo" | "jocay";

type Nodo = {
  id: string;
  lat: number;
  lng: number;
  barrio?: Barrio;
};

type Calle = {
  id: string;
  desde: string;
  hasta: string;
  distancia_m: number;
  tipo: "avenida" | "calle" | "callejon" | "puente";
  geometria: [number, number][];
};

type Refugio = {
  id: string;
  nodo: string;
  nombre: string;
  capacidad: number;
};

type Grafo = {
  version: string;
  nodos: Nodo[];
  calles: Calle[];
  refugios: Refugio[];
};
```

## Decisiones para trabajar igual

| Tema | Decisión |
|---|---|
| IDs | Nodos `N-0001`, calles `C-0001`, refugios `R-01`. Sin duplicados dentro de cada colección. |
| Sentido de calles | Todas son transitables en ambos sentidos para el juego. No se preservan los sentidos únicos de OSM. Bloquear un ID bloquea ambos sentidos. |
| Calles paralelas | El archivo final tiene como máximo una calle por pareja de nodos, independientemente del orden. Así, devolver el siguiente nodo identifica una sola calle. |
| Distancias | Metros del recorrido de la calle, siempre mayores que cero. |
| Coordenadas | Nodos con `lat` y `lng`; geometrías en orden `[lng, lat]`, desde `desde` hacia `hasta`. Para recorrer al revés se invierte el orden visual. |
| Barrios | Solo los cuatro valores indicados. Todo nodo elegible para iniciar sobrevivientes tiene barrio. |
| Velocidades | Constantes compartidas por tipo: avenida 1.6, calle 1.4, puente 1.2 y callejón 1.0 m/s. No se duplican en el JSON. |
| Versión | Texto que cambia al modificar nodos, calles, geometrías o refugios. Los IDs no se reasignan dentro de una misma versión. |
| Estado del juego | Zombies, bloqueos y ocupación actual no van en este archivo estático. |

**Simplificación de calles paralelas:** Alex conservará la conexión de menor distancia; si empatan, usará el ID de origen de OSM como desempate estable. Mantendrá juntos su tipo, distancia y geometría, sin mezclar atributos de calles distintas. Documentará las conexiones descartadas. El puente elegido para R2 debe existir en el grafo final y proceder de datos reales; no se inventará su tipo para cumplir el escenario.

**Capacidad de refugios:** el campo se conserva porque ya pertenece al contrato. Sus valores siguen pendientes de Q4; este acuerdo no asigna capacidades ni activa el límite Pro. Esto no bloquea implementar el schema, pero sí completar ese dato del grafo final sin un acuerdo posterior.

## Comprobaciones de Kevin

- Campos con los tipos indicados y coordenadas finitas dentro de sus rangos geográficos.
- IDs válidos y únicos; extremos de calles y nodos de refugios existentes.
- Distancias positivas; sin calles que conecten un nodo consigo mismo ni parejas duplicadas.
- Geometrías con al menos dos puntos y extremos correspondientes a sus nodos.
- Capacidad como entero no negativo; cero significa cero lugares, no capacidad ilimitada.

Alex comprobará además conectividad, cobertura de los cuatro barrios y acceso a los cuatro refugios. El mapa real tendrá aproximadamente 300 nodos y cuatro refugios; los fixtures pequeños de pruebas pueden tener menos.

## Próximo paso

Kevin puede implementar T0.2 con este contrato. Alex no inicia la extracción OSM (paso B) hasta que lo autorice el usuario. El PR de contratos compartidos lo revisan los tres, como establece la hoja de ruta.
