from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from scan_third_party import scan


class ThirdPartyExclusionTest(unittest.TestCase):
    def test_unreviewed_vendor_path_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            vendor = root / "vendor"
            vendor.mkdir()
            (vendor / "bundle.js").write_text("owned = false\n", encoding="utf-8")
            self.assertTrue(scan(root)["findings"])


if __name__ == "__main__":
    unittest.main()
