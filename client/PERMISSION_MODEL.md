# PERMISSION_MODEL — MetaForge

> Nguyên tắc: **SERVER là nguồn sự thật + ranh giới bảo mật**. Client chỉ MIRROR để UX đúng, luôn **FAIL-CLOSED**.

## 1) Effective capabilities (FAIL-CLOSED) — P0-05, mở rộng P1-PERM-01
- `adapter.getCapabilities(doctype, name?)` → `metaforge.api.get_capabilities` → server `frappe.has_permission` cho read/write/create/delete; submit/cancel/amend gated bởi `is_submittable`. Server bọc try/except → false.
- Client type `Capabilities` + hằng **`NO_CAPS`** (mọi quyền = false).
- Hook `useCapabilities` (views/container/hooks). Container (Form/NewForm/List) default **`NO_CAPS` khi đang tải/lỗi** — KHÔNG optimistic.
- Trước đây form suy quyền lạc quan từ docinfo (all-true khi thiếu) → đã thay bằng capabilities fail-closed.
- **P1-PERM-01 (review độc lập, đã sửa)** — `caps` trước đây CHỈ gate nút hành động (Lưu/Gửi/Huỷ/Xoá);
  field vẫn GÕ ĐƯỢC dù `caps.write=false` (chỉ nút Lưu ẩn, dữ liệu vẫn sửa được trên UI dù server sẽ từ
  chối lúc lưu). Nay `FormContainer` truyền `forceReadOnly={!caps.write}`, `NewFormContainer` truyền
  `forceReadOnly={!caps.create}` — feed thẳng vào `resolveMeta` (cùng cơ chế `ctx.forceReadOnly` đã có
  từ trước cho case khác), field/input bị khoá THẬT (readOnly/disabled DOM), không chỉ ẩn nút. Child
  grid tự kế thừa qua field cha (Table field cũng đi qua `resolveField` như field thường) — không cần
  code riêng. Live-verify: `TEST_REPORT.md` Phase 3 (Note, user hạn chế thật, `caps.write=false` →
  field readOnly + KHÔNG nút Lưu + server vẫn từ chối bypass trực tiếp).

## 2) Permlevel (đọc/ghi theo cấp) — resolver
`permLevelsFor(permissions, roles)` → tập permlevel user đọc/ghi được (DocPerm có role∈roles, read/write=1).
- **read**: level 0 mở được doc ⇒ đọc; level>0 cần read-perm ĐÚNG level, nếu không → **masked**.
- **write**: PHẢI có write-perm ĐÚNG permlevel — KHÔNG fallback. `{read:1,write:0}` ⇒ read-only (không phải editable).
- `docstatus`: cancelled(2) khoá hết; submitted(1) khoá trừ `allow_on_submit`.

## 3) Masked values — server AUTHORITATIVE
`masked_fields` (từ FormMeta, server áp `apply_fieldlevel_read_permissions`) là nguồn TUYỆT ĐỐI cho việc che giá trị. Resolver có suy thêm từ permlevel để UX, nhưng **giá trị thật bị che ở SERVER** — client không tự ý lộ. Control hiển thị `••••` cho field masked.

## 4) Child table — kế thừa cha
DocType con (`istable=1`) mang `permissions` RỖNG (quyền kế thừa cha). ChildGrid resolve với `assumeWritable: true` ⇒ ô con editable theo quyền GHI của form cha (grid `readOnly` đã encode quyền cha), VẪN tôn trọng `read_only`/`read_only_depends_on`/`docstatus`/`masked_fields` server. Server vẫn kiểm khi lưu (review fix H1).

## 5) Form actions — metadata + capabilities driven
`resolveFormActions(ctx)` suy nút từ: `docstatus` · `is_submittable` · `caps(create/write/submit/cancel/delete/amend)` · `hasWorkflow` · mới-vs-đã-lưu. KHÔNG hiện cứng.
- Không quyền → 0 nút.
- **Dirty-submit guard (P0-04)**: Gửi/Huỷ/Sửa đổi/workflow **khoá khi form dirty** (ép Lưu trước) — thao tác đổi trạng thái KHÔNG chạy trên snapshot chưa lưu (disable UI + guard lần 2 trong FormView).
- Workflow: nút chuyển trạng thái = **server `get_transitions`** (đã lọc state+role). FE chỉ trình bày (dedupe/label/disable), KHÔNG tự suy.
- **`hasWorkflow` — P1-WF-01 (review độc lập, đã sửa)**: trước đây `FormView` suy "có workflow" từ
  `transitions.length>0` — KHÔNG phân biệt được "doctype không có workflow" với "có workflow nhưng
  user/state hiện tại hết transition" (trạng thái cuối, hoặc không role nào khớp) — 2 case này đều cho
  `transitions=[]`, dẫn tới hiện NHẦM nút Submit/Huỷ thủ công ở case sau. `FormContainer` nay gọi
  `metaforge.api.get_workflow_transitions` (bọc `frappe.model.workflow.get_transitions` +
  `get_workflow_name` — native Frappe không tự phân biệt 2 case) trả `{has_workflow, transitions}`,
  truyền `hasWorkflow` thẳng vào `FormView` — `resolveFormActions`'s `!ctx.hasWorkflow` gate đã ĐÚNG từ
  trước (pure-tested), bug chỉ ở chỗ giá trị thật chưa từng tới nơi. Live-verify: `TEST_REPORT.md`
  Phase 4 (3 case: không-workflow/còn-transition/hết-transition-thật qua `apply_workflow` thật).

## 6) List — Create/bulk-Delete/cột (P1-PERM-01, mới)
`ListContainer` trước đây KHÔNG fetch capabilities: "Tạo mới" hiện bất kể `caps.create` (chỉ cần parent
truyền callback), bulk-delete LUÔN có mặt, cột dựng từ MỌI field `in_list_view=1` bất kể user đọc được
hay không (không lọc theo permlevel/`masked_fields`).
- `ListContainer` nay fetch `useCapabilities(doctype)` (doctype-level, giống New Form) — chỉ truyền
  `onCreate`/`onBulkDelete` xuống `ListView` khi `caps.create`/`caps.delete` tương ứng true (`ListView`
  vốn đã CHỈ render nút khi callback prop có mặt — gate hoàn toàn ở container, không cần sửa View).
- `deriveColumns(meta, { roles })` mới: loại field KHÔNG đọc được (permlevel thiếu quyền / server
  `masked_fields`) khỏi cột — dùng LẠI `resolveField` (cùng logic Form đã có), không viết lại.
- Live-verify: `TEST_REPORT.md` Phase 3 — cùng 1 user/doctype cho thấy gate 2 CHIỀU thật (Note:
  `create=true` qua rule `if_owner` → "Tạo mới" hiện; `delete=false` → bulk-delete ẩn), không phải
  "luôn ẩn hết" giả tạo.

## 7) Verify
- Contract `get_capabilities` fail-closed: verify live (Gate 1). `has_permission` server-side đã xác
  nhận qua search_link permission-filter (5 kho lá).
- **Permission fail-closed với USER HẠN CHẾ THẬT**: ✅ **VERIFIED LIVE** (Phase 1 + Phase 3, review độc
  lập) — cookie-session thật (KHÔNG token Administrator), user chỉ có role chuẩn "Desk User" trên
  doctype "Note" (role "All" cấp full CRUD trên ToDo nên không dùng được để test "hạn chế" — phát hiện
  live trước khi chốt fixture, xem `TEST_REPORT.md`). Field readOnly, List Create/Delete gate 2 chiều,
  server từ chối bypass trực tiếp — đều xác nhận qua trình duyệt thật, không phải suy luận.

## Nguyên tắc bất biến
1. Thiếu/loading/lỗi quyền ⇒ **deny** (NO_CAPS), không optimistic.
2. Server enforce; client mirror — GỒM CẢ field editability (forceReadOnly) và List affordance
   (Create/Delete/cột), không chỉ nút hành động.
3. masked_fields server thắng mọi suy luận client.
4. `hasWorkflow` là descriptor SERVER-AUTHORITATIVE riêng — không suy từ độ dài mảng transitions.
