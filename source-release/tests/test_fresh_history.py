from __future__ import annotations

import sys
import subprocess
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from verify_public_git_history import verify


class FreshHistoryTest(unittest.TestCase):
    def test_single_root_history_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = [
                ["git", "init", "-b", "main"],
                ["git", "config", "user.email", "release@example.com"],
                ["git", "config", "user.name", "Release Test"],
            ]
            for command in commands:
                subprocess.run(command, cwd=root, check=True, capture_output=True)
            (root / "README.md").write_text("public\n", encoding="utf-8")
            subprocess.run(["git", "add", "README.md"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", "bootstrap"], cwd=root, check=True, capture_output=True)
            self.assertEqual(verify(root)["root_commit_count"], 1)


if __name__ == "__main__":
    unittest.main()
