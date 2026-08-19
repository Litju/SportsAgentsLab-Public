# Public source status

Every public code area has one of these labels:

- `REAL_PRODUCTION_DERIVED`: selected implementation shape from the private
  system, bounded and vocabulary-sanitized for public inspection.
- `PUBLIC_ADAPTER`: a public boundary or rewrite that keeps the useful shape
  without a private dependency.
- `PUBLIC_DEMO_ONLY`: showcase behavior that exists to explain the system.
- `SYNTHETIC_DATA_ONLY`: generated values with no athlete record.
- `INTERFACE_ONLY`: typed shape without a production runtime implementation.

The production codebase remains private and authoritative.
