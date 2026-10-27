"""Offline checks for the public download command."""

import subprocess
import sys
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import download


SCRIPT = Path(__file__).with_name("download.py")


class DownloadCommandTests(unittest.TestCase):
    def run_command(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args], capture_output=True, text=True
        )

    def test_help_explains_raw_download(self):
        result = self.run_command("--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--bbox", result.stdout)
        self.assertIn("--output-dir", result.stdout)
        self.assertIn("unsimplified", result.stdout)

    def test_invalid_bbox_is_rejected_before_network_access(self):
        for bbox in (("0", "0", "-1", "1"), ("nan", "0", "1", "1")):
            with self.subTest(bbox=bbox):
                result = self.run_command("--bbox", *bbox)
                self.assertEqual(result.returncode, 2)
                self.assertIn("Invalid bounding box", result.stderr)

    def test_download_preserves_original_graph_and_reports_source(self):
        graph = Mock()
        graph.number_of_nodes.return_value = 2
        graph.number_of_edges.return_value = 2
        graph.edges.return_value = [
            (1, 2, {"osmid": 99, "bridge": "yes"}),
            (2, 1, {"osmid": 100, "bridge": "no"}),
        ]
        places = Mock()
        places.to_json.return_value = '{"type":"FeatureCollection","features":[]}'
        places.get.return_value = ["Tarqui", "Los Esteros", "Barbasquillo", "Jocay"]
        ox = types.SimpleNamespace(
            settings=types.SimpleNamespace(useful_tags_way=[]), __version__="test",
            graph_from_bbox=Mock(return_value=graph),
            save_graphml=lambda graph, filepath: filepath.write_text("original", encoding="utf-8"),
            features_from_bbox=Mock(return_value=places),
        )
        nx = types.SimpleNamespace(number_weakly_connected_components=lambda graph: 1)
        with tempfile.TemporaryDirectory(prefix="manta-osm-test-") as temporary:
            with patch.dict(sys.modules, {"osmnx": ox, "networkx": nx}):
                with patch("builtins.print"):
                    self.assertEqual(download.main(["--output-dir", temporary]), 0)
            run = next(Path(temporary).iterdir())
            report = json.loads((run / "report.json").read_text(encoding="utf-8"))
            self.assertEqual((run / "manta-original.graphml").read_text(), "original")
            self.assertEqual(report["bridge_osm_way_ids"], ["99"])
            self.assertTrue(all(report["neighborhood_label_matches"].values()))
            self.assertIn("manta-original.graphml", report["sha256"])
            self.assertFalse((run / "manta.json").exists())
            ox.graph_from_bbox.assert_called_once_with(
                download.DEFAULT_BBOX, network_type="walk", simplify=False, retain_all=True
            )

    def test_failed_label_query_preserves_download_and_reports_error(self):
        graph = Mock()
        graph.number_of_nodes.return_value = 2
        graph.number_of_edges.return_value = 1
        graph.edges.return_value = []
        ox = types.SimpleNamespace(
            settings=types.SimpleNamespace(useful_tags_way=[]), __version__="test",
            graph_from_bbox=Mock(return_value=graph),
            save_graphml=lambda graph, filepath: filepath.write_text("original", encoding="utf-8"),
            features_from_bbox=Mock(side_effect=RuntimeError("label service unavailable")),
        )
        nx = types.SimpleNamespace(number_weakly_connected_components=lambda graph: 1)
        with tempfile.TemporaryDirectory(prefix="manta-osm-test-") as temporary:
            with patch.dict(sys.modules, {"osmnx": ox, "networkx": nx}):
                with patch("builtins.print"), self.assertRaisesRegex(RuntimeError, "label service"):
                    download.main(["--output-dir", temporary])
            run = next(Path(temporary).iterdir())
            report = json.loads((run / "report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["coverage_status"], "unverified")
            self.assertEqual(report["neighborhood_check_error"], "label service unavailable")
            self.assertTrue((run / "manta-original.graphml").is_file())


if __name__ == "__main__":
    unittest.main()
