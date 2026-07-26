# MetaForge product deployment checklist

## 1. Clean build

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm product:check
pnpm product:backend
pnpm typecheck
pnpm lint
pnpm scan-secrets
pnpm test
pnpm build
```

Do not deploy old `dist/` files from a prior archive. Build them from this source and lockfile.

## 2. Frappe backend

Copy/install `frappe-app/metaforge`, then on the target site run the site's normal app installation/migration procedure. Restart workers/web processes after migration. Confirm that all `metaforge.api.*` endpoints are reachable only through authenticated cookie sessions and CSRF-protected POST requests.

## 3. Required live acceptance

Test at least these users in separate browser contexts:

- Warehouse operator restricted to one Company and one Warehouse.
- Manager with multiple Companies/Warehouses.
- Accounts user with no warehouse responsibility.
- System Manager using Permission Center.
- Ordinary user who must not see Permission Center.

For each user verify:

- Topnav selectors and defaults match effective access.
- Switching Company clears invalid Warehouse/Branch selections and all list/report/overview/process data changes.
- KPI and Process counts equal their destination lists.
- Purchase Receipt, Delivery Note and Stock Entry warehouse scope works through child rows.
- Create modal seeds only valid context fields.
- Link inputs display titles but persist names; free identifiers are rejected.
- Role Profile/User Permission changes take effect after a fresh login.
- Selected-user permission trace matches an actual allowed and denied write request.

## 4. Release promotion

Promote `1.0.0-rc.1` to `1.0.0` only when frozen install, full build, E2E and the live acceptance above all pass with a clean tree and no credentials in artifacts.
