from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from release_common import generate_env_example_text, redact_config_text


class ConfigRedactionTest(unittest.TestCase):
    def test_structure_is_preserved(self) -> None:
        source = "HOST=localhost\nPASSWORD=secret_value\nURL=" + "postgresql://user:" + "pw" + "@db/app\n"
        result = redact_config_text(source)
        self.assertIn("HOST=localhost", result)
        self.assertIn("PASSWORD=CHANGE_ME", result)
        self.assertIn("postgresql://user:CHANGE_ME@db/app", result)
        self.assertEqual(len(source.splitlines()), len(result.splitlines()))

    def test_env_generation_is_same_narrow_transform(self) -> None:
        self.assertIn("CHANGE_ME", generate_env_example_text("APP_SECRET=real\n"))


if __name__ == "__main__":
    unittest.main()
