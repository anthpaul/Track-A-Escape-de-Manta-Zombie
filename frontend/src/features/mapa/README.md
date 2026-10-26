# Feature `mapa` — mapa en vivo

Organizada por capas. **Las dependencias solo apuntan hacia adentro**: `domain` no conoce a nadie; `map`, `data` y `ui` dependen de `domain`; solo `PantallaMapa` conoce a todos.

```text
mapa/
├── index.ts              API pública: el resto de la app importa solo de acá
├── PantallaMapa.tsx      Contenedor: elige la fuente de datos y arma mapa + sidebar
├── domain/               TypeScript puro (sin React, sin MapLibre), con tests
│   ├── tipos.ts          Grafo y snapshot de /api/estado (copia temporal de shared/ hasta T0.2)
│   ├── grafo.ts          Vecinos y nodos bloqueados por hordas
│   ├── seleccion.ts      A qué sobreviviente se sigue
│   └── resumen.ts        Cifras del panel y nivel de latencia (tramos oficiales)
├── map/                  Todo lo específico de MapLibre
│   ├── MapaBase.tsx      Mapa base, worker, errores de estilo, clics
│   ├── MapaVivo.tsx      Compone las capas (un solo chunk para el orden de capas)
│   ├── config.ts         Centro, límites y estilo de Manta
│   ├── geojson/          Conversores puros dominio → GeoJSON, con tests
│   └── layers/           Capas, estilos de MapLibre e íconos Lucide del mapa
├── data/                 Fuentes de datos
│   └── mock/             Grafo y simulación de prueba (se reemplazan por manta.json y /api/estado)
└── ui/                   Componentes de presentación (sin lógica de negocio)
    └── sidebar/          Barra lateral con la información de la ronda
```

## Reglas

| Regla | Por qué |
|---|---|
| `domain/` no importa React, MapLibre ni nada de `map/`, `data/` o `ui/` | Se testea sin navegador y se puede reemplazar por `shared/` sin tocar la UI |
| Los componentes de `ui/` reciben datos ya calculados (props) | Patrón contenedor-presentacional: la lógica vive en `domain/` y se testea ahí |
| Toda decisión de fuente de datos (mock o API real) está en `PantallaMapa.tsx` | Pasar de mock a `/api/estado` (N4) cambia un solo archivo |
| Los colores del tema van por tokens (`bg-card`, `text-primary`); los de las capas, en `map/layers/estilos.ts` | Ver la regla de oro de UI en `AGENTS.md` §6 |
| Tests junto al archivo que prueban (`x.ts` + `x.test.ts`) | Se encuentran solos; `npm test -w frontend` los corre todos |
