# M14 — Performance Center

> Screen Spec Card — CloudForge Full Suite 360. Mọi dữ liệu và action đều đi qua Platform API/server policy; client chỉ mirror quyền.

## Khối 1 — Định danh
- **Tên:** Performance Center
- **Route:** `/platform/performance`
- **Role:** Platform Operator, App Author
- **Nguồn:** Worker CPU, D1 rows read/write, query plans, cache, DO, queue, R2
- **Product pack:** Platform/MetaForge

## Khối 2 — Layout
Tenant/service dashboards; slow query list; query plan; auto-index recommendations.

### Khối 2b — Nghiệp vụ bắt buộc màn này
- Phân quyền row/field/action do server policy compiler chốt.
- Mọi mutation ghi audit/version; nghiệp vụ async dùng outbox/idempotency.
- List/bảng dùng cursor server-side, virtualization khi >200 rows, query budget/index-aware.
- Mobile có hành vi riêng, không chỉ co desktop.
- Offline chỉ cho action được đánh dấu sync-safe; ledger/payroll/close không submit offline.
- Lỗi hiển thị `error_code`, correlation/evidence ID; không mất draft.
- No blind auto-index in production
- Every optimization reversible/evidenced

## Khối 3 — Component
| Component | Hành vi | Nguồn | Quyền | Trạng thái |
|---|---|---|---|---|
| `SLODashboard` | Hiển thị và thao tác S L O Dashboard theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `SlowQueryGrid` | Hiển thị và thao tác Slow Query Grid theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `QueryPlanViewer` | Hiển thị và thao tác Query Plan Viewer theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `IndexAdvisor` | Hiển thị và thao tác Index Advisor theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `CacheInspector` | Hiển thị và thao tác Cache Inspector theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `ResourceBreakdown` | Hiển thị và thao tác Resource Breakdown theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |

## Khối 4 — Hành động
| Thao tác | Validate | Thành công | Lỗi |
|---|---|---|---|
| Create index/promote field | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Invalidate cache | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Set query budget | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Run benchmark | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |

## Khối 5 — Autofill / Smart defaults
- Suggested indexes from telemetry
- Baseline comparison

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
