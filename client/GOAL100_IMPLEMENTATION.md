> **RC status (2026-07-25):** tài liệu này mô tả phần đã triển khai trong source `1.0.0-rc.1`. Nó không phải bằng chứng deploy production. Gate offline và giới hạn xác minh nằm trong [PRODUCT_RC1_REPORT.md](./PRODUCT_RC1_REPORT.md); việc nâng lên `1.0.0` bắt buộc hoàn tất [PRODUCT_DEPLOYMENT_CHECKLIST.md](./PRODUCT_DEPLOYMENT_CHECKLIST.md) trên site Frappe đích.

# MetaForge Goal 100 — Business Suite UX implementation

This checkpoint converts MetaForge from a generic Form/List demo into a role-aware business application shell. It keeps Frappe as the source of truth for metadata, permissions, workspaces and documents.

## Implemented in source

### 1. Role-aware global business context

- `Company`, `Fiscal Year`, `Warehouse` and optional dimensions are resolved by the backend from roles, User Permissions and current defaults.
- The top navigation renders only enabled dimensions; one-option dimensions are auto-selected/hidden.
- Company changes invalidate dependent Fiscal Year/Warehouse/Branch/Cost Center values.
- Fiscal Year returns server-derived `date_from`/`date_to`.
- Context participates in query cache keys, List filters, Link filters, create defaults, Overview and Process counters.
- Backend validates the allowed options; local storage never grants access.

Key files:

- `packages/core/src/business/context.ts`
- `packages/shell/src/BusinessContext.tsx`
- `frappe-app/metaforge/metaforge/api.py#get_business_context`

### 2. Full Frappe application catalog and Workspace navigation

- Catalog is built from all Workspaces returned to the current user by Frappe.
- Hierarchy: Application/Module → Workspace → Sections → DocTypes/Reports/Pages/Dashboards.
- Role and DocType read permission filtering is applied before returning data.
- The catalog view shows every item, supports search and preserves workspace grouping/order.
- The sidebar stays compact by listing Workspaces instead of flattening hundreds of DocTypes.

Key files:

- `packages/core/src/business/catalog.ts`
- `packages/views/src/catalog/*`
- `frappe-app/metaforge/metaforge/api.py#get_application_catalog`

### 3. Sidebar interaction and visual state

- Strong active background, accent icon, bold label and left indicator.
- Distinct hover/focus/active states and `aria-current="page"`.
- Active group opens automatically and scrolls into view.
- Search, persisted collapsed state, persisted expanded groups, badges, disabled reasons and mobile drawer.
- Full-row click targets and compact icon mode with tooltips.

Key file: `packages/shell/src/AppShell.tsx`

### 4. Overview dashboard engine

- Per-domain Overview screens for Stock, Selling, Buying, Accounts, Manufacturing, HR, CRM, Projects, Assets, Support and Quality.
- Permission/context-aware KPI counters, tasks, overdue indicators, recent activity and quick actions.
- Stock aggregates include quantity/value/items/expiry where the installed ERPNext schema permits it.
- KPI/task/chart cards navigate to filtered lists.
- Bar, line and donut chart rendering uses Recharts.

Key files:

- `packages/core/src/business/overview.ts`
- `packages/views/src/overview/*`
- `frappe-app/metaforge/metaforge/api.py#get_overview`

### 5. Business Process screen

- MISA-style visual stages with numbered cards and connecting arrows.
- Live counters, overdue status, role/permission filtering and global context filters.
- Domain templates for Stock inbound/outbound/transfer/count/replenishment plus Selling, Buying, Manufacturing, Accounts, HR, CRM, Projects, Assets, Support and Quality.
- Every available stage opens its filtered DocType list.

Key files:

- `packages/core/src/business/process.ts`
- `packages/views/src/process/*`
- `frappe-app/metaforge/metaforge/api.py#get_processes`

### 6. Separate wide Create modal

- `new` records no longer use the three-column existing-document detail layout.
- Wide responsive modal with fixed header, scrollable form and fixed footer.
- Cancel confirmation, `Lưu và mở`, server validation, permission fail-closed and business-context create defaults.
- Mobile naturally uses the full available viewport.

Key files:

- `packages/views/src/app/DoctypeWorkspace.tsx`
- `packages/views/src/container/NewFormContainer.tsx`
- `packages/views/src/form/FormView.tsx`

### 7. Link and display-value consistency

- Link fields use server search, filters, pagination, race guards and strict invalid-target behavior.
- Stored value remains the document `name`; UI resolves and displays title/image/description.
- Shared display resolver is used by form/list-related services and is scoped by user/site/context cache.
- Global Company context narrows universal company-owned link targets without incorrectly pinning transfer targets to the current warehouse.
- Metadata labels can be translated in batches through Frappe `_()`.

Key files:

- `packages/core/src/business/display.ts`
- `packages/views/src/container/services.ts`
- `frappe-app/metaforge/metaforge/api.py#resolve_display_values`
- `frappe-app/metaforge/metaforge/api.py#translate_strings`

### 8. Permission Center

- Reusable kit component, not a demo-only screen.
- User profile/roles, User Permission scopes, application/workspace visibility, Role Permission matrix and effective permission trace.
- Field-level read/write explanation by permlevel, hidden/read-only state and effective Frappe capabilities.
- Updates Role Permission through the existing server contract; backend remains authoritative.
- Generated applications expose the center only to System Manager/Administrator roles.

Key files:

- `packages/views/src/access/PermissionCenter.tsx`
- `packages/core/src/business/access.ts`
- `frappe-app/metaforge/metaforge/api.py#get_access_profile`
- `frappe-app/metaforge/metaforge/api.py#explain_permission`

### 9. Timeline and context panel cleanup

- Sanitized comment HTML instead of raw `<p>...</p>` text.
- Relative/local timestamps instead of raw microseconds.
- Comment keyboard shortcut, assignments, shares, attachments, tags and connections.

Key file: `packages/views/src/detail/ContextPanel.tsx`

### 10. App factory parity

- Newly generated apps include Business Context, Overview, Process, full Workspace catalog, Permission Center, modal create and shared runtime packages.
- `--domain` supports the major business domains.
- Sample WMS and Sales apps use the same generated runtime shape.
- Engine code is not copied into generated apps.

Key files:

- `packages/create-metaforge-app/src/templates.ts`
- `packages/create-metaforge-app/src/cli.ts`
- `apps/sample-wms/src/main.tsx`
- `apps/sample-sales/src/main.tsx`

## Verification performed in this handoff environment

- TypeScript/TSX syntax scan: 168 source files, zero syntax diagnostics.
- Python compilation: `api.py` and `hooks.py` pass.
- Native UI gate: zero violations.
- Secret scanner: zero findings on a source-tree archive without `.git` (scanner now supports both Git and ZIP handoffs).
- `@metaforge/core`, `@metaforge/adapter-frappe` and `create-metaforge-app` targeted TypeScript builds pass with locally available type dependencies.
- Business-context policy/catalog pure smoke test: pass.
- Generated application template rendered and its `main.tsx`, manifest and Vite config passed TypeScript syntax transpilation.

## Required final acceptance on a real Frappe/ERPNext site

The code scope is implemented, but production acceptance must still run in the repository's normal pnpm environment and a disposable live site:

1. frozen install;
2. root typecheck/lint/selfcheck/build;
3. demo and generated-app E2E;
4. multi-company/multi-warehouse restricted-user tests;
5. Workspace/catalog comparison against Frappe Desk;
6. Role Permission/User Permission negative tests;
7. Overview/process counter reconciliation against live reports;
8. create modal save/reload tests for representative DocTypes;
9. Link title/filter tests in Form, List, Child Table and Report;
10. secret scan and clean source tree.

Passing those checks is the release gate. This document does not claim live verification that was not executed in this environment.
