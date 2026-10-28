"""Descarga los datos OSM originales de Manta; no simplifica ni exporta el grafo del juego."""

import argparse
import hashlib
import json
import math
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_BBOX = (-80.80, -1.03, -80.65, -0.92)
NEIGHBORHOODS = ("tarqui", "los esteros", "barbasquillo", "jocay")


def normalized(value):
    return "".join(
        char for char in unicodedata.normalize("NFKD", str(value).lower())
        if not unicodedata.combining(char)
    )


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Download unsimplified Manta streets and neighborhood labels from OSM."
    )
    parser.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_BBOX,
                        metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    parser.add_argument("--output-dir", type=Path,
                        default=Path(__file__).parent / "data" / "raw")
    args = parser.parse_args(argv)
    west, south, east, north = args.bbox
    if not (all(math.isfinite(x) for x in args.bbox)
            and -180 <= west < east <= 180 and -90 <= south < north <= 90):
        parser.error("Invalid bounding box: expected WEST < EAST and SOUTH < NORTH.")

    import networkx as nx
    import osmnx as ox

    started = datetime.now(timezone.utc)
    output = args.output_dir / started.strftime("%Y%m%dT%H%M%S%fZ")
    output.mkdir(parents=True, exist_ok=False)
    # Estas respuestas son artefactos de origen, no una caché HTTP descartable.
    ox.settings.use_cache = True
    ox.settings.cache_folder = output / "responses"
    ox.settings.logs_folder = Path(tempfile.gettempdir()) / "manta-osmnx-logs"
    ox.settings.log_file = False
    ox.settings.log_console = True
    ox.settings.requests_timeout = 180
    ox.settings.useful_tags_way = list(dict.fromkeys(
        [*ox.settings.useful_tags_way, "bridge", "name", "highway", "oneway"]
    ))
    print(f"Source artifacts: {output.resolve()}", flush=True)
    graph = ox.graph_from_bbox(tuple(args.bbox), network_type="walk",
                               simplify=False, retain_all=True)
    graph_path = output / "manta-original.graphml"
    ox.save_graphml(graph, filepath=graph_path)

    # Primero se guarda el grafo: si falla la consulta de etiquetas no se deben perder los datos de calles.
    report = {
        "started_at": started.isoformat(), "bbox_west_south_east_north": args.bbox,
        "osmnx_version": ox.__version__, "network_type": "walk",
        "simplify": False, "retain_all": True,
        "nodes": graph.number_of_nodes(), "directed_edges": graph.number_of_edges(),
        "weak_components": nx.number_weakly_connected_components(graph),
        "bridge_osm_way_ids": sorted({
            str(data["osmid"]) for _, _, data in graph.edges(data=True)
            if str(data.get("bridge", "no")).lower() not in ("no", "false", "0", "none")
        }),
        "source": "https://www.openstreetmap.org",
        "license": "https://opendatacommons.org/licenses/odbl/1-0/",
        "attribution": "© OpenStreetMap contributors",
        "coverage_status": "unverified",
        "note": "Raw download only. No node reduction, shelters or game JSON export.",
    }
    report_path = output / "report.json"

    def save_report():
        report["sha256"] = {
            str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(output.rglob("*"))
            if path.is_file() and path != report_path
        }
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    save_report()
    try:
        places = ox.features_from_bbox(tuple(args.bbox),
                                       tags={"place": ["suburb", "neighbourhood", "quarter"]})
        (output / "neighborhoods.geojson").write_text(places.to_json(), encoding="utf-8")
        labels = sorted({str(name) for name in places.get("name", []) if isinstance(name, str)})
        report["osm_place_names"] = labels
        report["neighborhood_label_matches"] = {
            target: [label for label in labels if target in normalized(label)]
            for target in NEIGHBORHOODS
        }
        report["coverage_status"] = "label_check_only_manual_boundary_review_required"
    except Exception as error:
        report["neighborhood_check_error"] = str(error)
        save_report()
        raise
    save_report()
    print(json.dumps(report, indent=2, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
