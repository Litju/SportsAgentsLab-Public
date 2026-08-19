# SportsAgentsLab MEF

## Active work and authority

This file deliberately does not name an active issue. At the start of every
engineering run, derive the controlling work item from all of the following:

- the current Linear issue;
- the current Git branch;
- the accepted predecessor/base commit; and
- the repository authority and change-control records.

Record the derived issue, branch, predecessor commit, and any disagreement in
the run evidence. If those sources disagree, fail closed and obtain founder
direction; do not infer authority from a stale issue number, branch name, or
builder summary.

Do not begin product implementation or downstream block work unless the
derived issue and repository authority explicitly authorize it. Consuming an
accepted predecessor contract is not implementation of that predecessor.

Treat files under `authority/` as immutable frozen source artifacts.

Development-time skills, personas, agents, teams, and QA come from the separate
SportsAgentsLab Engineering System.
