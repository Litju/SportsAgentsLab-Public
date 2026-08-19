from __future__ import annotations

import sys
from pathlib import Path
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages" / "public-science" / "src"))

from cmj_illustrative import ForceTrace, acceleration_from_force, generate_synthetic_trace, summarize_trace, trapezoid_integral


class PublicScienceTests(unittest.TestCase):
    def test_synthetic_trace_is_repeatable(self) -> None:
        self.assertEqual(generate_synthetic_trace(), generate_synthetic_trace())

    def test_declared_summary_is_bounded(self) -> None:
        result = summarize_trace(generate_synthetic_trace())
        self.assertEqual(result.sample_count, 151)
        self.assertAlmostEqual(result.declared_flight_time_s or 0.0, 0.22)
        self.assertGreater(result.peak_force_n, 75.0 * 9.80665)

    def test_trapezoid_integral(self) -> None:
        self.assertAlmostEqual(trapezoid_integral((0.0, 1.0, 2.0), (0.0, 2.0, 0.0)), 2.0)

    def test_bad_timebase_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            ForceTrace((0.0, 0.0), (1.0, 1.0), 100.0).validate()

    def test_force_requires_positive_mass(self) -> None:
        with self.assertRaises(ValueError):
            acceleration_from_force((1.0, 2.0), 0.0)


if __name__ == "__main__":
    unittest.main()
