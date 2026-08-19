# Validation philosophy

Validation starts with a clear contract, deterministic inputs, and tests that
exercise both normal values and failure boundaries. The public tests cover
finite-value checks, monotonic time, units, numerical integration, and
synthetic-data regeneration.

The public snapshot does not include confidential evaluation partitions or
reference outputs. It explains the separation conceptually so readers can see
why development examples should not double as an unseen benchmark.

Pass/fail language in this repository applies to the example code and its test
contract only. It is not evidence for a device, population, or service beyond
the files shown here.
