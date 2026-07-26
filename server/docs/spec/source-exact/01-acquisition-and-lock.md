# Immutable Source Acquisition and Lock

## Inputs

Each upstream entry must include:

- repository URL;
- release tag;
- full 40-character commit SHA;
- license identifier;
- compatibility role;
- archive SHA-256 after download;
- deterministic extracted-tree fingerprint;
- acquisition timestamp and tool version.

## Resolution procedure

1. Query the official GitHub tag reference.
2. Dereference annotated tags until a commit object is reached.
3. Compare the resolved commit with `source-lock.json`.
4. Abort on any mismatch.
5. Download the archive from the official repository endpoint.
6. Hash the exact downloaded bytes.
7. Reject absolute paths and `..` traversal during extraction.
8. Hash every extracted file and calculate the root-tree fingerprint.
9. Save an acquisition receipt adjacent to the source checkout.

## Reproducibility

The source tag is never sufficient as the identity because a mutable or incorrectly resolved reference would invalidate all downstream evidence. Generated artifacts are keyed by:

```text
app + full_commit + source_path + source_hash + extractor_schema_version
```

A source hash change invalidates:

- source mapping approval;
- implementation mapping approval;
- oracle-green status for affected behavior;
- copied-code license review;
- performance and security evidence associated with the old source.

## Local source layout

Recommended:

```text
../upstream/
├── frappe-v16.19.0/
├── frappe-v16.19.0.acquisition.json
├── erpnext-v16.20.0/
└── erpnext-v16.20.0.acquisition.json
```

Never commit the entire upstream source into CloudForge merely to preserve evidence. Preserve immutable hashes, generated structural documents, mapping references and any legally required notices. Directly ported code must be isolated and licensed according to the upstream license.
