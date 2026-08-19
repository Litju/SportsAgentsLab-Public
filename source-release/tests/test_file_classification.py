from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from release_common import classify_path, public_path_for


class FileClassificationTest(unittest.TestCase):
    def test_default_is_publish_as_is(self) -> None:
        self.assertEqual(classify_path("apps/practitioner-web/src/server/auth.ts")[0], "PUBLISH_AS_IS")

    def test_explicit_transformations_and_exclusions(self) -> None:
        self.assertEqual(classify_path(".github/workflows/quality.yml")[0], "PUBLISH_REDACTED")
        self.assertEqual(classify_path("apps/practitioner-web/.env.example")[0], "PUBLISH_GENERATED_TEMPLATE")
        self.assertEqual(classify_path("source-release/receipts/PRIVATE.json")[0], "EXCLUDE_MACHINE_LOCAL")
        self.assertEqual(public_path_for("source-release/public/LICENSE"), "LICENSE")


if __name__ == "__main__":
    unittest.main()
