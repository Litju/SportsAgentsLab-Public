from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from scan_secrets import scan
from release_common import redact_config_text


class SecretExclusionTest(unittest.TestCase):
    def test_live_assignment_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "config.yml").write_text("DEMO_SECRET=" + "live_value\n", encoding="utf-8")
            self.assertTrue(scan(root)["findings"])

    def test_database_password_is_redacted(self) -> None:
        original = "DATABASE_URL=postgresql://user:" + "live" + "@localhost/db\n"
        redacted = redact_config_text(original)
        self.assertNotIn("live", redacted)
        self.assertIn("CHANGE_ME", redacted)


if __name__ == "__main__":
    unittest.main()
