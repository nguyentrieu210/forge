# Forge Documentation Index

Ngày cập nhật: **2026-08-05**.

Tài liệu trong repo được chia theo **authority**, không theo số lượng file. Exact GitHub state, code, migration và test luôn thắng prose stale.

## 1. Live authority — đọc trước

1. `README.md` — entrypoint dự án.
2. `CURRENT_STATUS.md` — trạng thái đã xác minh gần nhất.
3. `NEXT_TASKS.md` — hàng đợi active, hiện là Alumdoor Controlled Pilot.
4. `PROJECT_CONTEXT.md` — kiến trúc và source-of-truth hiện hành.
5. `AI_HANDOFF.md` — handoff ngắn cho phiên tiếp theo.
6. `docs/ops/SRE_RUNBOOK.md` — release/recovery/data-safety operator intent.
7. `skills/forge-enterprise-completion/SKILL.md` — execution policy cho agent.

Không dùng board/handoff của program cũ để suy live state.

## 2. Active program — Alumdoor Controlled Pilot

R6 Production Certification đã hoàn tất với `PILOT-GO` cho exact deployed candidate:

`49315112a21182d2ce077b08a1fb9e26db07fd36`

Final R6 authority:

1. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`
2. `deploy-evidence/r6-final-production-certification-49315112a211.json`
3. `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`
4. `docs/agents/r6/R6_PRODUCTION_CERTIFICATION_PLAN.md`
5. `docs/agents/r6/EVIDENCE_MATRIX.md`

R6 coordination artifacts `OPEN_ORDER.md` và `AGENT_PROMPTS.md` đã hết vai trò sau convergence và được xóa khỏi `main`; Git history giữ provenance.

Active execution queue cho Controlled Pilot nằm trong `NEXT_TASKS.md`.

## 3. Strategic authority

- `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — đích sản phẩm dài hạn.
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — mẫu số capability.
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` — maturity materialized gần nhất.
- `docs/ROADMAP.md` — hướng dài hạn, không phải live status.

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

Các worker evidence cụ thể có thể được giữ nếu chứa test/provenance/decision chưa được final record thay thế hoàn toàn.

## 6. Files không nên sống lâu trên `main`

Sau khi một program đã converge/merge, mặc định xóa khỏi `main` các tài liệu chỉ phục vụ điều phối tạm thời:

- global/program `AGENT_BOARD.md` đã đóng;
- copy-paste `AGENT_PROMPTS.md` của wave đã xong;
- `OPEN_ORDER.md` của program đã đóng;
- `NO_STOP_RULE.md` riêng khi Skill/Protocol đã bao phủ;
- `*-HANDOFF.md` chỉ chứa branch/PR/snapshot đã superseded;
- topology/bootstrap verification chỉ dùng để khởi tạo program;
- legacy PR inbox đã được disposition xong.

Git history và PR history là nơi tra provenance của các file đã xóa; không cần giữ bản stale trên `main`.

## 7. Retention rule

Giữ file nếu nó còn ít nhất một trong các vai trò sau:

- current authority;
- architecture/business contract;
- legal/source-lock evidence;
- migration/release/recovery evidence;
- final convergence/audit record;
- user-facing operating documentation.

Nếu file chỉ mô tả một branch/agent/wave đã đóng và final evidence đã thay thế, ưu tiên xóa thay vì gắn thêm nhãn `SUPERSEDED` rồi để tồn tại vô hạn.