# SportsAgentsLab full public source release

This directory is the reproducible source-release boundary for
`SPORTSAGENTSLAB_FULL_PUBLIC_SOURCE_RELEASE_V1`. It publishes the real tracked
SportsAgentsLab system tree, including the practitioner application, backend
routes, agent runtime, prompts, tools, domain packages, schemas, migrations,
scientific modules, tests, evaluation code that is not held out, CI, build
configuration, and project-local documentation.

The default is publish-as-is. A file is transformed only when the release
classification explicitly says `PUBLISH_REDACTED` or
`PUBLISH_GENERATED_TEMPLATE`; excluded files remain absent from the public
tree. Internal vocabulary is not sanitized by this pipeline.

## Commands

From the private repository root:

```text
python source-release/scripts/build_public_tree.py --mode audit
python source-release/scripts/build_public_tree.py --mode build
python source-release/scripts/build_public_tree.py --mode scan
python source-release/scripts/build_public_tree.py --mode test
python source-release/scripts/build_public_tree.py --mode diff --public <public-tree>
```

The builder uses a dedicated temporary stage named
`sportsagentslab-full-public-source-v1`. Private inventories and release
receipts are written under `source-release/receipts/` and are ignored by the
public tree. They must never be copied into the public repository.

The public distribution is source-available under the proprietary
SportsAgentsLab license in the generated root `LICENSE`. It is not an
open-source license. GitHub viewing and ordinary repository interaction remain
subject to the GitHub Terms of Service carve-out stated in that license.

Release gates are intentionally fail-closed: every tracked path receives one
allowed classification, public-tree integrity is compared against the private
inventory, secret/PII/local-metadata/third-party/held-out scans run on the
staged tree, the public history is fresh, and the public CI boundary is
present. This pipeline does not advance scientific authority or B02 work.
