# W05 — Thiết lập kế toán Việt Nam

## Khối 1 — Định danh

- Route: `/accounting/setup-vn`; route con `/accounting/legal-rules`, `/accounting/tt99-map`, `/accounting/tax-rules`.
- Tác nhân: Chief Accountant, General Accountant, Tax Specialist, Auditor, Owner sign-off.
- Dữ liệu: VN Accounting Policy, VN Legal Rule, TT99 Account Map, Tax Ruleset, Company, Account, Fiscal Year.

## Khối 2 — Layout desktop/mobile

- Desktop: setup checklist bên trái; form/rule table giữa; coverage, effective timeline, test evidence và diff bên phải.
- Mobile: checklist card → từng bước full-screen; account map là card source→target; publish trong action sheet có xác nhận legal sign-off.
- Rule/table cursor server; editor chỉ dùng DSL whitelist; không eval code hoặc AI-generated SQL ở client.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Rule review board `draft/in-review/approved/effective/superseded`; mobile action sheet. |
| #8 AI | Giải thích khác biệt ruleset/map và liệt kê nguồn; không tự chọn chế độ, tài khoản hay publish. |
| #18 Vòng đời | Policy/rule versioned; effective theo ngày, supersede không ghi đè lịch sử. |
| #2 Xóa | Draft chưa tham chiếu được thùng rác; approved/effective chỉ supersede. |
| #4 Báo cáo | Coverage account/form/scenario, overlap/gap ngày hiệu lực, fixture pass rate; drill-down. |
| #5+#12 Thông báo | In-app/email/Zalo cho rule sắp hiệu lực/hết hiệu lực, coverage gap, publish; không Web Push. |
| #6 Barcode | Không áp dụng. |
| #10 Media/QR/OCR | Đính văn bản/hồ sơ ký duyệt R2; OCR chỉ gợi ý số văn bản/ngày, người dùng xác nhận. |
| #11 In | In sổ quy tắc, account map, legal sign-off PDF có version/hash. |
| #13 Mã tự động | Rule/mapping/version code server cấp; document number pháp lý do người dùng nhập và validate. |
| #14 Lịch | Calendar hiệu lực ruleset và deadline chuyển đổi. |
| #15 Tiện ích VN | Mã số thuế, VND, năm tài chính, tìm tài khoản theo mã/tên không dấu, paste map từ Excel. |
| #19 Master data | Account, taxpayer segment, tax type, provider, form/XML schema là registry/versioned master. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `VNSetupChecklist` | company→regime→COA/map→tax→e-invoice→test/sign-off | accounting roles |
| `LegalRuleEditor` | document no, scope, effectivity, supersedes, source | Tax Specialist draft |
| `TT99AccountMapGrid` | source/target/effectivity/coverage; paste rows | Chief Accountant write |
| `RuleFixtureRunner` | scenario input, expected vs actual, deterministic hash | accounting/test roles |
| `LegalSignoffPanel` | approvers, evidence, version diff | Chief Accountant + Owner/legal approver |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Chọn accounting regime | fiscal start, company type, legal source | policy draft; cảnh báo không phải tư vấn pháp lý |
| Import/map COA | account tồn tại, không cycle, effective dates | preview diff trước commit; lỗi từng dòng |
| Tạo/test rule | DSL/schema whitelist, fixture coverage | evidence immutable theo rule hash |
| Publish/supersede | four-eyes, no overlap, tests green | effective version; invalidate cache có kiểm soát |
| Export sign-off | đủ approver/source/evidence | private PDF/ZIP + audit |

## Khối 5 — Autofill

- Company/fiscal year/currency từ context; regime gợi ý theo ngày và segment nhưng bắt buộc xác nhận.
- Account target gợi ý từ approved transition map, hiện source/effective date; dirty field không bị ghi đè.
- “Lưu & tạo tiếp” giữ document no/scope/type; clone bỏ version/approval/effectivity.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton checklist/table/evidence. |
| Chưa có dữ liệu | CTA khởi tạo policy cho company đã chọn. |
| Lọc không ra | Nêu account/rule filter, nút xóa lọc. |
| Error | Lỗi theo dòng/field, giữ import map và fixture input. |
| Thiếu quyền | Read-only/masked sign-off; publish API 403. |
| Saved/success | Version/map vừa lưu highlight, toast có “Chạy kiểm thử”. |
| Mạng gián đoạn | Giữ draft, khóa test/publish/import commit; không queue/PWA. |
