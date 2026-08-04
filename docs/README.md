# Forge Documentation Index

Ngày cập nhật: **2026-08-05**.

Tài liệu trong repo được chia theo **authority**, không theo số lượng file. Exact GitHub state, code, migration và test luôn thắng prose stale.

Forge hiện được vận hành theo mô hình **phase-aware**: North Star giữ vai trò đích chiến lược dài hạn, còn việc phải làm ngay được quyết định bởi live phase, current gate và exact release/data evidence. Không dùng backlog/wave cũ để tự mở lại một program đã đóng.

## 1. Live authority — đọc trước

1. `README.md` — entrypoint dự án.
2. `CURRENT_STATUS.md` — trạng thái đã xác minh gần nhất.
3. `NEXT_TASKS.md` — hàng đợi active và current gate.
4. `docs/pilot/alumdoor/README.md` — active pilot authority/read order khi Alumdoor Controlled Pilot còn là phase hiện hành.
5. `PROJECT_CONTEXT.md` — kiến trúc và source-of-truth hiện hành.
6. `AI_HANDOFF.md` — handoff ngắn cho phiên tiếp theo.
7. `docs/ops/SRE_RUNBOOK.md` — release/recovery/data-safety operator intent.
8. `skills/forge-enterprise-completion/SKILL.md` — **phase-aware operating doctrine** cho agent: resolve live phase trước, bảo vệ authoritative contracts/certified identity, phân biệt engineering risk với release impact, và ưu tiên current gate trước enterprise backlog.

Không dùng board/handoff của program cũ để suy live state. North Star và capability map không phải live queue.

## 2. Active program — Alumdoor Controlled Pilot

R6 Production Certification đã hoàn tất với `PILOT-GO` cho exact deployed candidate:

`49315112a21182d2ce077b08a1fb9e26db07fd36`

Pilot-00 is **DONE / PILOT-00-LOCKED**.

Pilot-01 control plane is **READY / PREVIEW-ONLY**. Real Alumdoor source files have already been **OBSERVED / HASHED / INGESTED** as immutable evidence without committing raw customer workbooks to Git.

Current truthful Pilot-01 verdict is:

`PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`

Active work is **source reconciliation + normalization** toward one private Mapping-V1 batch that can reach a real `PREVIEW_PASS` with zero unexplained variance. The main blockers are common-cutoff consistency, customer/supplier/item identity reconciliation, opening Stock quantity/value evidence, opening AR/AP/cash-bank completeness, stock-scope/date disposition, deterministic VND rounding and remaining operating/access masters.

Current pilot authority:

1. `docs/pilot/alumdoor/README.md`
2. `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`
3. `docs/pilot/alumdoor/PILOT_00_LOCK.json`
4. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`
5. `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`
6. `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`
7. `docs/pilot/alumdoor/PILOT_01_READINESS.md`
8. `docs/pilot/alumdoor/PILOT_01_STATUS.json`
9. `docs/pilot/alumdoor/PILOT_01_BATCH_MANIFEST_TEMPLATE.json`
10. `docs/pilot/alumdoor/tools/validate-pilot-batch.mjs`
11. `NEXT_TASKS.md`

Pilot-01 source validation remains preview-only. A `PREVIEW_PASS` is not production-write authorization. Real customer/master/opening source files stay outside Git, and real production import/write remains a separate authorization boundary.

Final R6 entry authority remains:

1. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`
2. `deploy-evidence/r6-final-production-certification-49315112a211.json`
3. `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`
4. `docs/agents/r6/R6_PRODUCTION_CERTIFICATION_PLAN.md`
5. `docs/agents/r6/EVIDENCE_MATRIX.md`

R6 is historical certification truth for the frozen pilot baseline. A later product-source change creates a new candidate and requires only the **affected** release evidence to be rerun/relocked according to the evidence matrix; it does not retroactively turn the certified R6 candidate into a failure.

## 3. Strategic authority

- `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — đích sản phẩm dài hạn; strategic compass, **không phải live execution queue**.
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — mẫu số capability/portfolio coverage.
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` — maturity materialized gần nhất.
- `docs/ROADMAP.md` — hướng dài hạn, không phải live status.

North Star tiếp tục định hướng kiến trúc, reusable primitives, enterprise completeness và backlog sau gate; current phase/current gate quyết định thứ tự thực thi trước mắt.

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

Worker evidence cụ thể có thể được giữ nếu chứa test/provenance/decision chưa được final record thay thế hoàn toàn.

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
