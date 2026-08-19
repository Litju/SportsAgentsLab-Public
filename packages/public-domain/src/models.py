"""Small public domain models for synthetic evidence examples."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MeasurementObservation:
    name: str
    value: float
    unit: str
    source: str
    status: str = "SYNTHETIC_DATA_ONLY"


@dataclass(frozen=True)
class EvidenceNote:
    label: str
    text: str
    limitation: str
