"""Bounded, deterministic vertical-force example for the public showcase.

This is an illustrative calculation surface, not a complete measurement
processor. Inputs are explicitly labelled in seconds, newtons, and kilograms.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from typing import Iterable


GRAVITY_M_S2 = 9.80665


@dataclass(frozen=True)
class ForceTrace:
    time_s: tuple[float, ...]
    force_n: tuple[float, ...]
    sample_rate_hz: float
    force_unit: str = "N"
    time_unit: str = "s"
    sign_convention: str = "positive_vertical_ground_reaction"
    declared_flight_start: int | None = None
    declared_flight_end: int | None = None
    construction: str = "synthetic_deterministic_example"

    def validate(self) -> None:
        if self.force_unit != "N" or self.time_unit != "s":
            raise ValueError("force must be in N and time must be in s")
        if len(self.time_s) != len(self.force_n) or len(self.time_s) < 2:
            raise ValueError("time and force need the same length and at least two samples")
        if not math.isfinite(self.sample_rate_hz) or self.sample_rate_hz <= 0:
            raise ValueError("sample_rate_hz must be finite and positive")
        if any(not math.isfinite(value) for value in (*self.time_s, *self.force_n)):
            raise ValueError("time and force values must be finite")
        if any(right <= left for left, right in zip(self.time_s, self.time_s[1:])):
            raise ValueError("time must be strictly increasing")
        if self.declared_flight_start is not None and self.declared_flight_end is not None:
            if not 0 <= self.declared_flight_start < self.declared_flight_end < len(self.time_s):
                raise ValueError("declared flight interval is outside the trace")


@dataclass(frozen=True)
class IllustrativeResult:
    sample_count: int
    duration_s: float
    peak_force_n: float
    declared_flight_time_s: float | None
    illustrative_height_m: float | None
    source: str
    limitation: str


def trapezoid_integral(x: Iterable[float], y: Iterable[float]) -> float:
    """Integrate finite samples with the trapezoidal rule."""

    x_values = tuple(x)
    y_values = tuple(y)
    if len(x_values) != len(y_values) or len(x_values) < 2:
        raise ValueError("x and y need the same length and at least two samples")
    if any(not math.isfinite(value) for value in (*x_values, *y_values)):
        raise ValueError("integral inputs must be finite")
    total = 0.0
    for left_x, right_x, left_y, right_y in zip(x_values, x_values[1:], y_values, y_values[1:]):
        if right_x <= left_x:
            raise ValueError("x must be strictly increasing")
        total += (right_x - left_x) * (left_y + right_y) / 2.0
    return total


def acceleration_from_force(force_n: Iterable[float], mass_kg: float) -> tuple[float, ...]:
    """Return acceleration in m/s² for a single total-force channel."""

    if not math.isfinite(mass_kg) or mass_kg <= 0:
        raise ValueError("mass_kg must be finite and positive")
    values = tuple(force_n)
    if any(not math.isfinite(value) for value in values):
        raise ValueError("force values must be finite")
    return tuple((value / mass_kg) - GRAVITY_M_S2 for value in values)


def flight_time_height(flight_time_s: float) -> float:
    """Estimate ballistic height from a declared flight time."""

    if not math.isfinite(flight_time_s) or flight_time_s < 0:
        raise ValueError("flight_time_s must be finite and non-negative")
    return GRAVITY_M_S2 * flight_time_s * flight_time_s / 8.0


def generate_synthetic_trace(
    *, sample_rate_hz: float = 100.0, duration_s: float = 1.5, mass_kg: float = 75.0, seed: int = 7
) -> ForceTrace:
    """Generate a reproducible trace with declared, not detected, flight indices."""

    if sample_rate_hz <= 0 or duration_s <= 0 or mass_kg <= 0:
        raise ValueError("sample rate, duration, and mass must be positive")
    count = int(round(duration_s * sample_rate_hz)) + 1
    baseline = mass_kg * GRAVITY_M_S2
    time_s = tuple(index / sample_rate_hz for index in range(count))
    force_n: list[float] = []
    for time in time_s:
        if time < 0.30:
            force = baseline + 0.4 * math.sin((seed + 1) * time * 2.0 * math.pi)
        elif time < 0.48:
            phase = (time - 0.30) / 0.18
            force = baseline * (0.82 + 0.18 * math.cos(math.pi * phase))
        elif time < 0.72:
            phase = (time - 0.48) / 0.24
            force = baseline * (1.0 + 1.25 * math.sin(math.pi * phase))
        elif time < 0.94:
            force = 0.0
        elif time < 1.06:
            phase = (time - 0.94) / 0.12
            force = baseline * (1.0 + 1.7 * math.sin(math.pi * phase))
        else:
            force = baseline
        force_n.append(force)
    flight_start = int(round(0.72 * sample_rate_hz))
    flight_end = int(round(0.94 * sample_rate_hz))
    trace = ForceTrace(time_s, tuple(force_n), sample_rate_hz, declared_flight_start=flight_start, declared_flight_end=flight_end)
    trace.validate()
    return trace


def summarize_trace(trace: ForceTrace) -> IllustrativeResult:
    trace.validate()
    flight_time = None
    height = None
    if trace.declared_flight_start is not None and trace.declared_flight_end is not None:
        flight_time = trace.time_s[trace.declared_flight_end] - trace.time_s[trace.declared_flight_start]
        height = flight_time_height(flight_time)
    return IllustrativeResult(
        sample_count=len(trace.time_s),
        duration_s=trace.time_s[-1] - trace.time_s[0],
        peak_force_n=max(trace.force_n),
        declared_flight_time_s=flight_time,
        illustrative_height_m=height,
        source=trace.construction,
        limitation="Declared synthetic flight interval; no event detector or population claim.",
    )


def canonical_json(trace: ForceTrace) -> str:
    trace.validate()
    payload = {
        "time_s": list(trace.time_s),
        "force_n": list(trace.force_n),
        "sample_rate_hz": trace.sample_rate_hz,
        "force_unit": trace.force_unit,
        "time_unit": trace.time_unit,
        "sign_convention": trace.sign_convention,
        "declared_flight_start": trace.declared_flight_start,
        "declared_flight_end": trace.declared_flight_end,
        "construction": trace.construction,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def content_hash(trace: ForceTrace) -> str:
    return hashlib.sha256(canonical_json(trace).encode("utf-8")).hexdigest()


def demo() -> None:
    trace = generate_synthetic_trace()
    result = summarize_trace(trace)
    assert result.sample_count == 151
    assert abs((result.declared_flight_time_s or 0.0) - 0.22) < 1e-12
    assert 0.05 < result.illustrative_height_m < 0.1
    assert len(content_hash(trace)) == 64


if __name__ == "__main__":
    demo()
    print(json.dumps(summarize_trace(generate_synthetic_trace()).__dict__, indent=2, sort_keys=True))
