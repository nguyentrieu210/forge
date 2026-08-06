# E2E Error Policy

Date: 2026-08-06  
Program: PILOT-UX-E2E

## 1. Objective

A green test must not hide a red operator experience. The harness therefore treats browser, network and visible UI failures as first-class evidence.

## 2. Error channels to capture

Every flow captures at minimum:

- `pageerror` / uncaught browser exceptions;
- unhandled promise rejections exposed to the page;
- `console.error` and material console warnings when they indicate failed behavior;
- HTTP 4xx and 5xx responses;
- failed requests/timeouts;
- error response payload summary where safe and non-sensitive;
- visible error banners;
- destructive/error toasts;
- React/runtime error boundaries;
- loading states that exceed the test's bounded wait contract;
- controls that remain disabled without declared reason;
- failed navigation or route fallback;
- client-side data parse/format failures.

## 3. Unexpected vs expected failures

All observed failures are `UNEXPECTED` unless a flow explicitly registers an expected negative condition before the action.

An expected negative condition must declare:

- action being attempted;
- expected status/business code if applicable;
- expected operator-facing message or semantic meaning;
- authoritative mutation expected: normally none;
- supported next action/recovery when applicable.

Example: insufficient stock can be a successful negative test if the UI explains insufficient stock, the authoritative write does not occur and the operator can revise the request.

## 4. HTTP policy

Unexpected response classes:

- `400` malformed request from valid UI flow => FAIL;
- `401` session unexpectedly lost => FAIL;
- `403` legitimate persona unexpectedly denied => FAIL; expected permission-denial test may PASS;
- `404` expected business endpoint/resource missing => FAIL;
- `409` unexpected conflict => FAIL; declared OCC/idempotency conflict can be expected;
- `417/422` unexpected validation/business rejection => FAIL;
- `500+` => FAIL unless the test is explicitly exercising a fault boundary and validates safe recovery.

No broad allowlist such as "ignore all 4xx" is permitted.

## 5. Visible red-error policy

A visible red/error surface is classified by semantics, not CSS color alone.

`unexpectedRedErrorCount` increments when the application presents an error state that:

- interrupts the operator flow unexpectedly;
- exposes raw exception/internal implementation text;
- provides no actionable business explanation for a recoverable condition;
- contradicts a success state;
- occurs because the product failed to resolve a declared automatic context/dependency.

Expected business rejection UI is recorded separately and does not count as unexpected when the negative-path contract passes.

## 6. Failure classes

Use exactly one primary failure class, plus optional secondary tags:

- `UI`
- `RUNTIME`
- `BACKEND`
- `PERMISSION`
- `CONFIG`
- `TEST_DATA`
- `BUSINESS_RULE`
- `RELEASE_DRIFT`
- `ENVIRONMENT`
- `UNKNOWN`

Classification guidance:

- broken/missing/dead control => UI;
- JS exception/render crash => RUNTIME;
- server 5xx or incorrect authoritative service behavior => BACKEND;
- role/access mismatch => PERMISSION;
- present but invalid business configuration => CONFIG;
- missing declared fixture/source prerequisite => TEST_DATA;
- deterministic rule rejects or computes incorrectly => BUSINESS_RULE;
- source/package/deployed identity mismatch => RELEASE_DRIFT;
- target outage/DNS/non-product environmental failure => ENVIRONMENT.

Do not classify every red message as UI merely because the operator sees it in the browser.

## 7. Severity

- `P0`: core job cannot start/finish, broad crash, unsafe/incorrect authoritative mutation, or corruption/security-equivalent usability blocker.
- `P1`: primary transaction fails or produces materially incorrect state; no acceptable operator workaround.
- `P2`: task can complete with a documented workaround, but normal operator experience is materially impaired.
- `P3`: cosmetic/polish issue without material completion or correctness impact.

Any open P0 in a core flow blocks `OPERATOR-READY`.

## 8. Failure evidence

On unexpected failure retain:

- exact failed step;
- URL/route;
- screenshot;
- Playwright trace;
- console/page-error summary;
- unexpected network failures;
- visible operator message;
- last successfully created document identifier if non-sensitive;
- source/deployed/package identity;
- readiness state;
- primary failure class and severity.

## 9. Raw error hygiene

Tests may inspect raw error payloads for diagnosis, but operator acceptance fails when normal UI exposes stack traces, internal SQL, secrets, tokens or implementation-only exceptions.

Evidence artifacts must redact secrets and avoid storing full sensitive business payloads when a bounded diagnostic summary is sufficient.

## 10. Closure rule

An issue is not closed by hiding/suppressing the red error. Closure requires the operator task to proceed correctly, or the expected rejection to be rendered as a clear business state with authoritative safety preserved.
