# MetaForge 1.0.0-rc.1 → 1.0.0 production acceptance

> Đây là checklist bắt buộc để promote source RC thành production. Các ô chưa tick có nghĩa là chưa có bằng chứng live; không được dùng tài liệu này để tuyên bố đã deploy production.


## Build gates

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm e2e`
- [ ] `pnpm scan-secrets`
- [ ] clean Git status

## Business Context

- [ ] Warehouse user with one Company/one Warehouse gets auto-selected locked context.
- [ ] Multi-company manager can switch Company and receives only allowed warehouses.
- [ ] Company A can never coexist with Warehouse B from another company.
- [ ] Fiscal Year changes list/report date ranges without overwriting existing document dates.
- [ ] Context switch invalidates cached list, Link, Overview and Process data.

## Catalog and navigation

- [ ] Catalog contains every Frappe Workspace visible to the same user in Desk.
- [ ] Restricted workspaces/items are absent.
- [ ] Sidebar active state follows nested routes and survives refresh.
- [ ] Catalog search finds translated label, technical key and DocType.

## Overview and Process

- [ ] KPI counts reconcile with their target filtered lists.
- [ ] Process stage counts reconcile with their target filtered lists.
- [ ] Counters change when Company/Fiscal Year/Warehouse changes.
- [ ] Restricted roles never see unauthorized actions/stages.

## Create modal and Link fields

- [ ] Create opens in a wide modal, not the three-column detail panel.
- [ ] Cancel protects unsaved input.
- [ ] Context defaults seed only matching fields.
- [ ] Link fields store `name` and display title.
- [ ] Company-owned Link targets are context-filtered.
- [ ] Transfer target warehouse is not incorrectly pinned to the current/source warehouse.

## Permission Center

- [ ] System Manager sees Permission Center; ordinary users do not.
- [ ] Role matrix writes and reloads from Frappe.
- [ ] User Permission scope matches the user's actual Company/Warehouse access.
- [ ] Effective trace matches backend allow/deny behavior, including field permlevels.

## App factory

- [ ] Generate Stock and Selling apps into clean temporary folders.
- [ ] Generated apps do not copy engine source.
- [ ] Generated apps install/typecheck/build.
- [ ] Generated apps boot with cookie-session auth and render Overview/Process/Catalog.
