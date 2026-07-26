# Runtime Export Contract

Static source is necessary but insufficient because Frappe behavior is assembled at runtime from installed apps, site configuration and database metadata.

## Oracle site

Create a clean disposable site with exactly the locked commits and declared optional apps. Record:

- Python, Node, database and system versions;
- installed apps and commits;
- site configuration with secrets removed;
- country, currency, language and time zone;
- enabled regional modules and feature flags;
- migration state and patch log hash.

## Export domains

### Effective metadata

For every DocType:

- merged `frappe.get_meta` output;
- standard and custom fields;
- property setters;
- effective permissions and permission levels;
- workflow and workflow states;
- naming settings;
- list/search/title settings;
- controller class and extended/overridden mixins;
- dashboard links and actions.

### Hook registry

Export the effective hook values after app merge, preserving app order and callable identity.

### API registry

Export:

- whitelisted methods and guest flags;
- REST v1/v2 document capabilities;
- method overrides;
- upload/download/print/import/export routes;
- background job entry points.

### UI registry

Export boot payload sections, workspace/page definitions, list settings, report filters and registered client assets for the declared roles.

### Database metadata

Export table/column/index/constraint metadata for the supported database engines. Runtime schema is compared to source metadata rather than assumed from DocType JSON alone.

## Canonical format

All exports must:

- use deterministic key ordering;
- remove timestamps/session IDs/secrets;
- normalize translated labels to the selected language profile;
- preserve integer/decimal/date/time semantics explicitly;
- include app commit and source-tree fingerprint;
- include exporter version and schema version.

## Drift handling

A runtime artifact that cannot be linked to a source artifact is `RUNTIME_ONLY_UNMAPPED` and blocks full-parity claims. A source artifact absent at runtime is `SOURCE_ONLY_INACTIVE` and requires an explanation such as optional dependency, migration condition or disabled module.
