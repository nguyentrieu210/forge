# FORGE ROADMAP

> **NOT LIVE STATUS.** Tài liệu này chỉ giữ hướng chiến lược. Không dùng để suy ra branch hiện tại, CI, production state hoặc task đang làm.
>
> Live state: `../CURRENT_STATUS.md`  
> Active queue: `../NEXT_TASKS.md`  
> Operating rules: `../RUNBOOK.md`

Ngày làm sạch: **2026-08-02**.

## Nền tảng đã hình thành

Forge là monorepo gồm CloudForge backend và MetaForge frontend, hướng tới nền ERP tương thích hành vi Frappe trên Cloudflare với metadata/app factory và nghiệp vụ ERP riêng.

Các capability nền đã có source/test/evidence qua nhiều đợt phát triển:

- Frappe-shaped API, cookie session + CSRF, document lifecycle và permission enforcement.
- Custom Field / Property Setter và effective metadata.
- App package/install/migrate contract và first-party metadata compiler.
- MetaForge Desk, builder, canonical Form renderer và view-policy boundary.
- Sales-to-Production, Purchase/Tiến Đạt FIFO, stock ledger, physical stock, catch-weight, stock RBAC và reservation availability.
- Cloudflare deployment/release workflows và production evidence ở các checkpoint trước.

Danh sách này không có nghĩa mọi capability đã được deploy production ở cùng một SHA.

## Hướng phát triển nghiệp vụ

### P0 — Stock acceptance

Hoàn tất acceptance tồn kho bằng dữ liệu/auth thật ở local/ephemeral QA:

- QR + batch/bundle/voucher lineage end-to-end;
- cleanup QA không residue;
- desktop/mobile + permission/session/CSRF failure paths.

Reservation/available-stock acceptance đã merge trong PR `#175`; không mở lại cùng slice nếu không có regression cụ thể.

### P1 — Daily detailed ledger

- snapshot theo ngày và dimension nghiệp vụ;
- freeze sau khóa;
- adjustment append-only với reason/actor/timestamp;
- reconciliation Sales/Purchase/Inventory/Manufacturing/Finance;
- tenant + permission boundary.

### P2 — Warranty / defects / capacity

- bảo hành và defect ownership/cost;
- supplier provisional AP hold/offset có phê duyệt;
- capacity theo department/workstation calendar;
- overtime/overload policy và evidence.

### P3 — End-to-end acceptance

Khóa hành trình xuyên miền:

`Sales Order -> Production -> Material/Stock -> Delivery -> Invoice/Debt -> Daily Ledger -> Adjustment -> Warranty`

Acceptance phải dùng role nghiệp vụ và authoritative persistence; không thay bằng mock-only evidence.

## Hướng phát triển nền tảng

Các việc nền tảng chỉ mở khi có nhu cầu nghiệp vụ hoặc lỗi được chứng minh, thay vì tạo một hàng đợi song song không có owner:

- Frappe/API compatibility gaps còn thực sự được client/app dùng;
- metadata compiler/runtime safety;
- app packaging/installer evolution;
- performance/multi-tenant hardening;
- release/rollback/backup evidence;
- MetaForge usability/accessibility trên desktop/mobile.

## Production boundary

Roadmap không cấp quyền deploy. Production deploy, production migration, production secret/DNS và customer-data mutation chỉ thực hiện khi user yêu cầu rõ theo `RUNBOOK.md` và `DELIVERY_POLICY.md`.

## Hồ sơ lịch sử

Chi tiết implementation cũ phải tra bằng Git history, merged PR và docs chuyên đề tương ứng. Không giữ snapshot branch/CI/deploy cũ trong roadmap vì chúng nhanh chóng trở thành thông tin sai cho agent kế tiếp.
