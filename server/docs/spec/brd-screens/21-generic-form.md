# M21 — Generic Form View

> Screen Spec Card — CloudForge Full Suite 360. Mọi dữ liệu và action đều đi qua Platform API/server policy; client chỉ mirror quyền.

## Khối 1 — Định danh
- **Tên:** Generic Form View
- **Route:** `/app/:doctype/:name`
- **Role:** read/create/write theo doc
- **Nguồn:** DocType fields, permissions, workflow, script/runtime assets
- **Product pack:** Platform/MetaForge

## Khối 2 — Layout
Three columns: sidebar, dynamic form, timeline; mobile full-screen sections.

### Khối 2b — Nghiệp vụ bắt buộc màn này
- Phân quyền row/field/action do server policy compiler chốt.
- Mọi mutation ghi audit/version; nghiệp vụ async dùng outbox/idempotency.
- List/bảng dùng cursor server-side, virtualization khi >200 rows, query budget/index-aware.
- Mobile có hành vi riêng, không chỉ co desktop.
- Offline chỉ cho action được đánh dấu sync-safe; ledger/payroll/close không submit offline.
- Lỗi hiển thị `error_code`, correlation/evidence ID; không mất draft.
- Document lifecycle deterministic
- Field permission six-state model

## Khối 3 — Component
| Component | Hành vi | Nguồn | Quyền | Trạng thái |
|---|---|---|---|---|
| `FormHeader` | Hiển thị và thao tác Form Header theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `DynamicLayout` | Hiển thị và thao tác Dynamic Layout theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `FieldRegistry` | Hiển thị và thao tác Field Registry theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `ActionBar` | Hiển thị và thao tác Action Bar theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `WorkflowBar` | Hiển thị và thao tác Workflow Bar theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `Timeline` | Hiển thị và thao tác Timeline theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |

## Khối 4 — Hành động
| Thao tác | Validate | Thành công | Lỗi |
|---|---|---|---|
| New/load/save/delete/submit/cancel/amend | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Assign/share/comment/attach | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |

## Khối 5 — Autofill / Smart defaults
- Defaults/session/fetch rules
- Dirty fields never overwritten

- Autofill chỉ ghi field chưa dirty; mọi giá trị suy ra có provenance.
- Default theo tenant/company/user/role/date/source-release; không hardcode UI.

## Khối 6 — 7 trạng thái bắt buộc
| Trạng thái | Mô tả |
|---|---|
| Loading | Skeleton đúng hình dạng màn; request có cancel/dedupe. |
| Empty | Nêu lý do + CTA đúng quyền; không coi permission-denied là empty. |
| Error | Typed error, evidence ID, retry an toàn; giữ draft/filter. |
| Offline | Banner, sync backlog; action không sync-safe bị khóa. |
| Thiếu quyền | 403/field mask; không render dữ liệu nhạy cảm. |
| Dữ liệu dài | Cursor/virtualization/async job; không tải toàn bộ. |
| In-flight | Disable duplicate; idempotency key; progress/cancel khi hỗ trợ. |

## Acceptance Criteria
- [ ] Desktop + mobile + keyboard + accessibility.
- [ ] Permission test role thấp gọi thẳng API vẫn bị chặn.
- [ ] Audit/version/outbox đúng với mutation.
- [ ] Performance budget và query plan evidence.
- [ ] Golden fixture/oracle test cho hành vi critical.
- [ ] Không mục treo, placeholder hoặc production path giả lập.

## Authoritative contract references

- Runtime/kernel: `technical/document-runtime.md`, `technical/atomic-write-protocol.md`, `technical/consistency-matrix.md`.
- Source evidence: `parity/declared-parity-manifest.json`; exact path/hash must come from scanner before source-exact claim.
- Screen-specific behavior: exact source artifact + generic document/controller runtime; non-trivial discovered controller without ledger becomes `UNMAPPED_BEHAVIOR`.
