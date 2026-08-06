# E2E Operator-Ready Release Gate

Date: 2026-08-06  
Program: PILOT-UX-E2E

## 1. Purpose

This gate prevents a build from being described as usable merely because source/build/backend certification is green. It complements, and does not rewrite, existing R6/pilot/release evidence.

## 2. Gate layers

### Gate A — Build/runtime sanity

Minimum:

- client build/typecheck for affected scope;
- relevant unit/integration tests;
- exact candidate/release identity resolved;
- no unresolved release drift.

Gate A proves executable software, not operator usability.

### Gate B — Browser smoke

Minimum:

- login page loads;
- supported authentication succeeds for declared persona fixture;
- workspace/sidebar renders;
- each primary operational entry route loads;
- no uncaught page error;
- no unexplained console error;
- no unexpected route-level 4xx/5xx.

Gate B proves reachability, not transaction completion.

### Gate C — Core operator flows

Mandatory core transaction flows:

- E2E-01 Sales;
- E2E-02 Procurement;
- E2E-03 Inventory;
- E2E-04 Manufacturing;
- E2E-05 Finance/debt/cash.

Each must satisfy its browser acceptance spec, including authoritative readback.

### Gate D — Lifecycle safety

Minimum accepted coverage for affected domains:

- E2E-09 correction/cancel/return as applicable;
- duplicate/retry/idempotency behavior;
- expected business rejection;
- permission denial under a non-admin persona;
- partial lifecycle where the domain supports partial receipt/payment/fulfillment.

### Gate E — Control/read surfaces

Minimum:

- E2E-08 report/history readback for transactions created by core flows;
- Warranty/service and HR/payroll flows according to release scope;
- mobile/device execution for actors explicitly requiring mobile operation.

## 3. OPERATOR-READY requirements

A candidate may be labelled `OPERATOR-READY` only when:

1. zero open P0 in tested scope;
2. core flows are all executed on current identity;
3. core first-pass task completion is at least 95%;
4. no unexplained browser runtime exception remains;
5. no unexplained 5xx remains in accepted flows;
6. unexpected red-error count is zero in accepted happy paths;
7. authoritative readback passes;
8. correction/retry evidence passes where applicable;
9. role/persona evidence passes;
10. report/history readback passes;
11. all evidence is current for the exact candidate/environment.

A first implementation may use the stricter practical rule `all five Gate C core flows PASS`; the 95% threshold is intended for larger scenario matrices, not to allow one of five core jobs to fail.

## 4. Product verdict rules

- Open P0 => `NOT_USABLE`.
- Core task completion below 80% => `NOT_USABLE`.
- 80-94% core completion with no P0 may be reported as pilot work-in-progress but is not `OPERATOR-READY`.
- `OPERATOR-READY` is an evidence label for the tested candidate, not production/cutover authorization.

## 5. CI relationship

Recommended CI stages:

1. existing build/contract/integration checks;
2. operator browser smoke;
3. disposable/prod-like core operator flows;
4. evidence artifact publication;
5. operator gate assertion.

Pilot-target writes are not automatically run in pull-request CI. Read-only pilot observation may run under existing environment/secret governance; write flows require the applicable authorization boundary.

## 6. Failure reporting

On gate failure, summary must include:

- exact candidate identity;
- flow result matrix;
- first failed step per failed flow;
- P0/P1 list;
- primary failure-class distribution;
- artifact references;
- next executable slice.

Do not replace a failed operator gate with a general statement that CI is green.

## 7. Change invalidation

Only affected flows must rerun according to blast radius, but any shared shell/runtime/metadata contract/auth/session change should conservatively rerun all dependent core flows.

Historical PASS remains historical; a newer candidate requires current evidence before inheriting `OPERATOR-READY`.
