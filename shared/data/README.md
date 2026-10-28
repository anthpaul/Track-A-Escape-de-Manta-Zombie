# Grafo de Manta — salida de C y D

`manta.json` es el mapa estático para el motor, el simulador y el frontend.
Su estructura respeta `docs/CONTRATO_GRAFO.md`: `version`, `nodos`, `calles` y
`refugios`. No incluye zombies, bloqueos dinámicos ni ocupación actual.

## Resultado generado

- 284 nodos y 384 calles; red conectada, con alternativas y geometrías reales.
- Tipos: 101 avenidas, 225 calles, 42 callejones y 16 tramos de puente.
- Los cuatro barrios de inicio están representados.
- Cuatro refugios elegidos por Alex, con capacidad de 50 cada uno (Pro: 200 lugares para los 200 sobrevivientes de la R3; la organización no fijó un valor).
- `C-0199` es un puente real con un desvío disponible al quitar esa calle.

El archivo `manta.provenance.json` contiene los hashes de los originales, mapeos
de IDs del juego a IDs OSM, puntos de referencia, distancias a sus nodos de acceso,
parámetros de selección y advertencias. No es parte del snapshot de `/estado`.

## Cómo se redujo

1. Se unificaron los 22 XML originales, comprobando sus hashes y evitando duplicados.
2. Se conservaron vías peatonalmente utilizables según etiquetas OSM; se excluyeron
   vías con `access=no/private`, `foot=no`, autopistas y vías no construidas.
3. Se mantuvo el componente conectado mayor. OSMnx quitó puntos de forma, sin
   atravesar cambios de tipo de calle ni eliminar nodos de referencia.
4. La red seguía teniendo 13.228 nodos: simplificar curvas no alcanza para llegar a 300.
   Se seleccionaron corredores de menor distancia entre barrios/refugios, un puente
   con desvío y redes locales alrededor de los barrios (radio de red elegido: 400 m).
5. Se quitaron nodos de paso con solo dos vecinos y mismo tipo de calle, conservando
   el recorrido completo y sumando distancias. No se fusionaron calles por proximidad
   ni se inventaron conexiones rectas. Los ciclos pequeños se conservaron.

Es una **selección de la red de calles**, no todas las calles de Manta comprimidas.
Las calles paralelas se resuelven por menor distancia y luego por ID OSM estable.
Los tipos se asignan así: `bridge` prevalece; primary/secondary/tertiary y sus enlaces
son `avenida`; senderos, escaleras, vías peatonales y callejones de servicio son
`callejon`; el resto de las vías admitidas son `calle`.

## Refugios y límites que revisar en E

| ID | Lugar elegido | Referencia |
|---|---|---|
| R-01 | Universidad ULEAM | Polígono OSM 851414676 |
| R-02 | Faro de Manta | Plus Code indicado por Alex: 379H+W6R, Manta |
| R-03 | Faro de Jaramijó | INOCAR: 00°55’43.59”S, 080°39’24.00”W |
| R-04 | Aeropuerto Eloy Alfaro | Terminal OSM 219062422, no el centro de la pista |

Cada lugar se aproxima a un nodo de calle conectado. La universidad y el terminal
usan un punto interior del polígono como referencia para encontrar ese nodo;
**no se afirma que sean las entradas oficiales**. Los desplazamientos de referencia
a nodo son aproximadamente 35 m, 5 m, 9 m y 38 m respectivamente.

- Los barrios se asignan por cercanía a sus etiquetas OSM, hasta 600 m; no son
  límites oficiales. Los nodos restantes no llevan `barrio`.
- Las calles se consideran bidireccionales para el juego, aunque OSM indique un sentido.
- Las restricciones de polígonos portuarios o militares no están certificadas.
  Una vía conectada no garantiza acceso público real. No usar para navegación real.
- La capacidad provisional no activa reservas ni contadores Pro; Q4 sigue abierta.
- La verificación E del **grafo estático** está completada con las limitaciones anteriores.
  La integración del bloqueo con el motor y el simulador se probará cuando existan.

## Verificación E — 26 de octubre de 2026

Resultado: **sin bloqueos para usar este grafo en el juego ficticio**.

- Se contrastaron los 284 nodos con sus IDs y coordenadas originales de OSM.
- Los 1.329 segmentos geométricos de las 384 calles existen en las vías originales
  declaradas en la procedencia: sin segmentos inventados ni cambios de tipo incorrectos.
- Distancias contrastadas con el recorrido real: diferencia máxima de 0,000499 m,
  correspondiente al redondeo a tres decimales.
- Todos los nodos de inicio de los cuatro barrios pueden alcanzar los cuatro refugios.
- Al bloquear `C-0199` (51,088 m), queda un desvío de 230,257 m y siete saltos;
  la red completa sigue conectada. Esto prueba el grafo, no un `/paso` aún inexistente.
- Regeneración en una carpeta temporal: JSON y procedencia idénticos byte por byte
  a partir de los mismos originales locales y entorno.
- Seis pruebas Python y cuatro de `shared` aprobadas. Inspección visual realizada
  sobre las calles originales, con vista general y acercamientos a los cuatro refugios.

**Advertencias no bloqueantes del juego:** el Faro de Manta está dentro del polígono
OSM del Puerto de Manta (62172771); no se certifica acceso público. Los barrios están
representados, pero sus etiquetas siguen siendo aproximaciones, no límites oficiales.
La calle comprimida más larga (`C-0179`, hacia el Faro de Jaramijó) mide unos 2,35 km:
si el juego avanza una arista por turno, ese recorrido ocupa un solo turno según Q2
asumida. No se modificó esa regla ni se fraccionaron calles durante la verificación.

Esta revisión no prueba despliegue AWS, latencia, reglas de zombies ni rutas del motor.

## Reproducir

Desde la raíz, usando el entorno preparado en `tools/osm/README.md`:

```powershell
& "$env:LOCALAPPDATA\manta-osm-venv\Scripts\python.exe" -B tools/osm/build.py --source-dir tools/osm/data/raw/osm-api-20261026T215858Z
```

El proceso no usa internet ni AWS. Requiere los originales locales (unos 96 MB),
excluidos de Git; sus URLs y hashes están en la procedencia. Una descarga nueva
puede diferir porque OSM cambia: nunca asumir que reproduce los mismos bytes.
Repetir con los mismos originales y entorno produce el mismo JSON. El generador
se niega a sobrescribir una salida diferente; para otra edición usar `--output PATH`.

## Licencia y fuentes

Datos derivados de **© OpenStreetMap contributors**, bajo
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Mantener la [atribución OSM](https://www.openstreetmap.org/copyright) al usar el mapa.
La licencia de datos no cambia la licencia del código del proyecto.

Posición del Faro de Jaramijó: [INOCAR, boletín 04/2014, página 9](https://www.inocar.mil.ec/boletin/ALN/2014/ALN_042014.pdf).
Simplificación: [documentación oficial de OSMnx](https://osmnx.readthedocs.io/en/stable/user-reference.html).
