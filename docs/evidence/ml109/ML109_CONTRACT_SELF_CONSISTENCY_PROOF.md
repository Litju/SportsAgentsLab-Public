# ML-109 contract self-consistency proof

The canonical source is `packages/cmj-contract/schemas/contract.source.json`.
Generated authority is produced by `scripts/generate_cmj_contract.py`; a
clean `--check` run is required so generated files cannot drift.

## Required invariants

- unique metric IDs;
- unique event IDs;
- all metric dependencies resolve;
- all required events are defined;
- exactly one primary metric;
- excluded metrics are absent from the core pack;
- units are from the known-unit set;
- event ordering is valid;
- quality codes are unique;
- only supported acquisition configurations are present;
- unknown sample rate fails closed;
- numerical policy is complete;
- semantic manifest hash is stable.

## Executable proof

`packages/cmj-contract/test/contract.test.ts` contains the executable proof.
It also checks the three analytical sanity examples and the explicit
no-processor boundary. The final command receipt records the test count and
the generated manifest hash.

## Synchronization proof

The package exports the generated artifacts rather than duplicating contract
constants in application code. Root `generate:check` includes both the
existing model generator and this generator. The package topology forbids
application, network, environment, raw CSV, and raw signal imports.

Any change to the canonical source must regenerate artifacts and update the
manifest hash in the same change. Generated output is not hand-edited.
