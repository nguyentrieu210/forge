# Coverage Contract

## Purpose

The word “complete” is prohibited without a named denominator. Every status report must state the coverage dimension, scope, version and evidence.

## Coverage dimensions

### SOURCE_INVENTORY

**Denominator:** every regular file below the immutable source root after only mechanical exclusions such as `.git`, caches and vendored `node_modules`.

**Evidence:** path, size, kind and SHA-256 for every file plus a deterministic root-tree fingerprint.

**100% gate:** no unreadable file and no path omitted by an undocumented exclusion.

### STATIC_STRUCTURE

**Denominator:** all artifacts supported by the extractor:

- DocType, child DocType and Single DocType JSON;
- reports and report clients;
- controllers and Python modules;
- `hooks.py`, config modules and patches;
- form/list/report clients in JS, TS and Vue;
- pages, workspaces, dashboards, print formats, workflows, notifications, web forms and fixtures.

**Evidence:** structured JSON indexes, source spans and parse error ledger.

**100% gate:** all supported files parsed, every unsupported/dynamic construct recorded, and no critical artifact silently downgraded to plain text.

### RUNTIME_RESOLUTION

**Denominator:** runtime metadata and hook results for a clean pinned site plus every declared regional/configuration profile.

**Evidence:** canonical JSON export from Frappe APIs/DB under a controlled site, including merged metadata and effective permissions.

**100% gate:** every standard DocType/report/page/workspace and effective hook from the installed apps is exported and linked back to source hashes.

### BEHAVIORAL_ORACLE

**Denominator:** the behavior ledger for the selected product scope. A behavior is an observable contract, not a source method count.

Examples:

- creating/submitting/cancelling/amending a Sales Invoice;
- tax, currency, rounding and outstanding outcomes;
- immutable ledger reversal;
- permission denial and existence-oracle resistance;
- prepared report results and ordering;
- retries, races and failure recovery.

**Evidence:** canonical inputs and outputs from both the pinned oracle site and CloudForge.

**100% gate:** all mandatory fixtures match or have a reviewed, legally and technically justified divergence.

### UI_INTERACTION

**Denominator:** declared user interactions for supported screens and roles.

**Evidence:** browser-level interaction traces and accessibility snapshots.

### MIGRATION

**Denominator:** every supported source schema/version and migration route.

**Evidence:** import/reconciliation fixtures, checksums and rollback/repair evidence.

## Status vocabulary

Allowed:

- `NOT_SCANNED`
- `INVENTORIED`
- `STATIC_EXTRACTED`
- `RUNTIME_EXPORTED`
- `MAPPED`
- `IMPLEMENTED`
- `ORACLE_GREEN`
- `WAIVED_REVIEWED`
- `BLOCKED`

Forbidden shortcuts:

- “done” without scope;
- “copy exact” based only on matching fields;
- “ERPNext compatible” based only on happy-path screens;
- “100%” without denominator and evidence IDs.
