from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from scan_heldout import scan


class HeldoutExclusionTest(unittest.TestCase):
    def test_heldout_path_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heldout = root / ("held" + "-out")
            heldout.mkdir()
            (heldout / "answers.json").write_text("{}\n", encoding="utf-8")
            self.assertTrue(scan(root)["findings"])


if __name__ == "__main__":
    unittest.main()
