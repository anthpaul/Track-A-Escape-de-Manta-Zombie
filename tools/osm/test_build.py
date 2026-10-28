"""Prueba la reducción y exportación del grafo a través de su interfaz de línea de comandos."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

import build
import networkx as nx

SCRIPT = Path(__file__).with_name("build.py")


class BuildCommandTests(unittest.TestCase):
    def test_chain_reduction_preserves_curve_and_bridge_boundaries(self):
        graph = nx.Graph()
        points = {1: (0, 0), 2: (0.001, 0.001), 3: (0.002, 0), 4: (0.003, 0)}
        for node, point in points.items():
            graph.add_node(node, point=point)
        for a, b, kind in ((1, 2, "calle"), (2, 3, "calle"), (3, 4, "puente")):
            graph.add_edge(a, b, length=10, tipo=kind, geometry=[points[a], points[b]],
                           start=a, ways=(100 + a,))
        reduced = build.contract_chains(graph, {1, 4})
        self.assertEqual(set(reduced), {1, 3, 4})
        self.assertEqual(reduced[1][3]["geometry"], [points[1], points[2], points[3]])
        self.assertEqual(reduced[1][3]["length"], 20)
        self.assertEqual(reduced[3][4]["tipo"], "puente")

    def test_connected_export_preserves_geometry_types_anchors_and_determinism(self):
        with tempfile.TemporaryDirectory(prefix="manta-build-test-") as temporary:
            root = Path(temporary)
            source = root / "raw"
            source.mkdir()
            osm = ET.Element("osm", version="0.6")
            for row in range(6):
                for col in range(6):
                    ET.SubElement(osm, "node", id=str(row * 6 + col + 1),
                                  lat=str(row * 0.001), lon=str(col * 0.001))
            way_id = 100
            for row in range(6):
                for col in range(6):
                    node = row * 6 + col + 1
                    for neighbor in (node + 1 if col < 5 else None,
                                     node + 6 if row < 5 else None):
                        if neighbor is None:
                            continue
                        way = ET.SubElement(osm, "way", id=str(way_id))
                        for ref in (node, neighbor):
                            ET.SubElement(way, "nd", ref=str(ref))
                        ET.SubElement(way, "tag", k="highway", v="residential")
                        if node == 15 and neighbor == 16:
                            ET.SubElement(way, "tag", k="bridge", v="yes")
                        way_id += 1
            raw = ET.tostring(osm, encoding="utf-8", xml_declaration=True)
            (source / "tile.osm").write_bytes(raw)
            manifest = {"files": [{"file": "tile.osm", "sha256": hashlib.sha256(raw).hexdigest()}],
                        "bbox": [-0.001, -0.001, 0.006, 0.006]}
            (source / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            positions = [(0.001, 0.001), (0.001, 0.004), (0.004, 0.001), (0.004, 0.004)]
            config = {"target_nodes": 28, "node_tolerance": 10, "max_snap_m": 100,
                      "barrio_radius_m": 180, "radii_m": [0, 100, 150, 200, 250],
                      "barrios": [{"id": name, "lat": lat, "lng": lng}
                                  for name, (lat, lng) in zip(
                                      ("tarqui", "los_esteros", "barbasquillo", "jocay"), positions)],
                      "refugios": [{"id": f"R-0{i + 1}", "nombre": f"Shelter {i + 1}",
                                    "lat": lat, "lng": lng, "capacidad": 200}
                                   for i, (lat, lng) in enumerate(positions)]}
            config_path = root / "config.json"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            command = [sys.executable, "-B", str(SCRIPT), "--source-dir", str(source),
                       "--config", str(config_path)]
            env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
            for name in ("one.json", "two.json"):
                result = subprocess.run([*command, "--output", str(root / name)],
                                        capture_output=True, text=True, env=env)
                self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / "one.json").read_bytes(), (root / "two.json").read_bytes())
            graph = json.loads((root / "one.json").read_text())
            nodes = {node["id"]: node for node in graph["nodos"]}
            self.assertEqual(set(graph), {"version", "nodos", "calles", "refugios"})
            self.assertLessEqual(abs(len(nodes) - 28), 10)
            self.assertEqual({node.get("barrio") for node in nodes.values()} - {None},
                             {"tarqui", "los_esteros", "barbasquillo", "jocay"})
            self.assertEqual(len(graph["refugios"]), 4)
            pairs = set()
            for street in graph["calles"]:
                pair = tuple(sorted((street["desde"], street["hasta"])))
                self.assertNotIn(pair, pairs)
                pairs.add(pair)
                self.assertGreater(street["distancia_m"], 0)
                for key, point in (("desde", street["geometria"][0]),
                                   ("hasta", street["geometria"][-1])):
                    node = nodes[street[key]]
                    self.assertEqual(point, [node["lng"], node["lat"]])
            self.assertTrue(any(street["tipo"] == "puente" for street in graph["calles"]))
            report = json.loads((root / "one.provenance.json").read_text())
            self.assertTrue(report["checks"]["connected"])
            self.assertTrue(report["checks"]["demo_bridge_has_detour"])
            # Las entradas corruptas fallan antes de tocar una salida existente.
            original = (root / "one.json").read_bytes()
            (source / "tile.osm").write_bytes(raw + b" ")
            result = subprocess.run([*command, "--output", str(root / "one.json")],
                                    capture_output=True, text=True, env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("checksum", result.stderr.lower())
            self.assertEqual((root / "one.json").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
