# CURRENT STATUS

Ngày cập nhật: **2026-08-03**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release. Không suy trạng thái từ tài liệu lịch sử nếu GitHub đã thay đổi.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default/canonical branch: `main`.
- Forge baseline: **0.2.0 — Enterprise Parallel Baseline**.
- RC Hardening Wave 0 đã hội tụ vào `main`.
- Các branch/PR cũ ngoài chương trình hiện tại chỉ là history/evidence/cherry-pick reference; không tự reopen hoặc tiếp tục như canonical delivery.
- Mọi task mới phải đọc exact current `main`, capability status và RC Hardening Plan trước khi tạo branch mới.

## Enterprise maturity baseline

Canonical registry: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.

RC-01 đã kiểm đủ **956/956 capability ID** và validator xác nhận không thiếu/trùng/unknown ID.

| Maturity | Count | Share |
|---|---:|---:|
| Hardened | 0 | 0.00% |
| RC | 4 | 0.42% |
| Wired | 448 | 46.86% |
| Foundation | 345 | 36.09% |
| Missing | 159 | 16.63% |
| **Total** | **956** | **100.00%** |

Forge overall vẫn được coi là **Wired**, đang chuyển sang RC hardening. Không suy RC/Hardened từ code existence, merge state hoặc test count đơn lẻ.

## DONE — RC Hardening Wave 0

### RC-01 Capability Truth

- PR `#434` merged.
- Có live maturity register 956/956, Evidence Index, completeness validator và baseline/top-blocker report.
- Không claim Hardened vì chưa đủ production/failure/reconciliation evidence.

### RC-02 Release / SRE

- PR `#431` merged.
- Canonical release topology đã được audit/harden.
- Duplicate `.github/workflows/deploy-ui-once.yml` và stale one-off `.github/workflows/tmp-alumdoor-purchase-funding-release.yml` đã được loại khỏi main qua RC-02, thay vì dựa vào cleanup PR #427 cũ.
- Production maintenance workflows liên quan được chuyển về manual/exact-main guarded path.
- Backup/restore scope contract và release-safety verification đã được harden.
- Không claim current-main production deploy chỉ vì workflow/source đã merge.

### RC-03 Validation Gates

- PR `#433` merged.
- `FAST / STANDARD / CRITICAL` đã có machine-readable matrix và executable runner.
- Finance/stock/payroll bị khóa ở CRITICAL và yêu cầu correction/reversal + reconciliation.
- UI maturity promotion yêu cầu browser/mobile evidence khi applicable.
- `HARDENED/DEPLOYED` yêu cầu exact production release marker.

### RC-04 Kernel / Auth

- Original PR `#430` bị supersede sau current-main reconciliation; replacement PR `#435` merged.
- Logout của valid session fail-closed với CSRF/session-registry/revoke failure.
- Current browser session chỉ revoke qua canonical logout path, tránh commit-before-response ambiguity qua duplicate revoke surface.
- Kernel canonical create/save/submit/cancel vẫn dùng OCC/idempotency/audit/outbox/receipt authority; delete/rename maintenance semantics vẫn là explicit shared-contract gap.

### RC-05 IAM / Tenant / Offline Contract

- Original PR `#432` đã đóng superseded; replacement PR `#436` merged.
- App upgrade fail-closed nếu package bỏ materialized DocType/Workflow/Print Format/Fixture/Custom Field mà chưa có reverse migration/uninstall contract.
- `docs/FORGE_OFFLINE_SYNC_CONTRACT.md` đã freeze trusted tenant/user partition, access revision, bounded offline lease, stable command id/OCC/conflict/release freshness contract.
- `U01-003..007` offline read/write/background-sync/conflict vẫn **Missing**; contract freeze không được tính là implementation.

## DONE — WS00–WS17 convergence

- Phase WS00–WS17 đã đóng ở repository level; canonical deltas đã merge vào `main`.
- Historical convergence record: `docs/agents/WS00_17_CONVERGENCE_20260803.md`.
- Shared HRM vẫn là application đầy đủ; Alumdoor chỉ chọn surface phù hợp ở product/shell layer, không fork core.
- Matrix metadata/runtime/pricing foundation đã hội tụ; follow-up PR cũ không tự trở thành active backlog.

## Active program

Canonical execution blueprint:

- `docs/FORGE_RC_HARDENING_PLAN_20260803.md`
- `docs/agents/RC_AGENT_LANES_20260803.md`

Wave 0 đã đóng. Dependency order tiếp theo:

1. **Finance authority hardening** — `RC-020..023`.
2. **Inventory authority hardening** — `RC-024..025`.
3. Sau khi Finance/Inventory authority freeze: Procurement, CRM/O2C, HCM/Payroll, Manufacturing/QMS `RC-030..038` chạy theo domain song song.
4. Enterprise Depth `RC-040..045`.
5. App Factory/AI moat `RC-046..047`.
6. Alumdoor reference proof `RC-050..054`.

Không mở thêm feature breadth ngẫu nhiên trước các authority/evidence blocker có priority cao hơn.

## Release / production truth

- Canonical release workflow: `.github/workflows/alu-build-deploy.yml`.
- Merge state không phải deploy proof.
- `/health` chứng minh service availability; `/release.json`/release evidence phải khớp exact release SHA + bundle marker cho production claim.
- RC-01/02/03/04/05 merges trong Wave 0 **không được coi là production deployment**.
- Không production migration, restore/PITR, secret/DNS hoặc customer-data mutation được thực hiện trong coordinator convergence này.

## Alumdoor direction

- Alumdoor tiếp tục là reference vertical, không fork Forge core.
- Mobile ưu tiên sales/receivables/delivery.
- Shared HRM vẫn full; Alumdoor shell chỉ expose Employee + Attendance theo product decision hiện hành.
- Warehouse Cash là primitive backend thuộc VN Accounting; mobile không cần coi nó là product center.
- Production/version claim phải đọc release evidence hiện hành, không hardcode snapshot cũ.

## Guardrails

- Không sửa production secrets/DNS hoặc mutate customer data khi chưa có yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
- UI-only theo fast path hiện hành; backend/schema/migration/security/accounting/stock/payroll/ops phải dùng risk gate và approval boundary phù hợp.
