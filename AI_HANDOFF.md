# AI HANDOFF

Ngày cập nhật: **2026-08-03**.

Tài liệu này lưu facts/checkpoints/invariants để AI tiếp theo không tự tiếp tục công việc lịch sử như thể nó vẫn active.

## Repository truth

- Repository: `nguyentrieu210/forge`.
- Canonical branch: `main`.
- GitHub là nguồn sự thật cho exact code, branch, PR, merge và release.
- **Open PR = 0** sau repo reset ngày 2026-08-03.
- Không có workstream/feature branch nào được coi là active delivery queue.
- Branch cũ vẫn được giữ làm history/audit/reference; không reopen hoặc tiếp tục mặc định.
- Việc mới phải bắt đầu từ exact current `main` trên branch/PR mới.

## Closed-phase facts

- WS00–WS17 canonical convergence đã đóng ở repository level; bản ghi: `docs/agents/WS00_17_CONVERGENCE_20260803.md`.
- UI00–UI05 Matrix foundation đã được hội tụ vào main trước repo reset.
- Các Matrix follow-up PR `#419/#423/#424` đã đóng không merge; nếu có Matrix task mới phải audit current main trước.
- Các PR legacy/accounting/inventory/manufacturing/procurement/ledger còn mở trước reset cũng đã đóng không merge; không coi chúng là backlog.

## Product/architecture invariants

- Alumdoor là reference vertical trên Forge, không fork core.
- `gl_entries` là money source of truth; projections/balance/daily views phải rebuildable.
- Invoice settlement dùng canonical Payment Entry/payment allocation; party dimension không tự tạo AR/AP settlement authority mới.
- Stock/manufacturing features không được tạo stock/costing ledger cạnh tranh với canonical ledger.
- Generic Bulk View master-only không tự thay thế controller-backed flow cho transaction/submittable/ledger paths.
- Shared HRM là application đầy đủ; Alumdoor có thể chỉ expose Employee/Attendance ở product layer mà không thu nhỏ shared manifest.

## HRM truth

- Các handoff cũ ghi HRM 1.5 là historical checkpoint, không phải current version authority.
- Current `main` đã có HRM ở dòng `1.8.x`; phải đọc package/meta hiện tại trước mọi thay đổi HRM/payroll.
- Salary Slip/Payroll Entry/GL vẫn là accounting authority; HRM cung cấp payroll inputs.
- Statutory PIT/BHXH automation chỉ được làm như task mới với legal-source/version/test evidence tương ứng.

## Release/workflow truth

- Canonical current release workflow trên main: `.github/workflows/alu-build-deploy.yml`.
- `.github/workflows/deploy-ui-once.yml` và `.github/workflows/tmp-alumdoor-purchase-funding-release.yml` vẫn tồn tại trên `main` tại thời điểm handoff vì cleanup PR `#427` đã đóng không merge.
- Không dùng tài liệu cũ nhắc `.github/workflows/manual-release-alu.yml`; file đó không tồn tại trên current main.
- Production proof phải dựa trên exact release evidence (`/health`, `/release.json`, release SHA/bundle evidence khi applicable), không suy từ merge alone.

## Historical PR policy

Các PR đóng vẫn có thể chứa code/evidence hữu ích. Nếu task mới chạm cùng domain:

1. compare exact current main với branch/PR lịch sử;
2. chỉ lấy phần còn đúng contract;
3. chạy lại validation trên current baseline;
4. mở PR mới;
5. không biến PR cũ thành canonical bằng cách reopen mặc định.

## Canonical docs

- `CURRENT_STATUS.md`: trạng thái hiện tại.
- `NEXT_TASKS.md`: active backlog; hiện trống cho tới khi user mở việc mới.
- `docs/agents/AGENT_BOARD.md`: ownership map/historical board, không phải queue đang chạy.
- `docs/agents/LEGACY_PR_INBOX.md`: archive/reference cho PR lịch sử.
