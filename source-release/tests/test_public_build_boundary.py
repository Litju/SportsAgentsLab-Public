from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from release_common import STAGE_NAME, public_path_for


class PublicBuildBoundaryTest(unittest.TestCase):
    def test_stage_and_governance_mapping_are_fixed(self) -> None:
        self.assertEqual(STAGE_NAME, "sportsagentslab-full-public-source-v1")
        self.assertEqual(public_path_for("source-release/public/.github/dependabot.yml"), ".github/dependabot.yml")


if __name__ == "__main__":
    unittest.main()
