# Complete Frappe/ERPNext Artifact Coverage Matrix

This matrix is the normative inventory of source and runtime artifact classes that must be covered before CloudForge may claim source-exact completeness for the locked Frappe/ERPNext baseline.

## Coverage vocabulary

- **Inventory**: every file is path-listed and SHA-256 hashed.
- **Static parse**: structured information is extracted without executing upstream code.
- **Runtime export**: the resolved value from an installed pinned site is captured.
- **Oracle**: an executable behavior case compares upstream and CloudForge outputs.
- **Mapping**: the upstream artifact is linked to CloudForge implementation or an explicit reviewed waiver.

A class is not complete merely because its files were inventoried.

## Framework and application artifact classes

| # | Artifact class | Typical source | Static output | Runtime evidence | Behavioral evidence |
|---:|---|---|---|---|---|
| 1 | Repository file inventory | Entire checkout | `manifest.json` path, size, hash, kind | N/A | Tree fingerprint stable |
| 2 | Python modules | `*.py` | AST symbols, imports, calls, spans, hashes | Import resolution and installed app order | Function/controller fixtures |
| 3 | JavaScript modules | `*.js` | Form/list/report registrations, RPC calls, imports, fields | Built asset/route registration | Browser or API traces |
| 4 | TypeScript modules | `*.ts`, `*.tsx` | Same conservative client index | Built asset registration | Browser traces |
| 5 | Vue components | `*.vue` | Script-block imports, calls and routes | Built component availability | UI behavior fixtures where in scope |
| 6 | DocType schemas | `doctype/*/*.json` | Full lossless JSON plus normalized fields | `frappe.get_meta` merged metadata | CRUD, lifecycle and permission fixtures |
| 7 | Child DocTypes | `istable = 1` JSON | Parent links, fields and precision | Resolved child meta | Row validation and mutation fixtures |
| 8 | DocType controllers | `doctype/*/*.py` | Class inheritance, lifecycle methods, calls, throws, SQL | Controller override resolution | Submit/cancel/amend/race fixtures |
| 9 | DocType client scripts | `doctype/*/*.js` | Events, calls, fields, routes | Loaded script bundle | Advisory UI behavior where in scope |
| 10 | Naming rules | DocType JSON and controller | `autoname`, naming calls, series refs | Naming Series/site settings | Collision, retry and amendment fixtures |
| 11 | Permissions | DocType JSON, hooks, permission modules | Role rows and permission call references | Resolved role/user/share permissions | Positive and negative access fixtures |
| 12 | User permissions | Framework runtime records | Static references only | User Permission export | List/read/write oracle cases |
| 13 | Shares | Framework runtime records | Static references only | DocShare export | Shared document access cases |
| 14 | Workflows | `workflow/*/*.json` | Full JSON, transitions, roles, states | Active workflow and overrides | Transition/action fixtures |
| 15 | Workflow actions | Framework code and runtime | Calls and document refs | Pending actions export | Approval/rejection fixtures |
| 16 | Document events | `hooks.py` | Recursive hook graph | Installed-app merged hook order | Ordered callback traces |
| 17 | Override controllers | `override_doctype_class` | Hook target extraction | Resolved override class | Controller behavior fixtures |
| 18 | Override whitelisted methods | `override_whitelisted_methods` | Hook target extraction | Resolved method | RPC differential cases |
| 19 | Whitelisted RPC methods | `@frappe.whitelist` | Method, decorator args, span and hash | Route availability and auth mode | Request/response/error fixtures |
| 20 | REST document API | Frappe framework | Route and controller references | Route map and auth config | CRUD/query differential cases |
| 21 | Reports | `report/*/*.json` | Full report definition | Installed report, roles, columns | Filter/result/total fixtures |
| 22 | Script report controllers | `report/*/*.py` | `execute`, calls, SQL, refs | Resolved report module | Exact rows, columns and totals |
| 23 | Query reports | JSON/SQL/config | SQL fingerprints and fields | Effective query and roles | Database result fixtures |
| 24 | Prepared reports | Framework report code | Queue/storage call graph | Queue and permission configuration | queued/running/completed/failed cases |
| 25 | Dashboards | `dashboard/*/*.json` | Full JSON | Resolved dashboard | Aggregation fixtures where in scope |
| 26 | Dashboard charts | `dashboard_chart/*/*.json` | Full JSON and refs | Resolved filters/source | Data-series fixtures |
| 27 | Number cards | `number_card/*/*.json` | Full JSON and refs | Resolved permissions/config | Value fixtures |
| 28 | Workspaces | `workspace/*/*.json` | Full JSON, links and roles | Workspace customization merge | Navigation/access fixtures |
| 29 | Pages | `page/*` | JSON/Python/client index | Registered page and route | UI/API fixture where in scope |
| 30 | Web forms | `web_form/*/*.json` | Full JSON, DocType refs | Resolved web form and scripts | Guest/user submission cases |
| 31 | Print formats | `print_format/*/*.json`, HTML/Jinja | Definition and template inventory | Resolved print settings | HTML/PDF golden outputs where in scope |
| 32 | Jinja templates | `templates/**/*.html`, `*.jinja` | Path/hash, includes and references | Template loader resolution | Render fixtures |
| 33 | Email templates | JSON/runtime records | Full standard JSON | Site templates and translations | Render/send payload fixtures |
| 34 | Notifications | `notification/*/*.json` | Full JSON, conditions and refs | Enabled state and recipients | Trigger/non-trigger fixtures |
| 35 | Auto Email Reports | Framework DocType/code | Static call graph | Site records and scheduler state | Delivery fixtures where in scope |
| 36 | Scheduler events | `hooks.py` | Cron/daily/hourly event graph | Merged scheduler events | Job execution/idempotency cases |
| 37 | Background jobs | `frappe.enqueue*` calls | Queue/method/argument references | Queue configuration | retry/failure/idempotency cases |
| 38 | Realtime events | `publish_realtime` calls | Event refs and call spans | Socket/event configuration | Event payload fixtures where in scope |
| 39 | Patches | `patches.txt`, patch modules | Ordered patch list, AST index | Applied Patch Log | Upgrade fixture and idempotency |
| 40 | Migrations | model sync and patch framework | Static references | Before/after schema snapshots | Upgrade differential cases |
| 41 | Fixtures | `fixtures/`, export config | Full file inventory/JSON | Installed records | Import/replay fixtures |
| 42 | Custom fields | runtime DocType records | Static creation refs | Full Custom Field export | Resolved metadata cases |
| 43 | Property setters | runtime records | Static creation refs | Full Property Setter export | Resolved metadata cases |
| 44 | Client Scripts | runtime records | Static references | Full Client Script export | Browser behavior if in scope |
| 45 | Server Scripts | runtime records | Static references | Full Server Script export | Sandboxed behavior cases |
| 46 | Roles and role profiles | JSON/runtime records | Standard definitions | Site role/profile export | Permission differential cases |
| 47 | Module profiles | runtime records | Static refs | Site export | Module visibility cases |
| 48 | Domain settings | hooks/runtime | Domain dependency extraction | Active domains | Feature visibility/behavior cases |
| 49 | System settings | framework DocTypes | Static refs | Sanitized runtime export | Configuration matrix fixtures |
| 50 | Company/accounting settings | ERPNext DocTypes | Schema/controller extraction | Fixture site settings | Accounting matrix fixtures |
| 51 | Regional modules | `regional/*`, hooks | Modules, overrides, templates, taxes | Active country/domain settings | Country-specific oracle suites |
| 52 | Translations | `translations/*.csv`, PO/POT | Locale/key/value inventory and hash | Installed language and overrides | Label/error snapshots where required |
| 53 | SQL | literal and dynamic SQL in code, `.sql` files | Normalized literal fingerprints, dynamic markers | DB engine/version and actual query traces | Result and race fixtures |
| 54 | Query Builder usage | Python calls | Call graph and expressions where static | Runtime SQL trace | Result fixtures |
| 55 | Database schema | DocType meta/migrations | Intended columns/index hints | `information_schema` snapshot | Constraint/race cases |
| 56 | Redis/cache behavior | cache calls | Call graph and key expressions | Cache configuration | invalidation/concurrency fixtures |
| 57 | File and attachment behavior | File DocType/code | Calls, permission refs, storage hooks | Storage backend config | upload/read/delete/access cases |
| 58 | Data import | importer code/DocTypes | Call graph and schemas | Import settings | template/validation/import fixtures |
| 59 | Data export | exporter code | Call graph and fields | Export permissions/settings | output fixtures |
| 60 | Assignment rules | DocType/controller | Schema, calls, conditions | Active rules | allocation fixtures |
| 61 | ToDo and comments | framework controllers | Schema/call graph | Site settings | creation/access/notification cases |
| 62 | Versioning and audit | Version/Activity Log code | Hook and write call graph | Audit settings | before/after audit fixtures |
| 63 | Authentication | auth modules/hooks | Routes, decorators, calls | enabled providers/session config | success/failure/session cases |
| 64 | OAuth/connected apps | framework DocTypes/code | Schema/routes/calls | sanitized provider config | auth flow cases where in scope |
| 65 | Sessions | framework auth/session code | Call graph and settings refs | session settings | expiry/logout/concurrency cases |
| 66 | Boot payload | boot modules/hooks | producers and merged keys | sanitized boot export by role | role-specific boot snapshot |
| 67 | Desk/list/form routes | client/router code | route registrations and calls | built route map | browser route fixtures if parity claimed |
| 68 | List view settings | `*_list.js`, runtime settings | events, fields, calls | user/list settings | list behavior fixtures |
| 69 | Kanban/calendar/gantt | framework views/config | registrations and refs | available views/config | view data fixtures if in scope |
| 70 | Search and link queries | whitelisted methods/hooks | method and DocType refs | resolved query override | result/permission fixtures |
| 71 | Tree DocTypes | schema/controllers | nested-set refs and calls | resolved meta | move/rebuild/permission cases |
| 72 | Single DocTypes | schema/controllers | `issingle`, fields | resolved singleton values | read/write cases |
| 73 | Virtual DocTypes | controller hooks | class/call graph | registered virtual types | CRUD/query fixtures |
| 74 | Submittable lifecycle | schemas/controllers | lifecycle matrix | workflow and permissions | draft/submit/cancel/amend cases |
| 75 | Ledger posting | ERPNext controllers | posting calls and SQL refs | accounting/stock config | GL/SLE/payment reconciliation |
| 76 | Reposting | ERPNext stock/accounts jobs | call/job graph | queue/settings | cancel/repost/race fixtures |
| 77 | Taxes and totals | transaction controllers | call graph, throws, mappings | templates/settings | inclusive/exclusive/rounding matrix |
| 78 | Pricing rules | pricing modules | schemas/calls/conditions | active pricing data | priority/stacking/currency fixtures |
| 79 | Currency exchange | accounts utilities | calls and settings | rates/settings | gain/loss and precision cases |
| 80 | Serial and batch | stock modules | schemas/calls/SQL | stock settings | bundle/reservation/return cases |
| 81 | Manufacturing | manufacturing modules | complete source indexes | fixture master data | BOM/MRP/work-order/job-card cases |
| 82 | Assets | assets modules | complete source indexes | depreciation settings | capitalization/depreciation/disposal cases |
| 83 | Projects | projects modules | complete source indexes | settings | costing/billing/status cases |
| 84 | CRM/support/quality | modules | complete source indexes | settings | module-specific cases |
| 85 | POS | POS modules/client | source/client indexes | profile/settings | offline/sync/invoice/payment cases |
| 86 | External integrations | integrations/connectors | routes/calls/config refs | sanitized enabled integrations | contract tests or reviewed waiver |
| 87 | Tests | `test_*.py`, JS tests | inventory, symbols, fixtures and refs | test environment | Upstream test mapping ledger |
| 88 | Documentation | Markdown/RST | inventory/hash and link graph | N/A | Requirement traceability only |
| 89 | Build configuration | `pyproject`, package files, bundler configs | lossless text/hash and parsed config where supported | actual toolchain versions | reproducible build evidence |
| 90 | License/provenance | LICENSE, headers, third-party notices | inventory/hash | N/A | Provenance review |

## Completion rule

For every row that is in the declared CloudForge parity scope, the artifact-resolution ledger must contain:

1. immutable upstream source path and hash;
2. static parser output reference;
3. runtime export reference, or a justified `NOT_APPLICABLE` decision;
4. CloudForge implementation reference or reviewed waiver;
5. at least one positive and one negative oracle case;
6. lifecycle/race/replay cases where the behavior mutates state;
7. reviewer, review date and evidence hash.

Any blank, `SOURCE_SCAN_PENDING`, unreviewed waiver or stale hash keeps the gate open.
