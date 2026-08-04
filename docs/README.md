# Forge Documentation Index

Ngày cập nhật: **2026-08-04**.

Tài liệu trong repo được chia theo **authority**, không theo số lượng file. Exact GitHub state, code, migration và test luôn thắng prose stale.

## 1. Live authority — đọc trước

1. `README.md` — entrypoint dự án.
2. `CURRENT_STATUS.md` — trạng thái đã xác minh gần nhất.
3. `NEXT_TASKS.md` — hàng đợi active, không lưu lịch sử dài.
4. `PROJECT_CONTEXT.md` — kiến trúc và source-of-truth hiện hành.
5. `AI_HANDOFF.md` — handoff ngắn cho phiên tiếp theo.
6. `docs/ops/SRE_RUNBOOK.md` — release/recovery/data-safety operator intent.
7. `skills/forge-enterprise-completion/SKILL.md` — execution policy cho agent.

Không dùng board/handoff của program cũ để suy live state.

## 2. Active program — R6 Production Certification

R5 đã hoàn tất và merge qua PR `#638`, merge commit `7940331c589d4e5699cf00e2ec843c5a7b8c50ac`.

R6 là program hiện hành. Đọc:

1. `docs/agents/r6/README.md`
2. `docs/agents/r6/R6_PRODUCTION_CERTIFICATION_PLAN.md`
3. `docs/agents/r6/EVIDENCE_MATRIX.md`
4. `docs/agents/r6/OPEN_ORDER.md`
5. `docs/agents/r6/AGENT_PROMPTS.md`

`OPEN_ORDER.md` và `AGENT_PROMPTS.md` là coordination artifacts tạm thời trong lúc R6 active. Sau final convergence, ưu tiên xóa chúng và giữ final certification/evidence record.

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