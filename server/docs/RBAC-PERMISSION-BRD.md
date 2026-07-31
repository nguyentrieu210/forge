# RBAC AND DATA-SCOPE COMPLETION BRD

Trạng thái: **DRAFT — G1 requirements**  
Ngày: **2026-07-31**  
Branch: `feat/rbac-permission-completion-20260731`  
Base đã audit: `cd60f8c09c48105db84a82c12ad3b32d9f075064`

Tài liệu này chốt yêu cầu cho phân quyền Forge trước khi sửa runtime. Không triển khai code, migration hoặc production rollout cho tới khi các quyết định ở mục 12 được duyệt.

## 1. Bối cảnh và nguồn sự thật

Forge là ERP đa tenant. Gateway chọn tenant, loại các identity header do client tự gửi, xác thực người dùng rồi ký trusted identity chuyển vào Tenant Worker. Tenant Worker và các Frappe-shaped API phải dùng cùng một permission service; UI chỉ phản ánh kết quả và không phải security boundary.

Nguồn quyền hiện có:

1. Role grant của người dùng trong `users`, `roles`, `user_roles`.
2. DocPerm trong metadata ứng dụng.
3. Static permission matrix cho các DocType/report nền tảng.
4. User Permission để giới hạn theo Company, Warehouse và các Link dimension khác.
5. Share theo document cho `read`, `write`, `share`.
6. Workflow transition theo role và luật self-approval.
7. Field permission theo `permlevel`.

Mọi dữ liệu và quyết định phải luôn gắn `tenant_id`. Actor và role không được lấy từ payload/browser.

## 2. Vấn đề đã xác minh

### P0 — Kiểm tra quyền của người khác đang trả kết quả sai actor

Màn `Kiểm tra quyền` cho phép chọn một người dùng và adapter gửi tham số `user`. Endpoint `metaforge.api.explain_permission` hiện bỏ qua tham số đó, dùng `context.actor` để tính role, read scope và capability. Quản trị viên có thể chọn nhân viên kho nhưng nhận lại quyền của chính quản trị viên.

Endpoint cũng chưa trả `trace`, trong khi UI duyệt `data.trace` để giải thích quyết định. Kết quả là màn giải thích quyền có thể sai hoặc lỗi render.

### P0 — Xoá phạm vi dữ liệu bị lệch contract giữa UI, adapter và server

- UI chỉ hiện nút xoá khi scope item có `id`.
- `get_access_profile` hiện không trả `id` cho scope item.
- Adapter gọi `remove_user_permission` chỉ với `{ name }`.
- Server lại yêu cầu `user`, `allow`, `for_value`, `applicable_for`.

Vì vậy luồng thêm phạm vi có thể chạy nhưng luồng xoá không có contract thống nhất.

### P0 — System Manager đang là bypass toàn bộ permission service

`MetadataPermissionService` coi role `System Manager` như Administrator và bỏ qua DocPerm, User Permission, field permission và share. Đây có thể là chủ ý tương thích, nhưng hiện chưa được mô tả thành contract quản trị tenant và chưa có bảo vệ last-admin/self-escalation đầy đủ.

### P1 — Hai nguồn quyền DocType có thể trôi nhau

Một số DocType dùng static permission matrix, các DocType khác dùng metadata DocPerm; permission service thử static trước rồi metadata/share fallback. Cần định nghĩa rõ nguồn authoritative cho từng loại và test không để cùng DocType có hai ma trận mâu thuẫn.

### P1 — Scope hierarchy chưa có semantics hoàn chỉnh

`hide_descendants` được lưu và trả về API nhưng evaluator hiện chỉ so khớp chính xác giá trị Link. Không có contract cho cây Company/Branch/Territory/Warehouse, không có phép mở rộng descendants và không có test chứng minh cờ này có hiệu lực.

### P1 — Tạo người dùng và gán role chưa atomic

Endpoint tạo user ghi tài khoản trước, sau đó thay role grants bằng lời gọi D1 riêng. Nếu gán role thất bại, tài khoản đã tồn tại nhưng không có trạng thái hoàn chỉnh như API mô tả.

### P1 — Audit trail quản trị quyền chưa được chứng minh

Role grant, enable/disable user, reset password và User Permission thay đổi quyền truy cập đáng kể. Audit hiện tại chưa có contract bắt buộc về actor, thời điểm, before/after, reason và nguồn request cho các thay đổi này.

## 3. Mục tiêu

1. Một permission evaluator server-side duy nhất quyết định quyền hiệu lực.
2. Giải thích quyền cho chính mình hoặc người khác phải dùng đúng actor đích và cùng evaluator thật.
3. Role trả lời “được làm gì”; User Permission trả lời “trên dữ liệu nào”; share không được mở rộng vượt quá giới hạn dữ liệu đã áp.
4. List, count, form read/write, workflow, report, export, print, search, attachment và app action đều fail-closed.
5. Quản trị người dùng, role và scope có contract API nhất quán, audit được và không để trạng thái nửa vời.
6. Thay đổi role/disable user có hiệu lực ngay trên request kế tiếp.
7. Không phá tương thích ứng dụng đã cài hoặc tự bật hành vi production.

## 4. Không nằm trong phạm vi

- SSO, OAuth enterprise, SAML, SCIM hoặc LDAP.
- MFA và recovery code.
- Quản trị Cloudflare secrets hay production deployment.
- Trình thiết kế hierarchy tổng quát cho tổ chức.
- Cho phép sửa trực tiếp DocPerm do app sở hữu nếu chưa chọn quyết định D2.
- Thay đổi quyền nghiệp vụ FIFO Purchase Receipt đang được làm trên branch khác.

## 5. Actor

### Platform Administrator

Quản trị hạ tầng nhiều tenant. Không được xuất hiện như một role nghiệp vụ do client tự gán.

### Tenant Access Administrator

Mặc định hiện tại là `Administrator`, role `Administrator` hoặc `System Manager`. Có thể quản lý user, role grant, data scope, reset password và xem giải thích quyền của người khác.

### App Publisher / Installer

Khai role và DocPerm trong manifest/brief. Không mặc nhiên có quyền vào dữ liệu tenant.

### Department Manager

Có quyền duyệt/submit/cancel trong phạm vi module và dữ liệu được gán, nhưng không mặc nhiên quản trị user hay metadata.

### End User

Thực hiện nghiệp vụ theo role, DocPerm, workflow, field permission, scope và share hiệu lực.

### Auditor

Đọc ma trận và lịch sử thay đổi quyền theo policy; không được tự sửa quyền.

## 6. Thực thể và ownership

| Thực thể | Nguồn sở hữu | Quy tắc |
|---|---|---|
| User | Tenant | Không xoá vật lý nếu đã sở hữu chứng từ; disable để thu hồi truy cập |
| Role | Platform/app/tenant theo quyết định | Role grant phải tham chiếu role tồn tại và chưa disabled |
| User Role Grant | Tenant | Thay đổi có hiệu lực request kế tiếp |
| DocPerm | App metadata hoặc platform static | Mỗi DocType phải có một nguồn authoritative rõ ràng |
| User Permission | Tenant | Giới hạn theo Link value và applicable DocType |
| Document Share | Tenant/document | Chỉ mở read/write/share được khai; không vượt scope |
| Workflow Permission | App metadata | Server suy transition và target state |
| Effective Decision | Server runtime | Không lưu từ client; có trace an toàn cho quản trị |
| Permission Audit Event | Tenant | Append-only, không chứa mật khẩu hoặc secret |

## 7. Bất biến bảo mật

1. Mặc định từ chối khi thiếu metadata, role, tenant hoặc evaluator gặp lỗi.
2. Không tin `user`, `roles`, `tenant_id`, owner hoặc capability do browser gửi.
3. Gateway phải strip identity header không tin cậy; Tenant Worker phải kiểm chữ ký trusted identity.
4. Không request nào được đọc hoặc ghi dữ liệu tenant khác.
5. Password field không được trả qua document, print, report hoặc export.
6. Field `permlevel` phải áp cho cả read redaction và write diff.
7. User Permission áp cho read và mutation; share không được bypass User Permission.
8. Search index chỉ sinh candidate; từng hit phải kiểm read lại.
9. Attachment upload/delete phải kiểm quyền document tương ứng.
10. UI ẩn nút chỉ là usability; server vẫn kiểm từng action.
11. Mọi mutation nghiệp vụ tiếp tục qua DocumentKernel/DO.
12. Thay role, disable user, đổi mật khẩu hoặc thu hồi session phải có hiệu lực tức thời theo session/role contract.

## 8. Ma trận quản trị truy cập

| Hành động | Chính mình | Tenant Access Admin | Department Manager | End User |
|---|---:|---:|---:|---:|
| Xem access profile bản thân | Có | Có | Có | Có |
| Xem access profile người khác | Không | Có | Không | Không |
| Kiểm tra quyền hiệu lực người khác | Không | Có | Không | Không |
| Liệt kê user tenant | Không | Có | Không | Không |
| Tạo/disable user | Không | Có | Không | Không |
| Gán/bỏ role | Không | Có | Không | Không |
| Thêm/xoá data scope | Không | Có | Không | Không |
| Reset mật khẩu người khác | Không | Có | Không | Không |
| Đổi mật khẩu bản thân | Có, cần mật khẩu cũ | Có | Có | Có |
| Thu hồi session bản thân | Có | Có | Có | Có |
| Sửa app-owned DocPerm | Không | Theo D2 | Không | Không |
| Xem permission audit | Theo role audit | Có | Tuỳ policy | Không |

## 9. Luồng nghiệp vụ và failure path

### 9.1 Tạo user

1. Admin nhập login, tên, email, password ban đầu và role.
2. Server validate login, password và toàn bộ role trước khi ghi.
3. User và role grant phải commit atomic; nếu bất kỳ bước nào lỗi thì không tạo user.
4. Không ghi plaintext password vào audit/log.
5. Kết quả trả user, role, enabled và audit event id.

### 9.2 Gán role

1. Admin mở user hiện có.
2. Server xác minh target user và role tồn tại.
3. Chặn bỏ access admin cuối cùng hoặc tự tước quyền khiến tenant mất đường quản trị, theo D1.
4. Thay grants atomic, ghi before/after và actor.
5. Request tiếp theo của target dùng role mới.

### 9.3 Thêm/xoá data scope

1. Admin chọn allow doctype, value và optional applicable doctype.
2. Server xác minh value tồn tại và target DocType có Link phù hợp.
3. API trả identity ổn định của scope hoặc dùng composite key thống nhất.
4. Xoá phải nhận đúng cùng contract, idempotent và ghi audit.
5. Scope evaluator áp đồng nhất cho list/count/read/write/report/export/search.

### 9.4 Giải thích quyền

1. Caller không truyền user: tính cho actor hiện tại.
2. Caller truyền user khác: bắt buộc Tenant Access Admin.
3. Server tải target user và role trực tiếp từ user store; không nhận role mô phỏng từ client.
4. Dùng đúng permission evaluator để trả capabilities và trace.
5. Trace không tiết lộ role/permission của tenant khác, secret hoặc field bị mask.
6. Nếu document nằm ngoài scope của target, trả deny explanation mà không trả document data nhạy cảm.

### 9.5 Disable user / reset password

- Disable tăng session epoch và từ chối mọi request tiếp theo.
- Reset password người khác chỉ dành cho admin, không cần mật khẩu cũ nhưng thu hồi toàn bộ session target.
- Không cho tự disable tài khoản hiện tại.
- Phải bảo vệ access admin cuối cùng.

### 9.6 App install/update

- Role và DocPerm do app khai được validate trước commit.
- Không tạo role “mồ côi”, permission trỏ DocType không tồn tại hoặc hai nguồn authoritative cho một DocType.
- Update app không được âm thầm xoá role grant đang dùng mà không có migration/report rõ ràng.

## 10. Acceptance criteria và test bắt buộc

### Server/unit

- `explain_permission(user=B)` dùng role/scope của B, không dùng actor admin.
- Non-admin gọi explain cho B nhận `PermissionError`.
- Explain trả `trace` và capability từ cùng evaluator.
- Add rồi remove User Permission round-trip qua cùng contract.
- `hide_descendants` hoặc được implement/test theo D3, hoặc bị từ chối rõ thay vì lưu no-op.
- Share write không bypass User Permission.
- Field permlevel chặn write và redacts read.
- Static/metadata authority conflict bị validate hoặc có precedence test rõ.
- Tạo user + role atomic; role lỗi không để lại user.
- Không thể disable/tước role access admin cuối cùng.
- Role change và disable có hiệu lực request kế tiếp.
- Cross-tenant user/role/scope/document lookup luôn bị từ chối.

### API/integration

- List và count trả cùng phạm vi.
- Read, save, submit, cancel, amend, delete kiểm đúng action/document state.
- Report/export/print/search/link search không trả dòng ngoài scope.
- Upload/delete attachment kiểm document access.
- Workflow không cho client tự chọn next state và chặn self-approval khi cấu hình.
- App callback chỉ có quyền của actor đã ký, không có quyền riêng của app.

### Client/browser

- Permission Center chỉ mở cho access admin và API vẫn từ chối truy cập trực tiếp của non-admin.
- Chọn user khác trong CheckPanel hiển thị đúng role/scope/capability của user đó.
- Không có crash khi `trace` rỗng hoặc endpoint lỗi.
- Add/remove scope cập nhật giao diện sau refresh.
- Disable user hiển thị rõ và session target bị từ chối.
- Role matrix app-owned là read-only theo D2.
- Desktop/mobile không làm mất nút quản trị quan trọng hoặc che cảnh báo.

### Gate

- Targeted tests PASS.
- Root test, typecheck và build PASS trên exact HEAD.
- CI exact HEAD xanh.
- Không production deploy từ branch này.

## 11. Kế hoạch slice sau khi BRD được duyệt

### Slice A — Sửa contract hiện có

- Sửa explain selected-user và trace.
- Chuẩn hoá add/remove User Permission.
- Thêm contract tests adapter ↔ API.

### Slice B — Hardening quản trị

- Atomic create user + role.
- Last-admin/self-escalation guard.
- Permission audit event append-only.

### Slice C — Evaluator completeness

- Chốt static-vs-metadata authority.
- Chốt hierarchy semantics.
- Phủ report/export/print/search/files/actions bằng tests.

### Slice D — UI và QA

- Sửa Permission Center theo contract mới.
- Hiển thị trace, guard và lỗi có thể hành động.
- Browser QA desktop/mobile.

### Slice E — CI/staging

- Exact-head CI.
- Staging với user đại diện từng role và data scope.
- Không deploy production nếu chưa có approval riêng.

## 12. Quyết định cần duyệt trước G2

### D1 — Quyền của System Manager

- **A — Giữ full tenant superadmin để tương thích**, nhưng thêm last-admin, self-lockout, audit và test rõ ràng.
- B — Tách `Access Manager` khỏi `System Manager`; System Manager quản metadata nhưng không bypass dữ liệu.

Đề xuất: **A** trong đợt này để tránh phá tenant hiện có; thiết kế tách role là migration riêng.

### D2 — Ai sở hữu DocPerm

- **A — App/platform sở hữu, Permission Center chỉ đọc.** Muốn đổi phải sửa brief/manifest và cài phiên bản mới.
- B — Cho tenant override DocPerm bằng lớp overlay có migration, audit và conflict policy.

Đề xuất: **A**. Overlay quyền là một nguồn thứ ba và rất dễ biến cập nhật app thành trò đoán ý người tiền nhiệm.

### D3 — Hierarchy scope

- **A — Exact-value scope trong đợt này; từ chối `hide_descendants=true` cho tới khi có hierarchy contract.**
- B — Implement descendant expansion ngay cho từng cây Company/Branch/Territory/Warehouse.

Đề xuất: **A**. Lưu một cờ không có tác dụng còn nguy hiểm hơn không có cờ.

## 13. Definition of done

- Ba quyết định D1–D3 được duyệt.
- Implementation plan G2 liên kết từng yêu cầu với file và test.
- Không còn mismatch explain-user, trace hoặc remove-scope.
- Permission tests phủ tenant, role, scope, share, field, workflow và các read surfaces.
- Test/typecheck/build và CI exact HEAD PASS.
- `CURRENT_STATUS.md` và `NEXT_TASKS.md` cập nhật bằng commit SHA và blocker còn lại.
