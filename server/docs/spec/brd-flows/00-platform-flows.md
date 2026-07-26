# Platform Core Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## F0 — Provision tenant
- **Actor:** Platform Operator
- **Precondition:** plan/region/domain hợp lệ
- **Happy path:**
  1. Tạo registry record idempotent
  2. Tạo D1/R2/DO/Queue bindings
  3. Chạy migrations/seed/apps
  4. Gắn domain/secrets
  5. Health check và activate
- **Nhánh lỗi:**
  - resource create fail → retry step
  - domain conflict → rollback binding
  - seed fail → tenant không active
- **Transaction/Event:** Durable Workflow; compensation từng step
- **Oracle:** tenant health + bindings + seed hashes

## F1 — Document create/save/submit/cancel
- **Actor:** Business User
- **Precondition:** schema+permission+workflow loaded
- **Happy path:**
  1. Compile input against schema
  2. Resolve permission/defaults/naming
  3. Run lifecycle validations
  4. D1 batch parent+children+ledger+audit+outbox
  5. Return document version/session bookmark
- **Nhánh lỗi:**
  - validation → 422
  - permission → 403
  - version conflict → 409 typed
  - batch fail → rollback
- **Transaction/Event:** One D1 transaction; outbox atomic
- **Oracle:** document/children/ledger/version hashes

## F2 — Permission evaluation
- **Actor:** Any API caller
- **Precondition:** authenticated principal
- **Happy path:**
  1. Resolve roles/user permissions/share
  2. Compile row/field/action policy
  3. Inject predicates/projections
  4. Execute query/action
  5. Audit sensitive denial/access
- **Nhánh lỗi:**
  - policy compile fail → deny
  - query budget/index absent → reject
- **Transaction/Event:** No client trust
- **Oracle:** role matrix + direct API adversarial tests

## F3 — Async side effect
- **Actor:** Queue consumer
- **Precondition:** committed outbox event
- **Happy path:**
  1. Claim idempotency key
  2. Execute email/webhook/projection
  3. Mark success or retry
  4. DLQ after policy
- **Nhánh lỗi:**
  - provider timeout
  - poison event
  - duplicate delivery → no-op
- **Transaction/Event:** At-least-once safe
- **Oracle:** one side effect per idempotency key

## F4 — Upgrade source/app release
- **Actor:** Platform Owner
- **Precondition:** candidate release + source pins
- **Happy path:**
  1. Scan source diff
  2. Map/spec/port artifacts
  3. Run oracles/security/perf
  4. Canary tenants
  5. Progressive rollout/rollback
- **Nhánh lỗi:**
  - UNMAPPED → block
  - migration mismatch → rollback
  - SLO regression → pause
- **Transaction/Event:** Immutable release + migration workflow
- **Oracle:** zero unmapped + oracle evidence
