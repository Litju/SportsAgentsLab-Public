# ML-104 Integrity Conformance

The canonical test suite has 7 passing tests. The fixture corpus and generated-input checks cover:

| Case | Expected control |
|---|---|
| identity mapping | qualified deterministic output |
| `kN -> N` | explicit registry conversion |
| `ms -> s` | explicit registry conversion |
| sign inversion | explicit `SIGN_FLIP` |
| unknown/conflicting unit | unresolved/conflicting unit finding |
| unknown/conflicting axis | unresolved/conflicting axis finding |
| irregular, duplicate, nonmonotonic time | explicit time findings; no repair |
| missing source index | `MISSING_INDEXED_SAMPLE` |
| missing numeric / `NaN` / `Infinity` | `MISSING_VALUE` or `NONFINITE_VALUE` |
| missing mapped channel | `MISSING_MAPPED_CHANNEL`; no synthesized channel |
| extra field | `EXTRA_UNKNOWN_CHANNEL` with declared severity |
| expected count mismatch | `COUNT_MISMATCH` |
| explicit range | `RANGE_VIOLATION` |
| two-batch large input | streamed record preservation |

The canonicalizer emits no `Arrow` or whole-source record buffer. It retains only bounded per-channel counters/values needed for deterministic integrity accounting and the deterministic derived artifact stream. Configuration resolution is `NOT_EVALUATED`. Clipping/saturation is not asserted because no clipping declaration exists in the reference mapping.
