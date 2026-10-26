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
│   └── resumen.ts        Cifras del panel y nivel de latencia (tramos oficiales)
├── simbologia/           Colores con significado e íconos Lucide, compartidos por el mapa y la leyenda
│   ├── colores.ts
│   └── iconos.ts
├── map/                  Todo lo específico de MapLibre
│   ├── MapaBase.tsx      Mapa base, worker, errores de estilo, clics
│   ├── MapaVivo.tsx      Compone las capas (un solo chunk para el orden de capas)
│   ├── config.ts         Centro, límites y estilo de Manta
│   ├── geojson/          Conversores puros dominio → GeoJSON, con tests
│   └── layers/           Capas, estilos de MapLibre y registro de íconos
├── data/                 Fuentes de datos
│   └── mock/             Grafo y simulación de prueba (se reemplazan por manta.json y /api/estado)
└── ui/                   Componentes de presentación (sin lógica de negocio)
    ├── MedidorFps.tsx    Overlay de depuración (?debug)
    └── sidebar/          Barra lateral: Sidebar + secciones Ronda, Sobreviviente, Refugios y Leyenda
```

## Reglas

| Regla | Por qué |
|---|---|
| `domain/` no importa React, MapLibre ni nada de `map/`, `data/` o `ui/` | Se testea sin navegador y se puede reemplazar por `shared/` sin tocar la UI |
| Los componentes de `ui/` reciben datos ya calculados (props) | Patrón contenedor-presentacional: la lógica vive en `domain/` y se testea ahí |
| Toda decisión de fuente de datos (mock o API real) está en `PantallaMapa.tsx` | Pasar de mock a `/api/estado` (N4) cambia un solo archivo |
| Los colores del tema van por tokens (`bg-card`, `text-primary`); los de significado (capas y leyenda), en `simbologia/colores.ts` | Ver la regla de oro de UI en `AGENTS.md` §6 |
| Tests junto al archivo que prueban (`x.ts` + `x.test.ts`) | Se encuentran solos; `npm test -w frontend` los corre todos |
