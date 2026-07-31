# RBAC AND DATA-SCOPE IMPLEMENTATION PLAN

Trạng thái: **APPROVED — G2 implementation plan; Slice A gate queued**  
Ngày: **2026-07-31**  
Branch: `feat/rbac-permission-completion-20260731`  
BRD: `server/docs/RBAC-PERMISSION-BRD.md`

## 1. Quyết định đã duyệt

Người sở hữu dự án đã duyệt các phương án được đề xuất trong BRD:

- **D1=A:** `Administrator`, role `Administrator` và `System Manager` tiếp tục là tenant superadmin để giữ tương thích. Đợt này phải bổ sung last-admin guard, self-lockout guard, audit và test. Việc tách `Access Manager` là migration riêng, không lén thay semantics đang chạy.
- **D2=A:** DocPerm do app/platform sở hữu. Permission Center chỉ đọc; thay đổi quyền phải đi qua brief/manifest và cài phiên bản app mới.
- **D3=A:** User Permission chỉ có semantics exact-value. API từ chối `hide_descendants=true` cho tới khi có hierarchy contract và test riêng.

Không có quyết định nào trong tài liệu này cho phép deploy production, sửa Cloudflare secrets hoặc bật FIFO.

## 2. Mục tiêu G2

Chia thay đổi thành các slice nhỏ, mỗi slice có contract, test và rollback rõ ràng. Không trộn sửa API P0 với migration/audit lớn trong một commit duy nhất, vì một commit bảo mật khổng lồ là cách rất hiệu quả để review biến thành nghi lễ.

## 3. Kiến trúc đích

### 3.1 Target actor an toàn

Thêm một helper server-side để resolve actor dùng cho introspection:

1. Không có `user`: dùng `context.actor`.
2. Có `user` trùng actor: dùng actor hiện tại.
3. Có `user` khác: bắt buộc tenant superadmin.
4. Tải user, trạng thái enabled và roles trực tiếp từ `D1UserStore` trong đúng tenant.
5. Không nhận roles, tenant hoặc enabled từ client.
6. User không tồn tại hoặc disabled trả lỗi rõ; không rơi về actor admin.

Helper này chỉ dùng cho API giải thích/quản trị. Nó không thay actor của mutation nghiệp vụ.

### 3.2 Một evaluator, hai đầu ra

`MetadataPermissionService` tiếp tục là authority. Bổ sung API giải thích trả:

- decision cho từng capability;
- read scope hiệu lực;
- User Permission constraints;
- trace đã làm sạch, gồm nguồn luật, effect `allow|deny`, nhãn và chi tiết không nhạy cảm.

Trace phải được sinh từ cùng các bước evaluator dùng để quyết định, không viết một bộ luật song song trong router hoặc client.

### 3.3 Identity của User Permission

Chọn composite key canonical:

`user + allow_doctype + allow_name + applicable_for_doctype`

Wire contract trả object đầy đủ và một `id` ổn định được encode từ composite key. API xoá chấp nhận object canonical; trong giai đoạn tương thích có thể nhận `id`, decode rồi gọi cùng service. Không dùng tên bản ghi giả hoặc `name` mơ hồ.

Add/remove phải idempotent:

- add cùng key cập nhật cờ hợp lệ;
- remove key không tồn tại trả `removed:false`, không biến thành 500;
- profile sau refresh trả đúng cùng identity.

### 3.4 Exact-value scope

- `hide_descendants=true` bị từ chối với `ValidationError` có thông điệp hành động được.
- Evaluator chỉ so exact Link values.
- Share chỉ cấp quyền document action, không bỏ qua User Permission.
- List/count/read/write/report/export/search/print dùng cùng constraint semantics.

### 3.5 Quản trị user atomic và có guard

- Validate toàn bộ roles trước khi ghi user.
- Tạo user và role grants trong một D1 batch/transaction boundary.
- Thay role grants atomic.
- Không cho disable hoặc tước quyền tenant superadmin cuối cùng.
- Không cho actor tự disable.
- Tự tước role quản trị chỉ được phép khi vẫn còn một tenant superadmin enabled khác.
- Role change và disable có hiệu lực ở request kế tiếp theo cơ chế đọc role/session epoch hiện tại.

### 3.6 Audit append-only

Thêm bảng audit tenant-scoped, dự kiến migration append-only `0030_rbac_audit.sql`, chứa tối thiểu:

- event id;
- tenant id;
- event type;
- actor user id;
- target user id nếu có;
- before/after JSON đã làm sạch;
- reason/source;
- trace id;
- created_at.

Event bắt buộc cho:

- user create;
- user enable/disable;
- role replacement;
- User Permission add/remove;
- password reset;
- session revoke.

Không ghi plaintext password, password hash, cookie, token, secret hoặc trusted identity envelope.

## 4. Slice triển khai

## Slice A — Sửa contract P0, chưa migration

### Server

File chính:

- `server/packages/frappe-api/src/router.ts`
- `server/packages/frappe-model/src/permission.ts`
- `server/packages/frappe-model/src/types.ts` nếu cần DTO trace nội bộ

Thay đổi:

1. Resolve target actor đúng tenant cho `explain_permission`.
2. Non-admin không được mô phỏng user khác.
3. Refactor capability calculation nhận actor đích thay vì đóng cứng `context.actor`.
4. Trả `trace` fail-closed từ permission service.
5. Chuẩn hoá shape User Permission trong access profile.
6. Từ chối `hide_descendants=true`.
7. Chuẩn hoá remove User Permission theo composite key/id canonical.

### Client

File chính:

- `client/packages/core/src/**` nơi khai `EffectivePermissionResult` và access DTO
- `client/packages/adapter-frappe/src/adapter.ts`
- `client/packages/adapter-frappe/src/frappe-adapter.ts`
- `client/packages/views/src/access/PermissionCenter.tsx`

Thay đổi:

1. DTO trace không optional trong kết quả thành công; UI vẫn dùng fallback `[]` để chống response cũ.
2. Scope item luôn có identity ổn định.
3. Remove gửi contract canonical, không gửi `{name}`.
4. Check Panel hiển thị user được mô phỏng và không crash khi trace rỗng.
5. Lỗi permission/validation hiển thị được hành động tiếp theo.

### Test bắt buộc

- admin explain user B dùng roles/scope B;
- non-admin explain B bị từ chối;
- user B không tồn tại/disabled không rơi về admin;
- add → profile refresh → remove → profile refresh;
- remove lần hai idempotent;
- `hide_descendants=true` bị từ chối;
- client adapter request shape khớp server;
- UI render khi trace `[]`.

**Gate A:** targeted server/client tests và typecheck các package sửa phải PASS trước Slice B.

## Slice B — Atomic admin operations, guards và audit

### Migration/store

File dự kiến:

- `server/migrations/tenant/0030_rbac_audit.sql`
- `server/packages/auth/src/user-store.ts`
- store/service audit mới dưới `server/packages/auth` hoặc package permission phù hợp

Thay đổi:

1. Bảng audit append-only và index theo tenant/time/target.
2. Service đếm enabled tenant superadmin trong cùng primary session.
3. Atomic create user + role grants.
4. Atomic replace roles + last-admin guard.
5. Disable + epoch bump + guard trong cùng boundary.
6. Audit ghi cùng batch với mutation quyền khi D1 cho phép; nếu không cùng batch được thì mutation phải thất bại, không chấp nhận “quyền đã đổi nhưng audit mất”.

### API

- Các endpoint create user, set roles, add/remove scope, set enabled, reset password và revoke session gọi service quản trị chung.
- `requireMetadataAdmin` được đổi tên hoặc bọc bằng khái niệm tenant access admin rõ hơn; semantics D1 vẫn giữ nguyên.

### Test bắt buộc

- role invalid không để lại user;
- create user + role cùng commit;
- không disable admin cuối cùng;
- không tước role admin cuối cùng;
- self-disable bị chặn;
- self-demote được phép khi còn admin khác;
- audit before/after đúng tenant;
- audit không chứa password/hash/token;
- cross-tenant target không thể lookup hoặc mutate.

**Gate B:** migration SQL tests, targeted Workerd tests và server typecheck PASS.

## Slice C — Evaluator completeness

File chính:

- `server/packages/frappe-model/src/permission.ts`
- `server/packages/policy/src/index.ts`
- list/report/search/print/file/app-action call sites liên quan

Thay đổi:

1. Mỗi DocType có đúng một nguồn authoritative: static hoặc metadata.
2. Nếu static và metadata cùng khai khác nhau, installer/validator báo conflict rõ thay vì fallback mơ hồ.
3. User Permission áp đồng nhất cho list/count/read/write/report/export/search/print.
4. Share không vượt User Permission.
5. Field permlevel redaction và write-diff giữ fail-closed.
6. Attachment upload/delete và app action kiểm đúng document/action.

Test ma trận theo actor:

- Administrator/System Manager;
- manager module;
- user module;
- owner-only role;
- shared-only user;
- scoped user;
- user nhiều scope cùng loại và khác loại;
- user tenant khác.

**Gate C:** root server tests và contract tests PASS.

## Slice D — UI và browser QA

File chính:

- `client/packages/views/src/access/PermissionCenter.tsx`
- adapter/core DTO liên quan
- Playwright/e2e Forge suite

Thay đổi:

1. Hiển thị rõ “đang kiểm tra quyền của X”.
2. Trace có nguồn luật, allow/deny và chi tiết ngắn.
3. Role matrix tiếp tục read-only, chỉ rõ app/platform là nguồn.
4. Scope add/remove giữ đúng sau reload.
5. Last-admin/self-lockout lỗi có thông điệp cụ thể.
6. Reset password/disable cảnh báo session bị thu hồi.
7. Desktop/mobile không tràn bảng hoặc mất thao tác chính.

**Gate D:** client test/typecheck/build và browser smoke PASS.

## 5. Thứ tự commit đề xuất

1. `fix(rbac): evaluate permissions for selected user`
2. `fix(rbac): unify user-permission identity and removal`
3. `feat(rbac): add atomic access administration and audit`
4. `test(rbac): cover scope, share, field and tenant isolation`
5. `fix(ui): harden permission center contracts`
6. `docs(rbac): record verification and remaining gaps`

Không squash trong lúc review nếu việc giữ các boundary trên giúp truy nguyên lỗi. Chỉ squash khi merge policy yêu cầu và commit message cuối vẫn ghi đầy đủ migration/contract.

## 6. Gate tổng

### G1 — Requirements

**PASS** với D1=A, D2=A, D3=A.

### G2 — Implementation plan

**PASS** khi tài liệu này được commit và PR ghi đúng decisions/gates.

### G3 — Local verification

Bắt buộc:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run test
pnpm.cmd run typecheck
pnpm.cmd run build
```

Cộng targeted tests của từng slice.

### G4 — Exact-head CI

Workflow test/typecheck/build phải PASS trên đúng SHA triển khai, không dùng run của base hoặc commit tài liệu trước đó.

### G5 — Staging/browser QA

Dùng tenant staging và user đại diện. Không dùng production làm nơi phát hiện contract sai.

## 7. Rollback và rollout

- Slice A có thể rollback code, không migration.
- Migration audit append-only không xoá khi rollback; code cũ có thể bỏ qua bảng mới.
- Không đổi hay xoá migration đã chạy.
- Không deploy Cloudflare, tenant Worker hoặc client production nếu chưa có yêu cầu rõ ràng.
- Không sửa production secrets.
- Không bật FIFO hoặc thay đổi rollout state.

## 8. Definition of done

RBAC completion chỉ hoàn thành khi:

1. actor simulation đúng và có trace;
2. scope round-trip đúng;
3. admin operations atomic, có last-admin guard và audit;
4. evaluator nhất quán trên mọi read/write surface đã liệt kê;
5. root test/typecheck/build PASS;
6. exact-head CI PASS;
7. staging/browser QA PASS;
8. `CURRENT_STATUS.md` và `NEXT_TASKS.md` ghi exact SHA, test và lỗi còn lại.

## 9. Gate execution log

- Slice A one-shot push gate queued on **2026-07-31**.
- The gate applies only the reviewed Slice A patch, runs server tests, root typecheck and root build, and commits implementation only after every step passes.
