# W03 — Vai trò, phạm vi & SoD

## Khối 1 — Định danh

- Route: `/security/roles`; route con `/security/roles/:id`, `/security/sod`, `/security/delegations`.
- Tác nhân: System Manager, Owner, Internal Auditor; domain manager chỉ đề nghị.
- Dữ liệu: Role Policy, Organization Assignment, SoD Rule, Delegation, Policy Version.

## Khối 2 — Layout desktop/mobile

- Desktop: ma trận role × resource/action, drawer field/row rules, cột mô phỏng effective permission và diff phiên bản.
- Mobile: danh sách role card → resource groups → action sheet; mô phỏng là màn stack riêng; không render ma trận cuộn ngang.
- Publish luôn hiện người soạn, người duyệt, ảnh hưởng user/session và đường cứu hộ.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Board policy review theo draft/in-review/approved/published/retired; mobile đổi trạng thái qua action sheet. |
| #8 AI | AI giải thích effective permission và xung đột có nguồn; không grant/revoke/publish. |
| #18 Vòng đời | Policy `draft→in_review→approved→published→retired`; delegation `scheduled→active→expired/revoked`. |
| #2 Xóa | Không xóa version published/audit; draft chưa tham chiếu được đưa thùng rác. |
| #4 Báo cáo | SoD conflict, quyền dư thừa, inactive user có quyền, field nhạy cảm được xem; drill-down. |
| #5+#12 Thông báo | In-app/email/Zalo cho publish/revoke/delegation sắp hết hạn; không Web Push. |
| #6 Barcode | Không áp dụng. |
| #10 Media/QR/OCR | Không áp dụng. |
| #11 In | Export permission evidence/SoD report PDF có hash. |
| #13 Mã tự động | Policy version và delegation code cấp trong transaction. |
| #14 Lịch | Calendar delegation theo ngày hiệu lực. |
| #15 Tiện ích VN | Tìm role/resource không dấu; recent policies; queue mode duyệt; câu hậu quả có số user ảnh hưởng. |
| #19 Master data | Resource/action/field registry sinh từ DocType Meta; không nhập chuỗi tùy ý. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `RoleResourceMatrixDesktop` / `RolePolicyCardsMobile` | read/write/select/submit/approve/post/export + field mask | System Manager draft; Auditor read |
| `RowRuleEditor` | DSL whitelist, preview predicate, test fixtures | System Manager |
| `PermissionSimulator` | user + resource + record → allow/deny + lý do | System Manager/Auditor |
| `SoDConflictGraph` | conflict block/warn và affected users | Auditor/System Manager |
| `PolicyVersionDiff` | before/after, approvers, sessions affected | Owner/Auditor |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Soạn/clone policy | registry + DSL + own grant ceiling | draft mới, không sửa version published |
| Mô phỏng | compiler thật, record fixture thật theo tenant | kết quả allow/deny + predicate + field mask |
| Gửi duyệt/duyệt | SoD, optimistic lock, người duyệt khác người soạn | append approval event |
| Publish/revoke | recent-auth, rescue path, impact check | version bump + revoke cache/session cần thiết |
| Tạo delegation | subset quyền, thời gian, grantee active | scheduled/active; lỗi nêu quyền vượt trần |

## Khối 5 — Autofill

- Resource/action/fields từ DocType Meta; common policy template chỉ prefill draft và hiển thị provenance.
- Scope gợi ý từ Organization Assignment; không tự mở rộng scope.
- Clone giữ rules nhưng bỏ version/approval/effective dates.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton role list + matrix groups. |
| Chưa có dữ liệu | CTA tạo role từ template đã xem trước. |
| Lọc không ra | Xóa filter/hiển thị resource gần đúng. |
| Error | Error theo editor/simulator, giữ draft và test input. |
| Thiếu quyền | Read-only evidence hoặc 403; field nhạy cảm không trả về. |
| Saved/success | Diff highlight; toast có “Mô phỏng lại”. |
| Mạng gián đoạn | Chỉ xem cache hiện tại, publish/mutation bị khóa; không queue/PWA. |
