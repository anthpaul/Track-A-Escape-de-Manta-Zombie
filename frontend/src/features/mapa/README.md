# Feature `mapa` — mapa en vivo

Organizada por capas. **Las dependencias solo apuntan hacia adentro**: `domain` no conoce a nadie; `simbologia` solo conoce `domain`; `map`, `data` y `ui` dependen de `domain` y `simbologia`, nunca entre sí; solo `PantallaMapa` conoce a todos. `arquitectura.test.ts` hace fallar los tests si alguien rompe esta regla.

```text
mapa/
├── index.ts              API pública: el resto de la app importa solo de acá
├── PantallaMapa.tsx      Contenedor: elige la fuente de datos y arma mapa + sidebar
├── arquitectura.test.ts  Verifica la regla de dependencias
├── domain/               TypeScript puro (sin React, sin MapLibre), con tests
│   ├── tipos.ts          Grafo y snapshot de /api/estado (copia temporal de shared/ hasta T0.2)
│   ├── grafo.ts          Vecinos y nodos bloqueados por hordas
│   ├── seleccion.ts      A qué sobreviviente se sigue
│   ├── resumen.ts        Ronda, turno, supervivencia y nivel de latencia (tramos oficiales)
│   ├── panel.ts          Estado del panel (tabs, selección, filtros, capas, toast) como reducer puro
│   ├── alertas.ts        Alertas derivadas comparando un turno con el anterior
│   └── vistas.ts         Búsqueda, conteos de chips y capas, resumen de refugios
├── simbologia/           Colores con significado e íconos Lucide, compartidos por el mapa y la leyenda
│   ├── colores.ts
│   └── iconos.ts
├── map/                  Todo lo específico de MapLibre
│   ├── MapaBase.tsx      Mapa base, worker, errores de estilo, clics
│   ├── MapaVivo.tsx      Compone las capas (un solo chunk para el orden de capas)
│   ├── config.ts         Centro, límites y estilo de Manta
│   ├── tema-mapa.ts      Recolorea el mapa base de CARTO con la paleta 2
│   ├── geojson/          Conversores puros dominio → GeoJSON, con tests
│   └── layers/           Capas, estilos de MapLibre y registro de íconos
├── data/                 Fuentes de datos
│   ├── real/             Grafo real de Manta (T0.3) y polling de GET /api/estado cada 2 s (N4), validado con Zod
│   └── mock/             Simulación en el navegador: se usa mientras no hay partida o la API no responde (marca SIMULADO)
└── ui/                   Componentes de presentación (sin lógica de negocio)
    ├── MedidorFps.tsx    Overlay de depuración (?debug)
    └── panel/            Riel interactivo: RielIconos, PanelLateral, BarraTurno, IndicadorEnVivo y tabs/ (Refugios, Sobrevivientes, Capas, Alertas)
```

## Reglas

| Regla | Por qué |
|---|---|
| `domain/` no importa React, MapLibre ni nada de `map/`, `data/` o `ui/` | Se testea sin navegador y se puede reemplazar por `shared/` sin tocar la UI |
| Los componentes de `ui/` reciben datos ya calculados (props) | Patrón contenedor-presentacional: la lógica vive en `domain/` y se testea ahí |
| Toda decisión de fuente de datos (mock o API real) está en `PantallaMapa.tsx` | Pasar de mock a `/api/estado` (N4) cambia un solo archivo |
| Los colores del tema van por tokens (`bg-card`, `text-primary`); los de significado (capas y leyenda), en `simbologia/colores.ts` | Ver la regla de oro de UI en `AGENTS.md` §6 |
| Tests junto al archivo que prueban (`x.ts` + `x.test.ts`) | Se encuentran solos; `npm test -w frontend` los corre todos |

## Datos en vivo (N4)

| Variable | Valor | Efecto |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCKS` | `false` | Pide `GET <API_URL>/estado` cada 2 s. Sin la variable, solo simulación local |
| `NEXT_PUBLIC_API_URL` | `/api` en producción · `http://localhost:3001/api` con `npm run dev -w backend` | Base de la API |

Si `/estado` responde `{ ok: false }` (no hay partida) o falla, el mapa sigue con la simulación y el panel dice por qué: **CONECTANDO**, **SIN PARTIDA** o **SIN CONEXIÓN** (con **SIMULADO**). Si ya había partida real, se conserva el último turno durante 6 s (**RECONECTANDO**) antes de volver a la simulación, y al cambiar de fuente las alertas arrancan de cero (`data/real/conexion.ts`). Con partida real, la ruta del sobreviviente seguido sale de `GET /api/sobrevivientes/:id/ruta` (K6), una vez por turno; mientras carga se dibuja un camino local para que siempre haya una ruta visible.
