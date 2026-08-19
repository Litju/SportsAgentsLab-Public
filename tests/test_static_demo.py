from pathlib import Path
import unittest


class StaticDemoTests(unittest.TestCase):
    def test_demo_is_offline_and_accessible(self) -> None:
        html = (Path(__file__).parents[1] / "apps" / "showcase-web" / "index.html").read_text(encoding="utf-8")
        self.assertIn('lang="en"', html)
        self.assertIn('id="main"', html)
        self.assertNotIn("/api/", html)
        self.assertNotIn("fetch(", html)
        self.assertIn("SYNTHETIC", html)


if __name__ == "__main__":
    unittest.main()
