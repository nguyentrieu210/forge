# Source Artifact Data Model

## Identity

Every artifact key is stable for a source snapshot:

```text
<app>:<full-commit>:<kind>:<relative-source-path>
```

A renamed file is a new artifact linked through a diff record, not silently treated as the old artifact.

## Core records

### File artifact

- artifact key;
- app/tag/commit/license;
- source path/module/kind;
- SHA-256 and size;
- extension;
- parse status/error.

### DocType artifact

- full source metadata;
- normalized identity/naming/behavior/sorting;
- ordered fields;
- permissions/states/links/actions;
- Link/Table dependencies;
- controller/client/report joins.

### Python artifact

- imports;
- assignments;
- classes/functions/source spans;
- lifecycle and whitelisted methods;
- calls/messages/SQL/document references/mappings.

### Client artifact

- imports/symbols;
- form handlers;
- list/report registration;
- RPC and routes;
- parser confidence.

### Dependency edge

- edge type;
- from/to identity;
- source path and source line where available;
- dynamic/unresolved status.

### Behavior case

- stable behavior ID;
- source artifacts;
- setup/input/sequence;
- expected output and ledgers;
- normalization rules;
- source and CloudForge evidence;
- result status.

### Mapping record

- source behavior/artifact set;
- disposition;
- CloudForge implementation references;
- license profile;
- oracle cases and status.
