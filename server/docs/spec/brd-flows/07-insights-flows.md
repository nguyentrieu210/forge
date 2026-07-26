# CloudInsights Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## I1 — Connect and sync source
- **Actor:** Data Source Admin
- **Precondition:** credentials/network
- **Happy path:**
  1. Create source
  2. Test/read-only validate
  3. Discover schema
  4. Profile/link tables
  5. Schedule refresh/extract
- **Nhánh lỗi:**
  - auth/network/dialect
  - schema drift
- **Transaction/Event:** Secrets isolated; sync jobs idempotent
- **Oracle:** tables/columns/types/links parity

## I2 — Visual/SQL query to result
- **Actor:** Analyst
- **Precondition:** source ACL
- **Happy path:**
  1. Build steps or SQL
  2. Compile dialect/ACL/budget
  3. Execute Worker/Hyperdrive/Container
  4. Cache/version result
  5. Expose lineage
- **Nhánh lỗi:**
  - invalid expression
  - scan budget
  - timeout/source error
- **Transaction/Event:** Query version immutable; cache ACL-keyed
- **Oracle:** result rows/types/hash parity

## I3 — Python/Ibis analytics
- **Actor:** Advanced Analyst
- **Precondition:** environment/source bindings
- **Happy path:**
  1. Start isolated runtime
  2. Load permitted data/extract
  3. Execute code
  4. Persist result/artifacts/logs
  5. Terminate scale-to-zero
- **Nhánh lỗi:**
  - package/runtime/resource/network violation
- **Transaction/Event:** Isolated container/sandbox
- **Oracle:** golden dataframe/artifact parity

## I4 — Dashboard publish/refresh/share
- **Actor:** Analyst
- **Precondition:** queries/charts valid
- **Happy path:**
  1. Compose dashboard
  2. Wire global filters
  3. Publish version
  4. Refresh dependency DAG
  5. Share/export/embed
- **Nhánh lỗi:**
  - broken dependency
  - ACL mismatch
  - stale source
- **Transaction/Event:** Versioned publish; jobs idempotent
- **Oracle:** filter/chart/dashboard/share parity
