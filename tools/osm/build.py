"""Build a small, connected game graph from checksummed original OSM XML tiles."""

import argparse
import hashlib
import heapq
from itertools import combinations
import json
import math
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET

import networkx as nx
import osmnx as ox
from shapely.geometry import Polygon


ALLOWED = {"primary", "primary_link", "secondary", "secondary_link", "tertiary",
           "tertiary_link", "residential", "unclassified", "living_street", "service",
           "pedestrian", "footway", "path", "steps", "track"}


def distance(a, b):
    """Distancia ortodrómica en metros; las coordenadas de entrada van en orden (longitud, latitud)."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    value = math.sin((lat2 - lat1) / 2) ** 2
    value += math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371009 * math.asin(min(1, math.sqrt(value)))


def road_type(tags):
    if tags.get("bridge", "no").lower() not in {"no", "false", "0", "none"}:
        return "puente"
    if tags["highway"].split("_")[0] in {"primary", "secondary", "tertiary"}:
        return "avenida"
    if tags["highway"] in {"footway", "path", "steps", "track", "pedestrian"}:
        return "callejon"
    if tags.get("service") in {"alley", "parking_aisle"}:
        return "callejon"
    return "calle"


def load_source(folder):
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    nodes, ways = {}, {}
    for item in manifest["files"]:
        if Path(item["file"]).name != item["file"]:
            raise ValueError("Source manifest must contain plain filenames")
        path = folder / item["file"]
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise ValueError(f"Source checksum mismatch: {path.name}")
        for _, element in ET.iterparse(path, events=("end",)):
            if element.tag == "node":
                nodes[int(element.attrib["id"])] = (float(element.attrib["lon"]),
                                                    float(element.attrib["lat"]))
                element.clear()
            elif element.tag == "way":
                tags = {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}
                ways[int(element.attrib["id"])] = (
                    [int(nd.attrib["ref"]) for nd in element.findall("nd")], tags)
                element.clear()
            elif element.tag == "relation":
                element.clear()
    return manifest, nodes, ways


def target_position(anchor, nodes, ways):
    if "osm_node" in anchor:
        return nodes[anchor["osm_node"]]
    if "osm_way" in anchor:
        coordinates = [nodes[node] for node in ways[anchor["osm_way"]][0]]
        point = Polygon(coordinates).representative_point()
        return (point.x, point.y)
    return (anchor["lng"], anchor["lat"])


def make_network(nodes, ways, bbox):
    """Usa OSMnx para quitar los puntos que solo dan forma sin fusionar tipos de vía distintos."""
    selected = {}
    for identity, (refs, tags) in ways.items():
        if (tags.get("highway") not in ALLOWED or tags.get("area") == "yes"
                or tags.get("access") in {"no", "private"} or tags.get("foot") == "no"):
            continue
        if not all(node in nodes for node in refs):
            raise ValueError(f"Missing geometry nodes in OSM way {identity}")
        selected[identity] = (refs, tags)
    root = ET.Element("osm", version="0.6", generator="manta-game-extractor")
    used = {node for refs, _ in selected.values() for node in refs}
    for node in sorted(used):
        lng, lat = nodes[node]
        ET.SubElement(root, "node", id=str(node), lon=str(lng), lat=str(lat))
    for identity, (refs, tags) in sorted(selected.items()):
        element = ET.SubElement(root, "way", id=str(identity))
        for node in refs:
            ET.SubElement(element, "nd", ref=str(node))
        for key in ("highway", "bridge", "name", "service"):
            if key in tags:
                ET.SubElement(element, "tag", k=key, v=tags[key])
    ox.settings.log_console = False
    ox.settings.useful_tags_way = sorted(set(ox.settings.useful_tags_way) | {"bridge", "service"})
    # Sin llamadas de red: es un XML intermedio armado a partir de los tiles originales.
    with tempfile.TemporaryDirectory(prefix="manta-osm-build-") as temporary:
        path = Path(temporary) / "streets.osm"
        ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
        graph = ox.graph_from_xml(path, bidirectional=True, simplify=False, retain_all=True)
    west, south, east, north = bbox
    graph = graph.subgraph(node for node in graph
                          if west <= nodes[node][0] <= east and south <= nodes[node][1] <= north).copy()
    component = max(nx.weakly_connected_components(graph), key=lambda group: (len(group), -min(group)))
    graph = graph.subgraph(sorted(component)).copy()
    for _, _, data in graph.edges(data=True):
        data["tipo"] = road_type(selected[int(data["osmid"])][1])
    return graph


def snap_anchors(graph, config, nodes, ways):
    anchors = []
    for category in ("barrios", "refugios"):
        for definition in config[category]:
            point = target_position(definition, nodes, ways)
            node = min(graph, key=lambda identity: (distance(nodes[identity], point), identity))
            offset = distance(nodes[node], point)
            if offset > config["max_snap_m"]:
                raise ValueError(f"Anchor {definition['id']} is {offset:.1f} m from connected streets")
            graph.nodes[node]["game_anchor"] = True
            anchors.append({**definition, "category": category, "osm_node": node,
                            "target": list(point), "snap_m": round(offset, 2)})
    refuges = [a["osm_node"] for a in anchors if a["category"] == "refugios"]
    if len(set(refuges)) != 4:
        raise ValueError("Four distinct refuge access nodes are required")
    return anchors


def simplify_network(graph, nodes):
    graph = ox.simplify_graph(graph, node_attrs_include=["game_anchor"],
                              edge_attrs_differ=["tipo"], remove_rings=False)
    simple = nx.Graph()
    for node in sorted(graph):
        simple.add_node(node, point=nodes[node])
    discarded = []
    for u, v, key, data in sorted(graph.edges(keys=True, data=True), key=lambda edge: edge[:3]):
        if u == v:
            continue
        geometry = list(data["geometry"].coords) if "geometry" in data else [nodes[u], nodes[v]]
        if distance(geometry[0], nodes[u]) > distance(geometry[-1], nodes[u]):
            geometry.reverse()
        way_ids = data["osmid"] if isinstance(data["osmid"], list) else [data["osmid"]]
        edge = {"length": float(data["length"]), "tipo": data["tipo"],
                "geometry": geometry, "start": u, "ways": tuple(sorted(set(way_ids)))}
        # Las copias dirigidas en sentido inverso no son calles distintas. Las paralelas reales se resuelven juntas.
        if simple.has_edge(u, v):
            existing = simple[u][v]
            if edge["ways"] != existing["ways"]:
                discarded.append({"endpoints": sorted((u, v)), "candidate_way_ids": edge["ways"]})
            if (edge["length"], edge["ways"]) >= (existing["length"], existing["ways"]):
                continue
        simple.add_edge(u, v, **edge)
    return simple, discarded


def oriented(data, start):
    return data["geometry"] if data["start"] == start else list(reversed(data["geometry"]))


def contract_chains(graph, protected):
    """Quita solo los puntos de grado dos con tipos iguales; conserva la geometría y los bucles."""
    graph = graph.copy()
    pending = list(graph)
    heapq.heapify(pending)
    while pending:
        node = heapq.heappop(pending)
        if node not in graph or node in protected or graph.degree(node) != 2:
            continue
        a, b = sorted(graph[node])
        first, second = graph[a][node], graph[node][b]
        if first["tipo"] != second["tipo"] or graph.has_edge(a, b):
            continue
        geometry = oriented(first, a) + oriented(second, node)[1:]
        edge = {"length": first["length"] + second["length"], "tipo": first["tipo"],
                "geometry": geometry, "start": a,
                "ways": tuple(sorted(set(first["ways"]) | set(second["ways"])))}
        graph.remove_node(node)
        graph.add_edge(a, b, **edge)
        heapq.heappush(pending, a)
        heapq.heappush(pending, b)
    return graph


def select_network(graph, anchors, config):
    protected = {anchor["osm_node"] for anchor in anchors}
    base_nodes = set(protected)
    for a, b in combinations(sorted(protected), 2):
        base_nodes.update(nx.shortest_path(graph, a, b, weight="length"))
    cut_edges = {frozenset(edge) for edge in nx.bridges(graph)}
    nearby = nx.multi_source_dijkstra_path_length(graph, sorted(base_nodes), weight="length")
    bridges = sorted((nearby[u] + nearby[v], min(u, v), max(u, v))
                     for u, v, edge in graph.edges(data=True)
                     if edge["tipo"] == "puente" and frozenset((u, v)) not in cut_edges)
    if not bridges:
        raise ValueError("No real bridge with an alternate route exists in the source network")
    _, u, v = bridges[0]
    protected.update((u, v))
    for endpoint in (u, v):
        base_nodes.update(nx.shortest_path(graph, min(base_nodes), endpoint, weight="length"))
    alternate = graph.copy()
    alternate.remove_edge(u, v)
    base_nodes.update(nx.shortest_path(alternate, u, v, weight="length"))
    barrio_nodes = [a["osm_node"] for a in anchors if a["category"] == "barrios"]
    local_distances = nx.multi_source_dijkstra_path_length(
        graph, sorted(barrio_nodes), cutoff=max(config["radii_m"]), weight="length")
    candidates = []
    for radius in config["radii_m"]:
        selected = base_nodes | {node for node, length in local_distances.items() if length <= radius}
        reduced = contract_chains(graph.subgraph(sorted(selected)), protected)
        candidates.append((abs(len(reduced) - config["target_nodes"]), radius, reduced))
    difference, radius, reduced = min(candidates, key=lambda candidate: candidate[:2])
    if difference > config["node_tolerance"]:
        raise ValueError(f"No selection near target size: closest has {len(reduced)} nodes")
    return reduced, radius, (u, v)


def export_graph(graph, anchors, config, signature, demo_bridge):
    ids = {node: f"N-{index:04d}" for index, node in enumerate(sorted(graph), 1)}
    barrios = [a for a in anchors if a["category"] == "barrios"]
    result = {"version": f"manta-osm-{signature[:12]}", "nodos": [], "calles": [], "refugios": []}
    for node in sorted(graph):
        lng, lat = graph.nodes[node]["point"]
        entry = {"id": ids[node], "lat": lat, "lng": lng}
        closest = min(barrios, key=lambda a: (distance((lng, lat), a["target"]), a["id"]))
        if distance((lng, lat), closest["target"]) <= config["barrio_radius_m"]:
            entry["barrio"] = closest["id"]
        result["nodos"].append(entry)
    edge_provenance = {}
    bridge_id = None
    for index, (u, v) in enumerate(sorted(tuple(sorted(edge)) for edge in graph.edges()), 1):
        edge = graph[u][v]
        street_id = f"C-{index:04d}"
        result["calles"].append({"id": street_id, "desde": ids[u], "hasta": ids[v],
                                 "distancia_m": round(edge["length"], 3), "tipo": edge["tipo"],
                                 "geometria": [list(point) for point in oriented(edge, u)]})
        edge_provenance[street_id] = list(edge["ways"])
        if (u, v) == tuple(sorted(demo_bridge)):
            bridge_id = street_id
    for anchor in anchors:
        if anchor["category"] == "refugios":
            result["refugios"].append({key: anchor[key] for key in ("id", "nombre", "capacidad")}
                                     | {"nodo": ids[anchor["osm_node"]]})
    without_bridge = graph.copy()
    without_bridge.remove_edge(*demo_bridge)
    if not nx.is_connected(graph) or not nx.has_path(without_bridge, *demo_bridge):
        raise ValueError("Connectivity or bridge detour invariant failed")
    if {node.get("barrio") for node in result["nodos"]} - {None} != {a["id"] for a in barrios}:
        raise ValueError("A start neighborhood was lost during reduction")
    return result, {"node_osm_ids": {ids[node]: node for node in sorted(graph)},
                    "street_osm_way_ids": edge_provenance, "demo_bridge_id": bridge_id}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("manta.config.json"))
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[2] / "shared/data/manta.json")
    args = parser.parse_args(argv)
    config = json.loads(args.config.read_text(encoding="utf-8"))
    manifest, nodes, ways = load_source(args.source_dir)
    graph = make_network(nodes, ways, manifest["bbox"])
    anchors = snap_anchors(graph, config, nodes, ways)
    simple, discarded = simplify_network(graph, nodes)
    selected, radius, bridge = select_network(simple, anchors, config)
    signature = hashlib.sha256(json.dumps({"config": config, "source_files": manifest["files"],
                                           "algorithm": "corridors-and-local-mesh-v1"},
                                          sort_keys=True).encode()).hexdigest()
    result, mapping = export_graph(selected, anchors, config, signature, bridge)
    # Cualquier cambio en los datos exportados cambia su versión, incluidos los cambios de algoritmo o de librería.
    payload = {key: value for key, value in result.items() if key != "version"}
    result["version"] = "manta-osm-" + hashlib.sha256(
        json.dumps({"inputs": signature, "graph": payload}, sort_keys=True).encode()
    ).hexdigest()[:12]
    graph_bytes = (json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    report = {"version": result["version"], "config": config, "source_files": manifest["files"],
              "license": "https://opendatacommons.org/licenses/odbl/1-0/",
              "attribution": "© OpenStreetMap contributors", "osmnx_version": ox.__version__,
              "networkx_version": nx.__version__, "anchors": anchors,
              "selection_radius_m": radius, "source_intersections": len(simple),
              "nodes": len(selected), "streets": selected.number_of_edges(),
              "discarded_parallel_candidates": discarded, **mapping,
              "sha256": hashlib.sha256(graph_bytes).hexdigest(),
              "checks": {"connected": True, "demo_bridge_has_detour": True},
              "limitations": ["Neighborhood tags approximate proximity, not official boundaries.",
                              "Refuge access is snapped to connected OSM roads, not certified entrances.",
                              "Port/military polygon access restrictions require manual review.",
                              "Only selected corridors and local streets are retained, not all city streets.",
                              "Capacity 200 is provisional; Pro occupancy enforcement is not enabled."]}
    report_bytes = (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    outputs = ((args.output, graph_bytes), (args.output.with_suffix(".provenance.json"), report_bytes))
    for path, content in outputs:
        if path.exists() and path.read_bytes() != content:
            raise ValueError(f"Refusing to overwrite different existing output: {path}")
    for path, content in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    print(json.dumps({"output": str(args.output), "nodes": len(selected),
                      "streets": selected.number_of_edges(), "radius_m": radius,
                      "demo_bridge": mapping["demo_bridge_id"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
