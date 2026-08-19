# SportsAgentsLab

## Full public source-available distribution

This repository is the complete publishable SportsAgentsLab source tree, not a
demo-only showcase. It contains the actual tracked frontend, backend, agent
runtime, prompts, tools, domain packages, schemas, migrations, scientific
modules, tests, public evaluation code, CI, build configuration, infrastructure
templates, and project documentation.

The system includes the practitioner-facing measurement workflow and its
separate Measurement, Research, Monitoring, Prescription, and Marketing agent
boundaries. AI-assisted work remains distinct from deterministic scientific
calculation and practitioner-facing output. The source is published so the
implementation can be inspected and reproduced; this distribution does not
grant general reuse rights.

### Build and validation

The repository is a pnpm workspace with Python tooling. The public CI workflows
cover source-release integrity, installation, typechecking, linting, tests,
scientific checks, builds, dependency/security checks, and license policy. Run
the same checks locally with the commands documented in the root project files.

### License and boundaries

SportsAgentsLab is source-available under the proprietary
`SportsAgentsLab Proprietary Source-Available License`. It is not open source.
Read `LICENSE`, `NOTICE`, `COPYRIGHT`, and `TRADEMARKS.md` before using or
redistributing anything. No secrets, private receipts, PII, machine-local
state, non-redistributable third-party material, live operational credentials,
held-out evaluation answers, or legal-privileged material are included.

Public repository viewing, forking, and ordinary GitHub interaction remain
subject to the GitHub Terms of Service carve-out in `LICENSE`.

Copyright Julio Rodriguez 2026.
