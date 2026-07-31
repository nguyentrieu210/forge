# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## Purchase/FIFO — code, release nền và browser QA

### Đã hoàn thành

- PR `#14` đã squash-merge thành `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Tenant release run `30631386714`: backup, migration, deploy và endpoint smoke **PASS**.
- Tenant Worker production version: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Gateway release PR `#57` đã merge thành `f50993ef7736a0321f6a0e8c308c5cb069497472`; version `6352386d-8385-4ea8-af31-15ac62e21943` là phiên bản lịch sử, đã được thay bởi UI child-grid release.
- Gateway production hiện hành: `7d0c77ee-588e-44cb-abff-1c217a754316`.
- FIFO rollout vẫn **disabled**; không có activation, DNS hay production secret change.
- PR `#63` đã materialize source thật tại `2b8219f8325dd41e4c9cd833f48f85a0d5b87d55`; không còn payload/workflow one-shot.
- Migration `0032_purchase_reversed_window_corrections.sql`, lifecycle `close → reverse → cancel` và SQL/unit regression đã hoàn tất.
- Chromium Purchase QA đã **PASS 6/6** trên desktop/mobile trong UI run `30641219079`, job `91191344929`.
- UI workflow còn PASS build, Alumdoor browser QA và local cookie-auth smoke; evidence artifacts `8797591671`, `8797601615`.
- Exact-head CI, PR Validation, Purchase, Inventory/Manufacturing và Sales workflows đều **SUCCESS** trên source commit thật.

### P0 — hoàn tất PR #63

1. Đồng bộ default và chạy exact-head CI trên merge-sync/doc head cuối.
2. Xác nhận PR mergeable, không còn temp/generated artifact.
3. Chuyển PR khỏi draft và merge khi toàn bộ required checks xanh.
4. Sau merge, nếu phát hành correction code/migration `0032`, dùng release path chuẩn và giữ FIFO **disabled**.

### P0 — blocker trước khi kích hoạt FIFO production

1. Có staging tenant hoặc bản sao dữ liệu phù hợp, không dùng dữ liệu khách hàng thô làm artifact.
2. Chạy staging migration và backfill dry-run.
3. Review resolved/unresolved report và PO-level checksum; `unresolved_count` phải bằng `0`.
4. Chạy backfill execute trên staging và xác minh ledger counts/checksum trong rollout state, vẫn giữ `enabled=0`.
5. Chạy authenticated staging business smoke đầy đủ PO → Receipt → cancel → settlement/reverse → manual override → supplier debt report.
6. Xác minh supplier contention và D1 latency ở tải gần production.
7. Tạo production backup mới ngay trước activation và chuẩn bị rollback plan.
8. Chỉ activation khi có explicit approval riêng kèm exact checksum; không gộp approval deploy code với approval bật FIFO.

### P0 — production business acceptance còn lại

- Hard refresh bundle đã deploy và kiểm Purchase Order/Purchase Receipt bằng tài khoản thử phù hợp.
- Kiểm submit preview, allocation timeline, settlement reason/capability, manual override và supplier debt CSV trên dữ liệu test có thể dọn an toàn.
- Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.
- Nếu phát hiện lỗi Critical/High, rollback đúng Gateway/Tenant version và mở issue có evidence đã redacted.

### P1 — product/report decisions

- Quyết định có cần standalone global Supplier Debt Report hay chỉ giữ report permission-scoped theo PO/Receipt timeline.
- Nếu cần global report, phải có contract data-scope, permission, filters và export riêng trước khi implement.

## UI child table — production functional smoke còn lại

1. Xác nhận không còn nhóm `Lựa chọn gần đây` trong Link dropdown.
2. Kiểm dropdown tự cuộn khi còn khoảng cuộn và relay wheel về đúng child grid khi chạm đầu/cuối.
3. Kiểm cả child grid gọn và bảng mở rộng.
4. Xác nhận Item, UOM và Warehouse vẫn chọn được, giữ đúng filter/quyền.
5. Dùng tài khoản/dữ liệu thử phù hợp và không lưu cookie, token hoặc dữ liệu khách hàng trong evidence.

## Bán hàng — functional browser acceptance còn lại

1. Item picker chỉ hiện Item `is_sales_item=1`, `disabled=0` khi tìm trống và tìm theo mã/tên.
2. Recent links không làm lộ Item disabled hoặc mất quyền bán.
3. Multi-UOM: kiểm giá/tồn theo Item + Kho + ĐVT, không lấy chéo UOM.
4. Kiểm Price List/Item Price với role `Kinh doanh` và `Kế toán`.
5. Huỷ hoặc xoá chứng từ test theo quy trình nghiệp vụ sau khi thu evidence.

## Theo dõi production

- Theo dõi Gateway/Tenant 4xx/5xx mới liên quan Purchase allocation, settlement, supplier debt và sales item context.
- Rollback khi có login/API 5xx diện rộng, sai tenant/database, permission regression, mất dữ liệu CRUD hoặc print/PDF lỗi nghiêm trọng.
- Endpoint smoke và component/browser harness không thay thế authenticated production business smoke.

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
