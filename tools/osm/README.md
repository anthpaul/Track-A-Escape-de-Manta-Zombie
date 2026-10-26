# Descarga original de Manta — paso B

Descarga datos de OpenStreetMap sin reducir nodos, elegir refugios ni generar
`shared/data/manta.json`. El contrato final sigue en `docs/CONTRATO_GRAFO.md`.

## Ejecutar en PowerShell

Desde la raíz del repositorio, con Python 3.11 o posterior:

```powershell
py -m venv "$env:LOCALAPPDATA\manta-osm-venv"
& "$env:LOCALAPPDATA\manta-osm-venv\Scripts\python.exe" -m pip install -r tools/osm/requirements.txt
& "$env:LOCALAPPDATA\manta-osm-venv\Scripts\python.exe" -B -m unittest discover -s tools/osm -p 'test_*.py'
& "$env:LOCALAPPDATA\manta-osm-venv\Scripts\python.exe" -B tools/osm/download.py
```

Cada ejecución crea una carpeta distinta en `tools/osm/data/raw/`, excluida de Git:

- `manta-original.graphml`: red original, con todos sus componentes y sin simplificar.
- `responses/`: respuestas originales de las consultas, para conservar la fuente.
- `neighborhoods.geojson`: lugares etiquetados como barrios en OSM.
- `report.json`: parámetros, cantidades, puentes, nombres encontrados y hashes SHA-256.

No se sobrescriben descargas anteriores. Una consulta fallida termina con error;
si falla la consulta de barrios, conserva el grafo descargado y registra el fallo.
OSM puede cambiar entre ejecuciones: conservar respuestas y hashes permite
identificar la descarga usada. No publicar el entorno virtual ni caches de Python.

## Área y comprobaciones

El rectángulo inicial es oeste -80.80, sur -1.03, este -80.65, norte -0.92.
Es una zona amplia de trabajo, **no un límite oficial de los cuatro barrios**.
El informe busca etiquetas Tarqui, Los Esteros, Barbasquillo y Jocay. Encontrar
un nombre no demuestra cobertura completa; si falta una etiqueta, tampoco prueba
que falten calles. Revisar límites y cobertura antes de dar el mapa por aprobado.

Se usa la red peatonal `walk` porque las entidades se desplazan a pie; esta descarga
incluye conexiones que habrá que clasificar en el paso C. `simplify=False` y
`retain_all=True` evitan reducir la red o descartar componentes en este paso.
Los IDs de puentes corresponden a vías OSM, no a calles `C-0000` del juego.

Se puede cambiar el área con `--bbox WEST SOUTH EAST NORTH` o el destino con
`--output-dir PATH`. Ver `--help`. No se consulta AWS ni se usan credenciales.

## Fuentes

- [API oficial de OSMnx](https://osmnx.readthedocs.io/en/stable/user-reference.html).
- [OpenStreetMap y atribución](https://www.openstreetmap.org/copyright):
  © OpenStreetMap contributors, datos bajo ODbL 1.0.

## Generar el grafo del juego — C y D

Alex autorizó la limpieza y exportación con los cuatro refugios definidos en
`manta.config.json`. Con los originales descargados:

```powershell
& "$env:LOCALAPPDATA\manta-osm-venv\Scripts\python.exe" -B tools/osm/build.py --source-dir tools/osm/data/raw/osm-api-20261026T215858Z
```

Produce `shared/data/manta.json` y `shared/data/manta.provenance.json` sin internet
ni AWS. Ver `shared/data/README.md` para el método, límites y fuentes. Opciones:
`--source-dir`, `--config` y `--output`; `--help` explica el comando. Rechaza hashes
incorrectos, referencias alejadas de la red y salidas distintas ya existentes.
Con los mismos datos/configuración y entorno, la salida es determinista.

No se modifica `shared/index.ts`: los tipos y schemas T0.2 siguen a cargo de Kevin.

## Estado de ejecución — 26 de octubre de 2026

- Entorno aislado instalado y cuatro pruebas offline aprobadas.
- El servidor por defecto `overpass-api.de` devolvió 504 y luego 502 por saturación.
- Un intento con `overpass.private.coffee` agotó los 180 segundos al consultar su estado.
- Después se completó la descarga mediante la API oficial `/api/0.6/map`, subdividiendo
  el mismo rectángulo por su límite de 50.000 nodos por petición: 22 XML, 96.053.343 bytes.
- Los originales están en `data/raw/osm-api-20261026T215858Z`; `manifest.json` registra
  las URLs, subdivisiones y hashes. No se usó el descargador Overpass para este resultado.
- C/D produjeron 284 nodos y 384 calles. E verificó el grafo estático y la regeneración
  idéntica desde los originales locales; ver `shared/data/README.md`. Las carpetas de
  intentos fallidos anteriores no contienen mapas válidos.
