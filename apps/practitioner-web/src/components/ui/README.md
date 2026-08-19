# Source-owned UI convention

MEF adopts the shadcn/ui convention: component source lives in this
repository, and screens consume MEF semantic wrappers rather than importing
arbitrary third-party primitives. The current shared implementations are
`../mef-primitives.tsx`, `../mef/data/mef-data-table.tsx`, and the bounded
agent/form/provenance components under `../mef/`.

Radix is wrapped at the MEF boundary in `../eve-agent-dock.tsx`. No shadcn
registry package or second general-purpose UI foundation is installed.
