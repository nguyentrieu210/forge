# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`; vẫn phải kiểm tra lại bằng GitHub trước khi làm, không suy từ tên branch local.
- Current executable code head (không tính docs-only evidence merge): `19f949c6aba3541c7d3585ad42f8a8c42ebeea74` (G03 Organization Security; CI run `30707768323` PASS, chưa có production-release evidence trong đợt Alumdoor Meta). Luôn đọc GitHub để lấy SHA đầu nhánh hiện hành vì docs-only merge có thể cao hơn executable head.
- Alumdoor production đang chạy exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`; full production release run `30707135053` PASS tenant/app/gateway và HTTP/browser smoke.
- Đọc theo thứ tự: `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, CI, merge và release evidence.

## Canonical DocType Meta đã merge

- Alumdoor `2.1.0`: 74 DocType, 969 field, 255 Link, 27 child table, 12 report và 3 chart report-backed.
- Meta contract gồm `kind`, `viewPolicy`, `valueSource`, `editMode`, `surface`, `serverEnforced`, `dirtyGuard` và external DocType closure.
- Quick/expanded form đã chạy theo Meta; field internal vẫn giữ trong schema gốc để default/serialization/server dùng.
- Hidden/server-owned field bị runtime từ chối nếu client tự đặt hoặc sửa.
- `User` Link đọc danh bạ tenant thay vì rơi về free-text hoặc đòi một DocType document giả.
- Biểu đồ không còn tự suy từ workflow; chỉ chart khai trong manifest, có report, quyền, drill-down và empty fallback mới được render.
- Canonical skill `C:\AppWeb\.claude\skills\app-factory` đã được tạo tại `35be2bf` và siết đồng bộ runtime tại `9cd5774`.

## Protected metadata installer — hoàn tất production

- PR `#157` đã merge tại `8786c5707ac4d225f7a63561219dd629d080584d`.
- Run đầu `30705986949` PASS backup/checksum, hai restore drill và cleanup nhưng dừng trước khi ghi vì tenant thiếu standard DocType. Forward-fix PR `#158`, actionlint fix `#159` và release manifest `#160` đã merge.
- Full release run `30707135053` PASS tại exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`: tenant Worker version `d7d5b998-6c64-414f-952e-5224fdab3908`, app Worker version `0e11508a-713f-42a5-b8c3-a104f133c8fc`, gateway version `ef3b4a9a-38f2-4534-86b8-1e6bda2d3ea1`, evidence artifact `8820777029`.
- Protected installer run `30707517624` PASS: backup artifact `8820790995`, SHA-256 `30c3f4b997de2e3fafbdd323eaa837c3c497b0b1b4919edca1d327f710b99bf4`, hai restore drill và guarded cleanup PASS, install evidence artifact `8820857133`.
- Alumdoor Meta `2.1.0` đã cài: 74 DocType, 1 workflow, 57 fixture; completeness 969 field, 255 Link, 12 report, 3 chart, 77 nav. Quick/expanded form, User Link, context dimension, health 200 và guest boot 403 PASS.
- Hai GitHub Environment secret tạm cho installer đã xóa; production environment chỉ còn `CLOUDFLARE_API_TOKEN`.

## PR cleanup

Toàn bộ PR stale trước đây đã đóng: `#15`, `#35`, `#36`, `#40`, `#73`, `#74`, `#79`, `#81`, `#103`, `#106`, `#109`.

Không reopen và không merge nguyên branch cũ. Branch cũ chỉ làm nguồn tham khảo từng file cho nhánh sạch từ current default.

## Đã merge trên default

### Sales-to-Production

- PR `#131` merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.

### Tiến Đạt purchase FIFO

- PR `#134` merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Form đặt nhôm, FIFO đơn cũ trước, lịch sử nhập, công nợ cây/mét và dung sai Tiến Đạt `5%` đã có.
- Regression: `200 + 100`, nhận `230` → `200 + 30`, nợ `70` cây / `504 m`, khoảng thêm `55–85`.

### Purchase authenticated QA

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Exact PR head: `fd03d22872c2234d50f616a5d8956c8b62f26b40`.
- CI `30670524038`: SUCCESS.
- PR Validation `30670524052`: SUCCESS.
- Purchase Feature CI `30670524133`: SUCCESS.
- UI Pull Request Validation `30670524072`: SUCCESS.
- Sales `30670524058` và Inventory `30670523976`: SUCCESS.

Authenticated evidence đã khóa:

- cookie + CSRF thật;
- authoritative Alumdoor app cài vào D1 local;
- Item/UOM search;
- Purchase Order create/save/submit/reopen;
- Purchase Receipt create/save/preview/submit/cancel/reopen;
- Desktop Chrome và Pixel 7;
- Tiến Đạt `200 + 100`, nhận `230` ra `200 + 30`, lưu đúng hai `purchase_order`, đọc lại lịch sử, `85` được phép và `86` bị từ chối.

QA chỉ dùng local/ephemeral. Không deploy Cloudflare, không mutate production, không bật generic FIFO rollout.

## Trạng thái thật

Không được tuyên bố toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

Còn thiếu hoặc chưa chứng minh:

1. Finance full scope.
2. Daily detailed ledger snapshot/freeze/adjustment.
3. Warranty/defects và capacity/overtime.
4. Authenticated end-to-end acceptance.
5. UI MetaForge MISA-style và login/landing cần rebuild riêng nếu vẫn còn yêu cầu.

## Việc tiếp theo

Bắt đầu `P0 — authenticated stock lifecycle` từ exact current default mới nhất, nhưng không phát hành G03 kèm theo một cách ngầm định.

- Dùng QA account riêng, cookie + CSRF thật và dữ liệu thử có cleanup.
- Chạy nhập kho, xuất kho, chuyển kho và kiểm kho trên desktop/mobile; khóa permission và failure path.
- Đối chiếu ledger/report/QR và xóa toàn bộ chứng từ QA theo lineage.
- Commit G03 `19f949c6` trên `main` chưa có production-release evidence; nếu phát hành phải chạy backup/migration/rollback/evidence riêng.

Sau stock lifecycle: Daily ledger → Warranty/Capacity → end-to-end acceptance.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret hoặc DNS.
- Không thay rollout state.
- Không mutate dữ liệu khách hàng.
- Generic FIFO production vẫn disabled.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- cookie/token;
- generated evidence.
