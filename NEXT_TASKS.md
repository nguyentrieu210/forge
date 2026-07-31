# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Authoritative audit: `server/docs/ALUMDOOR-PROCESS-TRACEABILITY-AUDIT-20260801.md`.

## P0 — close the Forge onboarding gap

Default hiện thiếu `FORGE.md` và `.forge/manifest.json`.

1. Dùng versioned Forge pack để mở onboarding PR riêng.
2. Cài `.forge/skills/**`, `.forge/manifest.json` và `FORGE.md` qua installer/sync flow của pack.
3. Validate checksums/manifest.
4. Không hand-edit vendored skills trong feature PR.
5. Không merge onboarding PR khi exact-head CI chưa chạy và PASS.

Done when:

- repository có entry file và manifest hợp lệ;
- pack validation PASS;
- draft PR ghi rõ version/checksum và không đổi business logic.

## P0 — owner approval for whole-process G1

Chốt các quyết định trong audit trước khi build workflow toàn cõi:

1. Ba “file” được thay bằng ba ERP workspace/report hay vẫn phải sinh file vật lý.
2. Đơn vị năng lực 8 giờ: bộ phận, người, đội, workstation hay máy.
3. Quyền sửa sổ chi tiết sau chốt ngày và cơ chế adjustment.
4. Lỗi nhà cung cấp trừ công nợ ngay, giữ tạm hay chỉ trừ sau khi NCC chấp nhận.
5. Luật làm tròn cửa Đức hiện ghi trong `slats.ts`.
6. Công thức thực của Cửa Siêu Trường.
7. Cách biểu diễn đơn chỉ đặt lá ruột/lá đầu/bộ ba lá đáy.
8. `THÔ` là finish, stock condition, production operation hay tổ hợp có precedence.

Done when:

- audit được nâng thành BRD/acceptance contract approved;
- mọi decision có fixture đầu vào/kết quả mong đợi;
- không còn business ambiguity ảnh hưởng stock, production hoặc accounting.

## P0 — central order and downstream orchestration

1. Tạo surface Theo dõi đơn hàng–xuất hàng đủ cột:
   - ngày đặt/giao;
   - số chứng từ;
   - đại lý/người phụ trách;
   - nhóm sản phẩm/tên vật tư;
   - ghi chú cố định/ghi chú tay;
   - thu tiền;
   - trạng thái/lệnh xuất kho;
   - trạng thái/lệnh sản xuất;
   - lỗi.
2. Thiết kế idempotent orchestration từ Sales Order sang:
   - production request/order theo loại cửa;
   - production schedule;
   - painting queue;
   - warranty/defect reference.
3. Một voucher có nhiều loại cửa phải sinh đúng nhiều production records nhưng không trùng khi retry.
4. Mọi write đi qua DocumentKernel/Durable Object; không side-write D1.
5. Bổ sung desktop/mobile authenticated journey.

Done when:

- source order không phải gõ lại ở downstream records;
- retry không tạo bản ghi trùng;
- permission, cancellation và audit trail PASS;
- exact-head tests/typecheck/build và required CI PASS.

## P0 — daily detailed-ledger snapshot and restricted amendment

1. Định nghĩa daily snapshot entity/command.
2. Chụp dữ liệu theo ngày từ các nguồn authoritative, không copy mutable spreadsheet-style rows.
3. Khóa snapshot sau commit.
4. Chỉ các role được duyệt có thể tạo adjustment có lý do và audit.
5. Không cho sửa/xóa lịch sử im lặng.
6. Thêm report theo từng nội dung như yêu cầu file 3.

Done when:

- snapshot checksum ổn định;
- concurrent update không tạo hai snapshot khác nhau;
- unauthorized edit bị từ chối server-side;
- adjustment giữ lineage tới snapshot gốc.

## P0 — controlled defects and warranty accounting

1. Thay `Warranty Claim.issue_cause: Data` bằng controlled cause contract:
   - motor/bình lưu điện;
   - lỗi sản xuất;
   - lỗi nhà cung cấp;
   - lỗi khách hàng.
2. Link bắt buộc tới Sales Order/Delivery Note/voucher nguồn.
3. Enforce thời hạn một năm cho motor/bình lưu điện từ ngày giao.
4. Lỗi sản xuất có người chịu trách nhiệm và xác nhận xử lý của kế toán tổng hợp.
5. Lỗi NCC có state machine gửi/nhận đổi và accounting effect theo decision đã duyệt.
6. Lỗi khách hàng có cost basis/process stage và audit.
7. Authenticated lifecycle QA trên desktop/mobile.

## P1 — production schedule and operator manufacturing

1. Production schedule read model/UI:
   - ngày đặt/giao/sản xuất;
   - khách hàng, nhóm/mặt hàng;
   - cao/rộng/diện tích;
   - thời gian sản xuất;
   - bộ phận phụ trách;
   - tăng ca;
   - định mức công việc.
2. Tính tổng tải theo ngày/loại cửa và phần vượt năng lực 8 giờ.
3. Hoàn thiện type-specific production documents.
4. Hoàn thiện AL70 lock/vent/one-layer/two-layer/ray/bottom-leaf cases.
5. Hoàn thiện painting queue lifecycle.
6. Staging journey: release Work Order, partial issue/manufacture, offcut/scrap, cancel và reports.

## P1 — finish Inventory Slice D

Draft PR `#82` còn thiếu:

- wire D1 reader/access policy vào tenant report endpoint;
- endpoint isolation/permission/error regressions;
- physical-stock explorer và lineage drill-down;
- quarantine/release và Work Order progress views;
- WIP, shortage, variance, scrap/offcut, ageing và condition reports;
- runtime harness và Playwright desktop/mobile.

Không merge cho tới khi exact final head CI PASS và draft scope được hoàn thành hoặc chia nhỏ rõ ràng.

## P1 — authenticated Sales and Purchase acceptance

### Sales

1. Hard refresh `https://alu.kairo.vn`.
2. Sales Order mới với `Giá niêm yết`, `TRỤC 114_1.8LY`, UOM `Mét`.
3. Xác minh rate `180000 VND`, amount và save-time pricing.
4. Đổi Item/UOM/bảng giá để chứng minh không lấy chéo hoặc giữ giá cũ.
5. Không ghi credential/cookie/dữ liệu khách hàng thật vào evidence.

### Purchase

Draft PR `#103` phải hoàn tất và được verify:

- login/boot;
- PO create/save/submit;
- Receipt create/save/preview/submit/cancel;
- item/UOM picker;
- desktop/mobile;
- FIFO giữ disabled.

## P2 — finance and customer debt

1. Rebuild/retarget finance AR/AP work từ PR `#15` lên current default; không merge branch stale/conflicted.
2. Hoàn thiện Payment Allocation.
3. Hoàn thiện Party Statement, Debt Summary và Advance Balance.
4. Hoàn thiện report navigation/UI và authenticated QA.
5. Kết nối Delivery Note/Sales Invoice/Payment Entry tới customer-detail acceptance.
6. Quyết định ERP replacement cho folder/file print theo tháng/ngày/khách/voucher.

## P2 — repository hygiene

1. Triage và đóng các PR backup/tmp/superseded/conflicted không còn authoritative.
2. Lập kế hoạch đổi default branch khỏi tên hotfix sau khi release branches ổn định.
3. Bảo đảm canonical handoff luôn có whole-process section, không chỉ trạng thái hotfix gần nhất.
4. Current default head phải có exact-head CI evidence trước khi gọi repository green.

## Existing release follow-ups

### Authenticated Sales smoke after app Worker release

- feature merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`;
- Worker `cloudforge-app-alumdoor`;
- namespace `cloudforge-production`;
- release run `30651057535`;
- Version ID `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.

### Production observation reporting

- endpoint smoke cũ PASS;
- job đỏ do issue-comment API `403`;
- chuyển evidence mặc định sang `$GITHUB_STEP_SUMMARY` + artifact;
- observation chỉ read-only và PR đóng không merge.

### Purchase/FIFO activation gates

- staging/sanitized copy;
- read-only readiness với `unresolved_count=0`;
- approved checksum;
- staging execute giữ `enabled=0`;
- functional/latency evidence;
- fresh backup;
- production activation chỉ sau explicit approval riêng.

## Không được làm

- Không deploy Cloudflare khi chưa có yêu cầu rõ.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
- Không merge PR hoặc production deploy nếu chưa có explicit instruction mới.
