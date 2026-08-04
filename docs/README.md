# Forge Documentation Index

Ngày cập nhật: **2026-08-05**.

Tài liệu trong repo được chia theo **authority**, không theo số lượng file. Exact GitHub state, code, migration và test luôn thắng prose stale.

## 1. Live authority — đọc trước

1. `README.md` — entrypoint dự án.
2. `CURRENT_STATUS.md` — trạng thái đã xác minh gần nhất.
3. `NEXT_TASKS.md` — hàng đợi active, hiện là Alumdoor Controlled Pilot.
4. `PROJECT_CONTEXT.md` — architecture/source-of-truth hiện hành.
5. `docs/pilot/alumdoor/README.md` — active pilot authority/read order.
6. `docs/BRAND_AND_NAMING.md` — product/technical naming authority.
7. `AI_HANDOFF.md` — handoff ngắn cho phiên tiếp theo.
8. `docs/ops/SRE_RUNBOOK.md` — release/recovery/data-safety operator intent.
9. `skills/forge-enterprise-completion/SKILL.md` — execution policy cho agent.

Không dùng board/handoff/status snapshot của program/component cũ để suy live state.

## 2. Product / strategic authority

- `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — strategic completion target.
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — canonical capability denominator/checklist.
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` — materialized maturity truth.
- `docs/ROADMAP.md` — strategic sequencing, không phải live task queue.
- `docs/BRAND_AND_NAMING.md` — một product brand Forge; technical identifiers được phân loại riêng.
- `docs/FORGE_REPOSITORY_NORTH_STAR_AUDIT_20260805.md` — repo-wide docs/brand/hygiene rebaseline record.

## 3. Active program — Alumdoor Controlled Pilot

R6 Production Certification đã hoàn tất với `PILOT-GO` cho exact deployed candidate:

`49315112a21182d2ce077b08a1fb9e26db07fd36`

Pilot-00 is **DONE / PILOT-00-LOCKED**.

Pilot-01 real source acquisition is also complete at the evidence-ingest level: the supplied Alumdoor source set has been observed, SHA-256-bound and structurally ingested without committing raw customer workbooks to Git.

Current truthful Pilot-01 verdict is:

**`PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`**

The blocker is now reconciliation/normalization, not source acquisition. Key unresolved evidence includes common cutoff alignment, party/item aliases, actual-Kg stock evidence, opening AR/AP, integer-VND normalization and incomplete work-center/BOM/employee/pilot-user data.

Current pilot authority:

1. `docs/pilot/alumdoor/README.md`
2. `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`
3. `docs/pilot/alumdoor/PILOT_00_LOCK.json`
4. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`
5. `docs/pilot/alumdoor/PILOT_01_STATUS.json`
6. `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`
7. `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`
8. `docs/pilot/alumdoor/PILOT_01_READINESS.md`
9. `docs/pilot/alumdoor/PILOT_01_BATCH_MANIFEST_TEMPLATE.json`
10. `NEXT_TASKS.md`

Pilot-01 source ingestion/preview evidence does not authorize production import/write. Raw customer/master/opening source files remain outside Git.

Final R6 entry authority remains:

1. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`
2. `deploy-evidence/r6-final-production-certification-49315112a211.json`
3. `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`
4. `docs/agents/r6/R6_PRODUCTION_CERTIFICATION_PLAN.md`
5. `docs/agents/r6/EVIDENCE_MATRIX.md`

## 4. Architecture / product contracts

- `docs/ARCHITECTURE.md`
- `docs/API_SURFACE.md`
- `docs/APP_FACTORY.md`
- `docs/VERSIONING.md`
- `docs/VALIDATION_GATES.md`
- `docs/ALUMDOOR-REFERENCE-VERTICAL-CONTRACT.md`
- `docs/ops/` — SRE/release/production governance.
- Domain BRD/source-lock/spec được giữ khi còn là contract hoặc evidence.

## 5. Canonical historical evidence

History được giữ khi cần chứng minh vì sao current state tồn tại. Các checkpoint chính:

- `docs/agents/rc4/RC4_POST_INTEGRATION_FINAL.md` — RC4 integrated closure.
- PR `#638` / merge commit `7940331c...` — R5 integrated convergence and productization closure.
- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md` + final machine evidence — R6 production certification `PILOT-GO`.
- `docs/agents/rc/RC3_CONVERGENCE_20260804.md` — RC3 convergence history.
- `docs/agents/cloudflare-cfmax/CFMAX_R2_CONVERGENCE_20260804.md` và `CFMAX_R2_POST_MERGE_20260804.md` — Cloudflare source convergence.
- `docs/agents/transaction-closure/07-CONVERGENCE.md` — cross-domain transaction closure.
- `server/docs/spec/**` — legacy source-exact/parity/oracle corpus; entrypoint `server/docs/spec/README.md` explains why old names remain there.

Worker evidence cụ thể có thể được giữ nếu chứa test/provenance/decision chưa được final record thay thế hoàn toàn.

## 6. Brand rule

Product brand cấp platform là **Forge**.

- `MetaForge` / `CloudForge` không còn được dùng như umbrella product brands trong live prose.
- `@metaforge/*`, `metaforge.api.*`, `cloudforge-*` được giữ khi là technical identifier thật.
- `Kairo` chỉ giữ khi là exact environment/domain identifier, historical evidence hoặc một product surface có contract riêng; không dùng làm brand mới mặc định.
- Alumdoor giữ identity vertical riêng.
- Frappe/ERPNext là compatibility/benchmark/reference, không phải tagline của Forge.

Chi tiết: `BRAND_AND_NAMING.md`.

## 7. Files không nên sống lâu trên `main`

Sau khi một program đã converge/merge, mặc định xóa khỏi `main` các tài liệu chỉ phục vụ điều phối tạm thời:

- global/program `AGENT_BOARD.md` đã đóng;
- copy-paste `AGENT_PROMPTS.md` của wave đã xong;
- `OPEN_ORDER.md` của program đã đóng;
- `NO_STOP_RULE.md` riêng khi Skill/Protocol đã bao phủ;
- `*-HANDOFF.md` chỉ chứa branch/PR/snapshot đã superseded;
- topology/bootstrap verification chỉ dùng để khởi tạo program;
- legacy PR inbox đã được disposition xong;
- point-in-time deploy/status/local consolidation notes đã có durable evidence thay thế;
- one-off debug/lab scripts có credential hoặc không còn regression value.

Git history và PR history là nơi tra provenance của các file đã xóa; không cần giữ bản stale trên `main`.

## 8. Retention rule

Giữ file nếu nó còn ít nhất một trong các vai trò sau:

- current authority;
- architecture/business contract;
- legal/source-lock evidence;
- migration/release/recovery evidence;
- final convergence/audit record;
- user-facing operating documentation;
- source-exact/oracle/regression artifact còn được tooling sử dụng.

Nếu file chỉ mô tả một branch/agent/component version/deploy snapshot đã đóng và final evidence đã thay thế, ưu tiên xóa thay vì gắn thêm nhãn `SUPERSEDED` rồi để tồn tại vô hạn.

## 9. Hygiene checkpoint — 2026-08-05

Repository hygiene/rebaseline branch removes superseded coordination/status/debug artifacts and refreshes current entrypoints against the North Star.

Historical names may still appear in:

- technical package/import/API identifiers;
- exact Cloudflare resource/domain names;
- source-exact/parity/oracle corpus;
- historical final evidence;
- commit/PR history.

Those occurrences do not create a second current product brand or live authority.
