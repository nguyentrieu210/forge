# Static Extraction Contract

## Safety model

The scanner does not import Frappe, connect to a database, evaluate `hooks.py`, execute patches or run client scripts. Parsing untrusted upstream source must not produce side effects.

## Complete file inventory

Every source file receives:

- app, tag and commit;
- normalized relative path;
- module and artifact classification;
- extension, size and SHA-256;
- parse status and parser version.

Binary and unsupported files remain in the inventory. They are never silently discarded.

## DocType extraction

The lossless source JSON is retained. The normalized view additionally exposes:

- identity: table/single/virtual/submittable/custom;
- naming: `autoname`, naming rule, title and search fields;
- all fields in source order with every source property;
- child-table and Link dependencies;
- permissions and permission levels;
- states, links and actions;
- sorting, tracking, quick-entry, import and rename controls;
- source path and hash.

The normalizer must not replace the original JSON; it exists to support indexes and comparisons.

## Python extraction

The AST pass records:

- imports and imported symbols;
- top-level assignments, including literal hook structures;
- classes, bases, decorators and source spans;
- functions/methods, arguments, defaults, annotations and source spans;
- document lifecycle methods;
- `frappe.whitelist` methods and `allow_guest`;
- Frappe document/DB/queue/realtime/permission calls;
- literal and dynamic exception messages;
- SQL fingerprints and bounded excerpts;
- referenced DocTypes and mapping calls;
- dynamic constructs that could not be resolved.

A Python syntax error is a hard parse error for a critical controller. It cannot be treated as “documented by filename.”

## Client extraction

The built-in client parser is conservative. It extracts:

- imports;
- named functions/classes;
- form event declarations;
- list-view registration;
- query-report registration;
- RPC method strings;
- route expressions;
- field names in report/filter definitions.

Because JavaScript can be dynamically generated, minified, imported through build aliases or modified at runtime, the static result must be reconciled against browser/runtime traces.

## Hook extraction

Literal top-level hook assignments are recursively flattened into dependency edges. Non-literal expressions are preserved as expressions and marked unresolved for runtime export.

Minimum hook families to review:

- `doc_events`;
- `override_doctype_class`;
- `extend_doctype_class`;
- `permission_query_conditions`;
- `has_permission`;
- `override_whitelisted_methods`;
- scheduler events;
- install/uninstall/migrate hooks;
- boot/session hooks;
- fixtures and required apps;
- website, portal, route and template hooks.

## Reports

Report documentation joins:

- report JSON;
- Python/JS controller symbols;
- reference DocType;
- filters and columns;
- roles;
- prepared-report flag;
- source queries/SQL fingerprints;
- tests and related print formats.

## Parse error policy

Every error is emitted to `parse-errors.json`. Critical artifact parse errors block the source-exact gate. A waiver must name the source hash, explain why static resolution is impossible, identify runtime evidence and have an owner/reviewer.
