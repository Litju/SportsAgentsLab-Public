from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from verify_public_tree import verify


class PublicTreeIntegrityTest(unittest.TestCase):
    def test_incomplete_tree_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                verify(Path(directory))


if __name__ == "__main__":
    unittest.main()
