# E2E Operator Acceptance Standard

Date: 2026-08-06  
Program: PILOT-UX-E2E

## 1. Principle

Forge UI is accepted by **business task completion**, not by screen existence.

A test must use the same browser surface, controls and navigation available to the intended operator. Direct API setup is allowed only for isolated fixture/bootstrap preparation explicitly recorded by the test; it may not replace the business action under test.

## 2. Mandatory PASS chain

For every happy-path business flow, all applicable stages below are mandatory:

1. Authenticate through supported UI/session path.
2. Enter the intended workspace/module through supported navigation.
3. Resolve company/user/business context.
4. Pass declared test-data/configuration preflight.
5. Populate actual UI controls.
6. Observe required calculations, derived fields, availability or preview.
7. Save/create the authoritative business document when applicable.
8. Execute submit/confirm/business action when applicable.
9. Verify authoritative mutation succeeded exactly once.
10. Reopen/read back the created/changed business record.
11. Verify downstream state/ledger/reservation/status where applicable.
12. Verify report/history/query surface exposes the expected result where applicable.
13. Exercise the required correction/retry/negative path where the flow contract requires it.
14. Finish with no unexplained browser, network or red-UI error.

If a mandatory stage is skipped or cannot be proven, the result cannot be `PASS`.

## 3. Browser requirement

Minimum execution evidence:

- Playwright Chromium against the exact candidate/environment;
- normal browser navigation, not only request-context API calls;
- actual labels/roles/test IDs for controls;
- page-error capture;
- console error capture;
- request/response failure capture;
- screenshot on key checkpoints and failure;
- Playwright trace on failure and preferably retain-on-failure video where practical.

Desktop is mandatory for all office/operator flows. Mobile/device profile is mandatory only where the declared actor/workflow requires mobile operation.

## 4. Persona requirement

Every flow declares a business persona and required permission profile. Tests must not default all operational flows to System Manager/admin because that hides permission, navigation and context failures.

Admin/System Manager may be used for fixture setup only when the setup is outside the business action under test and is recorded as such.

## 5. Readiness requirement

Before clicking into the core transaction, the harness runs declared preflight checks from `E2E_TEST_DATA_CONTRACT.md`.

A missing fixture/configuration becomes `BLOCKED` with an exact prerequisite, not an application `FAIL`, only when:

- the missing prerequisite is explicitly part of the test-data contract;
- it is genuinely external to the code under test;
- the UI is not expected to create/resolve that prerequisite as part of the tested job.

If the application should handle or guide the missing prerequisite but instead crashes or emits an unexplained red error, the result is `FAIL`, not `BLOCKED`.

## 6. PASS conditions

A flow is `PASS` only when all applicable conditions hold:

- end condition reached;
- authoritative readback matches intended input/business calculation;
- no unexpected duplicate mutation;
- no unexplained HTTP 4xx/5xx;
- no uncaught page error;
- no unexpected `console.error`;
- no unexpected red banner/error toast;
- no infinite loading or dead control;
- no hidden requirement requiring developer intervention;
- expected permission boundaries hold;
- supported retry/correction preserves authority where required;
- evidence manifest is bound to exact source/deployed/package identity.

## 7. FAIL conditions

Examples that force `FAIL`:

- route opens but a required control is missing or unusable;
- save/submit/action returns an unexpected business/runtime/server error;
- UI shows a generic red error without actionable recovery;
- a numeric/date/currency value silently changes meaning;
- successful UI message occurs but authoritative readback is missing/wrong;
- duplicate click/retry creates duplicate authority;
- permission is accidentally bypassed or a legitimate persona is denied;
- a required downstream report/history does not reflect the transaction;
- browser runtime exception occurs in the tested path;
- a hidden config dependency is discovered only after the operator starts the transaction and the product provides no readiness guidance.

## 8. Expected negative paths

A deliberate business rejection may be `PASS`, for example insufficient stock or unauthorized action, only if the test declares the rejection in advance and verifies:

1. the action is denied for the correct reason;
2. the UI explains the reason in operator language;
3. no forbidden authoritative mutation occurs;
4. the operator has a clear next action when a recovery path exists.

An expected 4xx/409/422 therefore must be registered as expected by the flow; otherwise it is treated as unexpected.

## 9. Core usability metrics

Primary KPI: **First-Pass Task Completion Rate**.

`completed core flows / executed core flows`

Secondary metrics:

- unexpected red-error count per flow;
- unexpected HTTP failure count;
- browser runtime exception count;
- number of developer interventions required;
- correction/retry success rate;
- persona/permission success rate;
- median/p95 task duration when stable enough to measure without inventing an SLA.

## 10. UX scorecard

For reporting only:

| Dimension | Weight |
|---|---:|
| End-to-end completion | 40% |
| No unexpected red errors | 20% |
| Authoritative correctness | 15% |
| Recovery/correction | 10% |
| Operator clarity | 5% |
| Permission/persona correctness | 5% |
| Performance/responsiveness | 5% |

Verdict bands:

- `<50`: NOT_USABLE
- `50-69`: prototype-usable only
- `70-84`: PILOT_USABLE
- `85-94`: OPERATIONAL
- `>=95`: PRODUCTION_GRADE_UX_CANDIDATE

Hard override: open P0 or core task completion `<80%` => `NOT_USABLE`.

## 11. Severity

- `P0`: core operator cannot start/finish the job, data/authority corruption risk, or widespread crash.
- `P1`: primary flow materially incorrect or blocked; authoritative state may be wrong; no reasonable operator workaround.
- `P2`: completion possible with a documented workaround, but usability/recovery is materially poor.
- `P3`: cosmetic/polish issue with no material task-completion impact.

## 12. No false PASS rule

The following are never sufficient by themselves:

- build green;
- unit/integration test green;
- API response 200;
- metadata validates;
- route renders;
- screenshot looks correct;
- admin can complete the flow;
- source code appears logically correct;
- historical evidence for an older SHA/package.
