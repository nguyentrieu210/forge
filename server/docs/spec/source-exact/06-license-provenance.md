# License and Provenance Contract

## Baseline licenses

Frappe Framework and ERPNext do not have the same license profile. Every copied or adapted fragment must retain source provenance and follow the applicable upstream license.

## Provenance record

For direct ports, record:

- upstream app/repository;
- commit, path and source hash;
- source line span at review time;
- copied/adapted CloudForge path and symbol;
- transformation summary;
- license and notice requirement;
- reviewer and review timestamp.

## Clean-room boundary

A clean-room reimplementation may use:

- public API contracts;
- generated metadata structure;
- observable input/output behavior;
- independently produced oracle fixtures;
- high-level algorithms not protected as copied expression.

It must not silently reproduce protected source expression while claiming to be independent. When source code is directly translated, classify it as a port and apply its license obligations.

## Generated documentation

Hashes, paths, symbol names, field metadata and compact structural extracts are stored for reproducibility. The pipeline avoids embedding the entire upstream repository into CloudForge documentation. Lossless DocType/report JSON is retained because it is required to reproduce metadata behavior; distribution and derivative-work implications must be reviewed under the applicable app license.

## Release gate

A release containing unresolved `LICENSE_PROFILE_PENDING` or source-derived code without provenance fails the legal gate, regardless of test status.
