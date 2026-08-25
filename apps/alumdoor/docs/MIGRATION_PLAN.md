# Kế hoạch chuyển đổi — Alumdoor Frappe Pure

> Thiết kế Pha 3, chưa thực thi. Mục tiêu: bỏ cơ chế Báo giá, hợp nhất frontend Forge với Frappe authoritative và không mất dữ liệu đã nhập.

## 1. Nguyên tắc

- Một nguồn code canonical trong Git; Docker bench chỉ chạy/mount nguồn đó.
- Backup có kiểm tra phục hồi trước mọi schema/data migration.
- Không dual-write Quotation và Sales Order. Có cửa sổ read-only/cutover rõ.
- Mỗi patch có `execute()` idempotent, marker/log, dry-run report và đối soát.
- Không xóa master có dữ liệu; archive/disable route/doctype cũ sau khi parity.
- Môi trường hiện tại được Chủ xưởng xác nhận đang xây từ đầu: giữ master đã nhập; backup rồi archive giao dịch demo, không migrate chúng thành đơn thật.

## 2. Nguồn và đích

### Nguồn hiện tại

- Backend chạy: `work/frappe_docker/development/frappe-bench/apps/alumdoor`.
- Frontend: `client/packages/vertical-alumdoor`.
- Master Frappe namespaced đã có: Item/UOM/Partner/Item Price/Pricing Rule/Sales Package/Component Rule/Configured Product/Quotation…
- Hai UI cần hợp nhất: `sales-order-v2/*` và `quotation/AlumdoorQuotationWorkbench.tsx`.
- Forge brief cũ có transaction DocType generic nhưng không phải authority đích.

### Đích Git

```text
work/forge-frappe-runtime/
├─ apps/alumdoor/frappe/                 # Frappe app canonical, Git tracked
├─ apps/alumdoor/docs/                   # BRD/design/migration evidence
└─ client/packages/vertical-alumdoor/    # Forge UI canonical
```

Runtime Docker mount `apps/alumdoor/frappe` vào bench. Không chỉnh tay bản trong volume/mount khác.

## 3. Backup và preflight

1. Dừng ghi nghiệp vụ, ghi thời điểm cutover và user thực hiện.
2. Chụp `git status`, commit SHA, versions Frappe/app, site config không chứa secret trong log.
3. `bench --site alumdoor.localhost backup --with-files`; sao chép backup DB/private/public ra thư mục backup có timestamp ngoài volume runtime.
4. Ghi SHA-256 từng file backup, dung lượng và row counts các DocType Alumdoor.
5. Restore thử backup vào site tạm và chạy smoke login/read master.
6. Export JSON/CSV độc lập cho Quotation, Quotation Item, snapshots, Price/Rule/Package/Components và File links.
7. Inventory duplicate keys, dangling links, missing UOM/rule/item; preflight phải pass trước patch.

Không đi tiếp nếu restore thử thất bại.

## 4. Mapping DocType

| Nguồn | Đích | Hành động |
|---|---|---|
| `Alumdoor Partner Group` | giữ | Bổ sung field/index/permission nếu thiếu |
| `Alumdoor Partner` | giữ | Hợp nhất customer/supplier flags; snapshot không FK mutable |
| `Alumdoor Item Group` | giữ | Đối soát tree/active |
| `Alumdoor UOM` / Conversion | giữ | Chuẩn hóa canonical UOM; không đổi qty sang measure |
| `Alumdoor Item` | giữ | Bổ sung door/system/profile/fixed variant/max width metadata |
| Màu/bề mặt hiện có | `Alumdoor Surface Finish`, `Alumdoor Color`, `Alumdoor Item Color Allowance` | Map code, nhóm màu, active, allowance |
| Kho hiện có | `Alumdoor Warehouse`, `Alumdoor Bin Location` | Giữ code; không import valuation |
| `Alumdoor Measurement Profile*` | giữ/mở rộng | Version field schema và basis theo customer group |
| `Alumdoor Door Type/System/Formula*` | giữ/mở rộng | Handler/AST allowlist; version source |
| `Sales Package`, `Component Rule` | giữ/mở rộng | Namespaced kỹ thuật nếu cần nhưng preserve name/link |
| `Alumdoor Price List/Item Price/Pricing Rule` | giữ/mở rộng | Effective range/priority/dedupe/approval default |
| `Configured Product*` | archive | Không tạo mới; chỉ giữ trace nếu có reference |
| `Alumdoor Quotation` | archive demo | Backup/export rồi khóa tạo mới; không biến demo thành đơn thật |
| `Alumdoor Quotation Item` | archive demo | Đi cùng parent; chỉ giữ để truy vết backup |
| Quote component/adjustment snapshots | Order snapshots | Copy bất biến và gắn source legacy |
| Generic Forge `Sales Order` | `Alumdoor Sales Order` | Chỉ migrate nếu có record thật; dedupe bằng legacy id |
| Generic Forge production/stock/purchase/delivery | namespaced operational DocTypes | Chỉ migrate record thật sau audit, không migrate demo mù |
| File/Comment/Version | giữ/relink | Attached doctype/name sang document đích |

## 5. Mapping Quotation → Sales Order

| Quote field | Order field | Quy tắc |
|---|---|---|
| name | `legacy_quotation`, naming series mới | Không tái dùng tên QTN làm tên SO; unique legacy link |
| customer + customer snapshot | tương ứng | Copy snapshot nguyên văn; link được validate |
| transaction/date/delivery | order/delivery date | Normalize timezone/date |
| price list/customer group | header snapshot | Copy code/version nếu còn tồn tại |
| items | Order Items | Giữ thứ tự, client/source row id |
| set_count/qty_bar legacy | `qty` + `measure_qty` | Map theo UOM/item metadata; record ambiguous vào exception report |
| dimensions | measurement input/result snapshot | Key allowlist theo profile version |
| rate/discount/adjustment/VAT/totals | pricing snapshots | Copy để bảo toàn lịch sử; không âm thầm recalculate Submitted legacy |
| components | Component Snapshot | Giữ qty vật lý và measure riêng |
| workflow status | Draft/Approved/Pending/Cancelled mapping | Xem §6 |
| owner/creation/modified | source audit fields | Không giả system timestamps nếu Frappe cấm; lưu legacy metadata |

Record demo được gắn `is_migration_demo=1` hoặc archive theo danh sách Owner duyệt; không trộn KPI vận hành.

## 6. Mapping trạng thái

| Legacy | Đích |
|---|---|
| Draft | Draft |
| Submitted/Accepted không ngoại lệ | Approved |
| Pending approval | Pending Owner Approval |
| Rejected | Rejected |
| Cancelled | Cancelled |
| Có production reference | Production Requested/In Production theo chứng từ |
| Có stock issue submitted | trạng thái tương ứng + `is_stock_locked=1` |
| Không rõ/mâu thuẫn | Không migrate tự động; exception report |

Không tạo Production Request tự động cho đơn legacy đã kết thúc. Đơn active Approved chưa có request được xử lý bằng patch idempotent riêng sau đối soát.

## 7. Trình tự patch/cutover

### Wave 0 — canonical source

1. Copy có kiểm tra backend app vào `apps/alumdoor/frappe` bằng thao tác bảo toàn; diff file count/hash.
2. Commit nguồn canonical trước thay đổi tính năng.
3. Đổi Docker mount; chạy import/app discovery; bản cũ giữ read-only để rollback, không sửa song song.

### Wave 1 — additive schema

1. Thêm/mở rộng master, Settings, Audit Event, Request Key.
2. Thêm operational DocTypes namespaced và indexes.
3. Migrate/seed rule metadata từ file đã nhập; validate cross-links.
4. Chạy tests schema/permissions; chưa đổi route người dùng.

### Wave 2 — engine và shadow verification

1. Cài calculation service/API mới nhưng chưa mở mutation route.
2. Chạy corpus đơn mẫu/tài liệu qua engine mới; so expected rules, không so mù với UI sai cũ.
3. Với Quote hợp lệ, chạy dry-run migration và compare snapshot/totals; khác biệt phải có reason report.

### Wave 3 — data migration

1. Chuyển site sang maintenance/read-only ngắn.
2. Backup lần cuối + checksum.
3. Chạy Quotation → Sales Order và transaction thật khác theo batch transaction/log.
4. Relink File/Comment/Version.
5. Reconcile counts, totals, orphan links, state/lock, random sample print.

### Wave 4 — frontend cutover

1. Route `/sales-orders` và `/new` dùng API mới.
2. Gỡ menu/link/button/text Báo giá và duplicate title.
3. Redirect URL Quote cũ có id sang Sales Order migrated; URL create Quote trả trang giải thích/ngừng dùng, không tạo mới.
4. Vô hiệu write Quote ở controller/hook server; giữ read-only trong một release.
5. Không dual-write.

### Wave 5 — operational cutover

1. Mở site, smoke theo role O/A/S.
2. Tạo đơn test default → Production Request; tạo ngoại lệ → Owner approval.
3. Test stock concurrency/non-negative/lock, purchase receipt, delivery, payment, print/import rollback.
4. Owner ký biên bản đối soát; bắt đầu theo dõi 24–48 giờ.

### Wave 6 — cleanup sau ổn định

Sau ít nhất một release ổn định và backup được xác nhận: ẩn/archive Configured Product/Quotation UI/service/route cũ. Không drop table trong cùng release cutover; drop chỉ bằng quyết định riêng.

## 8. Đối soát bắt buộc

| Nhóm | Kiểm tra pass |
|---|---|
| Count | Nguồn = migrated + explicitly archived + exception |
| Money | Tổng legacy historical snapshot theo document = tổng snapshot đích; chênh 0đ hoặc có approved reason |
| Master | Không dangling Link; code/UOM/color/rule unique |
| Components | Qty vật lý không biến thành m/m²; bộ 3 lá đáy đủ ba item |
| Workflow | Approved/Pending/Cancelled/stock lock đúng mapping |
| Permission | S không approve/master; A không master price; O toàn quyền |
| Files | Attachment private mở được đúng quyền |
| Print | 10 mẫu đại diện A4/A5 không vỡ trang/sai tổng |
| API | Retry không duplicate; stale modified bị chặn |
| UI | Không còn chữ/menu/action Báo giá ở flow vận hành |

Report lưu kèm timestamp, code SHA, site backup SHA và người duyệt.

## 9. Rollback

### Trước mở ghi

- Dừng site mới.
- Đổi Docker mount/commit về nguồn canonical trước Wave.
- Restore DB + public/private files từ backup đã restore-test.
- Chạy migrate đúng app version cũ, clear cache, smoke login/read/write Quote cũ.

### Sau đã mở ghi

Không restore thẳng làm mất đơn mới. Kích hoạt maintenance, export mọi document tạo từ cutover, đánh giá migration ngược có kiểm soát hoặc sửa forward. Owner quyết định. Không dùng `git reset --hard`, không xóa volume/site.

### Trigger rollback ngay

- Sai tổng tiền/VAT/snapshot không giải thích được.
- Ghi trùng do retry.
- Tồn âm hoặc submit stock một phần transaction.
- Permission leak.
- Mất attachment/record hoặc restore backup không dùng được.

## 10. Cleanup code cụ thể phải audit ở Pha 5

- `quotation/AlumdoorQuotationWorkbench.tsx`: thay route rồi archive/xóa sau parity.
- `sales-order-v2/*`: giữ adapter/hook có test, bỏ schema/UI không đúng contract.
- `workspace-extension.tsx`: một route Tạo đơn, không duplicate title/menu.
- `quotation_service.py`: tách logic đúng sang calculation/service mới; gỡ API Quote sau cutover.
- Generic brief transaction definitions: không được tiếp tục tạo DB authority song song.
- Docs/fixtures cũ có vân gỗ 360k hoặc phụ thu `<7m²` chung: đánh dấu obsolete, không seed.

## 11. Cổng migration

- [x] Có backup + restore test trước đổi.
- [x] Có mapping master/chứng từ/field/state/file.
- [x] Không dual-write; có cutover và read-only legacy.
- [x] Có đối soát, rollback trigger và cleanup.
