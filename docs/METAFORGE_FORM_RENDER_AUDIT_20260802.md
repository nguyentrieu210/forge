# MetaForge Form Rendering Audit — 2026-08-02

Branch: `review/metaforge-form-render-audit-20260802`
Base reviewed: `main@2b10626bacb2f96487b24ec8ba4551ab49fa4eb0`
Scope: client-side metadata-to-form rendering only. No Cloudflare deploy, production mutation, secret/DNS change, or runtime code change.

## Score

**82/100 — tốt, nhưng chưa đủ để gọi là canonical Meta-driven form renderer hoàn chỉnh.**

| Hạng mục | Điểm |
|---|---:|
| Canonical metadata / single source of truth | 14/20 |
| Permission + field-state runtime | 14/15 |
| Save / lifecycle / conflict integrity | 14/15 |
| Layout + desktop UX density | 11/15 |
| Quick / Full consistency | 5/10 |
| Reactivity + performance | 9/10 |
| Accessibility + error recovery | 5/5 |
| Extensibility / control registry | 5/5 |
| Focused renderer tests / evidence | 5/5 |
| **Tổng** | **82/100** |

## Điểm mạnh đã xác nhận

1. `client/packages/views/src/form/FormView.tsx`
   - Data-driven từ `resolveMeta`, không hardcode nghiệp vụ theo DocType.
   - React Hook Form + Zod cho required field động.
   - `depends_on`, `mandatory_depends_on`, `read_only_depends_on`, Dynamic Link và `fetch_from` phản ứng theo giá trị hiện tại.
   - Chỉ watch các field thật sự điều khiển metadata/link thay vì `watch()` cả form; Child Table mới theo dõi full document khi cần parent context.
   - Có conflict banner, dirty guard, Ctrl/Cmd+S, beforeunload guard, validation summary và focus đúng tab/field lỗi.

2. `client/packages/core/src/meta/resolver.ts`
   - Field state tách rõ `hidden | masked | locked | editable`.
   - `masked_fields` từ server là authoritative.
   - Permission permlevel, docstatus, `allow_on_submit`, `forceReadOnly` được áp fail-closed ở UX; server vẫn là security boundary.

3. `client/packages/views/src/container/FormContainer.tsx`
   - Effective capabilities lấy từ server, mặc định `NO_CAPS` khi chưa có kết quả.
   - Workflow dùng server transitions + `has_workflow`, không tự suy từ UI.
   - Save dùng optimistic concurrency (`modified` / conflict), mutation response được publish vào cache rồi dependent query refresh nền.
   - Delete có confirm, rename có prompt, submit preview fail-closed.

4. `client/packages/views/src/container/NewFormContainer.tsx`
   - Tách Quick (`dialog`) và Full (`page`) qua `applyFormSurface`.
   - Create gửi full authorable document, giữ default/context value, không chỉ dirty fields.
   - Có dirty cancel confirm và `Lưu & Tạo tiếp`.

5. `client/packages/core/src/app/form-profile.ts`
   - Form Profile giữ required/title/dependency cho metadata legacy.
   - Canonical `surface=internal` có helper strip riêng, mạnh hơn profile safety rule.
   - Dọn Section/Column/Tab Break rỗng sau khi lọc.

6. `client/packages/views/src/form/layout.ts` + UI CSS
   - Field width có `full | half | third`; CSS dùng lưới 6 cột và container query, nên responsive theo vùng form thay vì viewport toàn trang.
   - Table/Text Editor/Code/Long Text full-width; field ngắn dùng third-width.

## Finding High — canonical visibility boundary chưa áp đồng nhất

### H1. Existing Form không chạy `applyFormSurface(..., "expanded")`

`NewFormContainer` dùng:

`useFormMeta -> applyFormSurface -> FormView`

Nhưng `FormContainer` hiện dùng:

`useFormMeta -> FormView`

Do đó helper `stripInternalSurface()` không nằm trên đường render bản ghi đã tồn tại.

Hậu quả:

- Contract của PR #164 tuyên bố `surface=internal` là hard visibility boundary, nhưng runtime Full Form hiện chưa thực thi boundary đó ở mọi đường render.
- Trường canonical explicit `surface="internal"` nhưng `editMode` không phải `hidden` có thể vẫn được đưa tới `resolveMeta` và render ở existing form.
- Server permission/server enforcement vẫn là chốt bảo mật cuối, nên đây chủ yếu là lỗi contract/visibility và nguy cơ lộ field nội bộ, không phải bằng chứng bypass server authorization.

**Mức:** High.

**Cần sửa:** tạo một pipeline render meta duy nhất và bắt cả `FormContainer` lẫn `NewFormContainer` dùng nó.

## Finding High — `viewPolicy.form/quickEntry` chưa là nguồn sự thật runtime

Canonical compiler tại `server/scripts/lib/canonicalize-app-source.mjs` sinh:

- `viewPolicy.form.enabled/fields`
- `viewPolicy.quickEntry.enabled/fields`
- `surface=quick|expanded|internal`

Client đã có type `DocTypeViewPolicy`, nhưng form runtime hiện lọc bằng `FormProfile` + `surface`; không có bằng chứng trong đường render đã review rằng:

- `viewPolicy.form.fields` quyết định field Full Form;
- `viewPolicy.quickEntry.fields` quyết định field Quick Form;
- `viewPolicy.form.enabled=false` chặn form;
- `viewPolicy.quickEntry.enabled=false` chặn quick dialog/fallback sang page.

`server/tests/meta-view-policy.test.mjs` hiện khóa parser/round-trip semantics, chưa khóa việc Form runtime thực thi policy.

**Mức:** High về kiến trúc Meta-driven, Medium về lỗi người dùng hiện tại.

**Cần sửa:** một helper kiểu `applyFormViewPolicy(meta, mode)` dùng `viewPolicy` trước, `surface` làm canonical fallback/compatibility, legacy FormProfile là overlay có giới hạn.

## Finding Medium — layout đang opinionated hơn metadata Frappe

`layout.ts` đọc `Tab Break`, `Section Break`, `Column Break`, nhưng `layoutColumns()` cuối cùng flatten mọi column thành một danh sách để FormView tự xếp theo width class.

Điều này cho UX dày và sạch hơn với metadata cũ, nhưng không còn bảo toàn hoàn toàn ý đồ `Column Break` của tác giả DocType. Trong khi `client/package.json` mô tả MetaForge là engine copy hành vi Frappe/ERPNext Desk, hai mục tiêu đang hơi lệch nhau.

**Cần chốt sản phẩm:**

- Nếu mục tiêu là Frappe fidelity: tôn trọng Column Break và cho `form_width` override trong cột.
- Nếu mục tiêu là MISA-style/opinionated ERP: giữ flatten nhưng ghi rõ contract rằng `Column Break` chỉ là hint, `form_width`/view policy mới là layout source of truth.

## Finding Medium — width ceiling và comment/code lệch nhau

`FormView.tsx` comment nói trần an toàn nên là `96rem`, nhưng code thực tế đang là `max-w-[72rem]`.

Với chứng từ có bảng con rộng, workspace lớn có thể vẫn chừa vùng trống ngang và ép bảng sớm hơn mong muốn. Đây không phải lỗi dữ liệu nhưng ảnh hưởng cảm giác form ERP trên desktop lớn.

## Finding Medium — test chưa khóa đúng hai gap kiến trúc

Hiện có:

- `form-profile-selfcheck.ts`: test trực tiếp `applyFormSurface` và internal stripping.
- `meta-view-policy.test.mjs`: test server parser giữ viewPolicy semantics.
- MetaForge workspace E2E và Alumdoor browser QA ở CI.

Thiếu test ở đúng composition boundary:

1. Existing `FormContainer` không render canonical internal field.
2. `viewPolicy.form.fields` override được Full Form.
3. `viewPolicy.quickEntry.fields/enabled` override Quick Form.
4. Legacy metadata không có canonical policy vẫn render theo compatibility rule.
5. Quick và Full cùng DocType không drift required/dependency/layout.

## Remediation đề xuất

### P0 — thống nhất form meta pipeline

Tạo helper duy nhất, ví dụ `resolveRenderableFormMeta(meta, mode, profile?)`:

1. Bắt đầu từ raw authoritative meta.
2. Áp app FormProfile như legacy/app overlay nếu có.
3. Áp `viewPolicy.form` hoặc `viewPolicy.quickEntry` nếu canonical policy tồn tại.
4. Dùng `surface` để kiểm canonical field membership/fallback.
5. Strip `surface=internal` ở bước cuối, không cho required/title/dependency kéo ngược trở lại.
6. Prune layout break rỗng.
7. Trả cả trạng thái `enabled` để route/dialog biết có được render hay phải fallback.

Cả `FormContainer` và `NewFormContainer` phải dùng cùng helper.

### P0 — test composition boundary

Thêm client selfcheck/component test cho existing + new form bằng cùng canonical DocType có:

- quick field;
- expanded field;
- required internal server-owned field;
- explicit `viewPolicy.form.fields` và `quickEntry.fields` khác default;
- `enabled=false` case.

### P1 — chốt contract layout

Chọn một trong hai hướng:

- Frappe fidelity: preserve Column Break semantics;
- MetaForge ERP layout: document rõ Column Break là hint, field width/viewPolicy là authoritative.

Sau đó khóa desktop 1366/1440/1920 và phone bằng screenshot/E2E cho form có header fields + child table.

## Kết luận

Renderer hiện tại đủ tốt để tiếp tục dùng và có nhiều phần runtime chắc hơn một renderer CRUD thông thường: permission fail-closed, workflow server-authoritative, conflict handling và selective reactivity đều tốt.

Nhưng trước khi tuyên bố MetaForge Form là canonical Meta-driven hoàn chỉnh, cần xử lý hai High finding: **một pipeline cho existing/new form** và **runtime phải thực thi `viewPolicy` thay vì chỉ parse/type nó**.
