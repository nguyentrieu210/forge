# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## Purchase/FIFO — merge và production release đã hoàn tất

### Đã hoàn thành

- PR `#14` đã squash-merge thành `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Tenant release run `30631386714`: backup, migration, deploy và endpoint smoke **PASS**.
- Tenant Worker production version: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Gateway release PR `#57` đã merge thành `f50993ef7736a0321f6a0e8c308c5cb069497472`.
- Gateway run `30631951946`, job `91160176928`: build, stage, deploy, smoke và provider evidence **PASS**.
- Gateway production version: `6352386d-8385-4ea8-af31-15ac62e21943`.
- FIFO rollout vẫn **disabled**; không có activation, DNS hay production secret change.
- Workflow tenant release đã sửa để đọc version từ Wrangler NDJSON; workflow/trigger one-shot đã được dọn.

### P0 — Functional browser QA Purchase sau deploy

Dùng tài khoản và dữ liệu thử phù hợp; không ghi credential, cookie hoặc dữ liệu khách hàng vào evidence:

1. Desktop và mobile: mở Purchase Order/Purchase Receipt, kiểm submit preview và allocation timeline.
2. Kiểm settlement close/reverse, reason bắt buộc, capability/permission và confirmation scope.
3. Kiểm manual FIFO override, validation reason và audit append-only.
4. Kiểm supplier debt drill-down, filters, summaries và CSV export.
5. Smoke PO → Receipt → cancel → settlement/reverse bằng chứng từ test có thể dọn/hủy an toàn.
6. Hard refresh và kiểm bundle/cache cũ không che UI mới.
7. Ghi ảnh/evidence đã redacted; không chụp token, cookie, secret hoặc dữ liệu khách hàng thật.
8. Nếu phát hiện lỗi Critical/High, rollback Gateway/Tenant theo version trước và mở issue có evidence.

### P0 — Blocker trước khi kích hoạt FIFO production

1. Chạy staging migration và backfill dry-run trên bản sao dữ liệu phù hợp.
2. Review resolved/unresolved report và PO-level checksum.
3. `unresolved_count` phải bằng `0`; không đoán hoặc tự sửa row ID.
4. Chạy staging smoke đầy đủ PO → Receipt → cancel → settlement/manual override → report.
5. Xác minh supplier contention/D1 latency ở tải gần production.
6. Tạo production backup mới ngay trước activation.
7. Chỉ activation khi có explicit approval riêng; không gộp approval deploy code với approval bật FIFO.

### P1 — Product/report decisions

- Quyết định có cần standalone global Supplier Debt Report hay chỉ giữ report permission-scoped theo PO/Receipt timeline.
- Nếu cần global report, phải có contract data-scope, permission, filters và export riêng trước khi implement.

## Bán hàng — functional browser acceptance còn lại

1. Item picker chỉ hiện Item `is_sales_item=1`, `disabled=0` khi tìm trống và tìm theo mã/tên.
2. Recent links không làm lộ Item disabled hoặc mất quyền bán.
3. Multi-UOM: kiểm giá/tồn theo Item + Kho + ĐVT, không lấy chéo UOM.
4. Kiểm Price List/Item Price với role `Kinh doanh` và `Kế toán`.
5. Huỷ hoặc xoá chứng từ test theo quy trình nghiệp vụ sau khi thu evidence.

## Theo dõi production

- Theo dõi Gateway/Tenant 4xx/5xx mới liên quan Purchase allocation, settlement, supplier debt và sales item context.
- Rollback khi có login/API 5xx diện rộng, sai tenant/database, permission regression, mất dữ liệu CRUD hoặc print/PDF lỗi nghiêm trọng.
- Endpoint smoke hiện đã đạt nhưng không thay thế browser/business smoke.

## RBAC

- Chạy staging/browser QA riêng cho user lifecycle, role refresh, password/session revoke, audit log và tenant isolation.
- Không dùng dữ liệu khách hàng thật hoặc commit credential/evidence thô.

## Release automation

- Ở tenant release kế tiếp, xác minh `.github/workflows/ci.yml` tạo summary/version từ Wrangler NDJSON và không còn lỗi hậu kiểm `404`.
- Giữ `.github/workflows/gateway-production-release.yml` làm đường Gateway có exact SHA, smoke và provider evidence.
- `cloudflare-production-observation.yml` chỉ dùng manual smoke; không dùng để suy ra version/deployment ID.
- Chuẩn hóa release branch/date-specific trigger bằng PR riêng, không phát hành production chỉ để thử workflow.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Mọi production activation cần backup, rollback plan, exact evidence và approval riêng.
