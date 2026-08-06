# E2E-00 — Login and Operating Context

## Persona
Named non-admin employee/operator with the role profile used by a downstream business flow.

## Job
Enter Forge through the supported browser login path and reach a usable workspace with the correct tenant/company/context and only allowed navigation.

## Preconditions
- target identity resolved;
- named enabled test user exists;
- expected role/profile declared;
- company/tenant membership declared;
- no credential stored in source.

## Operator steps
1. Open the application root/login route.
2. Enter credentials through the real login controls.
3. Submit login.
4. Wait for the authenticated workspace.
5. Verify user identity/context shown by the product where exposed.
6. Verify expected primary module navigation exists.
7. Attempt one route the persona should access.
8. In permission-negative variant, attempt one route/action the persona must not access.

## PASS
- supported login succeeds;
- no unexpected 401/403/5xx after authentication;
- correct workspace/navigation renders;
- permitted route works;
- forbidden route/action fails closed with operator-safe permission UX;
- no uncaught page/console/red UI error;
- session remains valid for transition into downstream flow.

## FAIL examples
- login loops;
- admin works but named persona cannot reach required module;
- blank/incorrect sidebar caused by unresolved context;
- session drops on first business navigation;
- forbidden capability is visible/executable without server denial;
- raw permission/runtime exception is displayed.

## Evidence checkpoints
Login page, authenticated workspace, permitted route, permission-negative result, network/browser error summary.
