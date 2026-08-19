# ML-109 implementation report

## Outcome

ML-109 freezes a versioned, machine-readable, code-backed CMJ scientific
contract. It deliberately does not implement the production signal processor
or the ML-110 validation corpus.

## Authority tuple

| Field | Value |
| --- | --- |
| Issue | `ML-109` |
| Branch | `work/ml109-b02-cmj-processor-contract-v1` |
| Base | `10e57092f6956456134450c901a58daf76f685b0` |
| Protocol | `CMJ-U-BI-HOH` |
| Metric pack | `CMJ_VERTICAL_CORE` v1.0.0 |
| Processor | not implemented |
| Source adapter | synthetic/reference only |
| Supported configurations | `single.total_fz`, `dual.independent_fz` |

## Delivered

- `packages/cmj-contract/`: pure contract package, generated JSON authority,
  JSON Schema, policy helpers, and contract consistency tests.
- `scripts/generate_cmj_contract.py`: deterministic source-to-artifact
  generator with `--check` mode.
- `architecture/topology.json`: package boundary forbidding raw signal/CSV
  parsing, network access, environment access, and application imports.
- Root `generate:check`: includes CMJ contract generation verification.
- `docs/contracts/ML109_CMJ_PROCESSOR_PROTOCOL_EVENT_METRIC_PACK_V1.md` and
  this evidence set.
- `docs/research/ml109-primary-sources.md`: primary-source research note.

## Verification performed

The local authority verifier, contract generation check, package contract
tests, repository validation, Python validation, security tests, secret scan,
dependency scan, practitioner lint, production build, and `git diff --check`
passed. The authoritative command outcomes are duplicated in
`ML109_FINAL_RECEIPT.txt` and the self-consistency proof; no secret values are
included. The security suite's live Postgres RLS check was explicitly marked
optional and not executed because no live database credential was used.

## Known limitation

The numerical thresholds are frozen engineering policies for a future
deterministic implementation, not a claim that one threshold is universally
valid across all hardware, populations, protocols, or preprocessing choices.
ML-110 must validate them against an accepted corpus before production use.
