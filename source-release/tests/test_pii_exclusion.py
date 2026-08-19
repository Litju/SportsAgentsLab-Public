from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from scan_pii import scan


class PiiExclusionTest(unittest.TestCase):
    def test_real_email_is_detected_but_example_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data.txt").write_text("owner=" + "person" + "@" + "private.invalid\nexample" + "@" + "example.com\n", encoding="utf-8")
            findings = scan(root)["findings"]
            self.assertEqual(len(findings), 1)
            self.assertEqual(findings[0]["kind"], "email")


if __name__ == "__main__":
    unittest.main()
