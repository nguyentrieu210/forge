# M00 — Platform Shell

> Screen Spec Card — CloudForge Full Suite 360. Mọi dữ liệu và action đều đi qua Platform API/server policy; client chỉ mirror quyền.

## Khối 1 — Định danh
- **Tên:** Platform Shell
- **Route:** `/`
- **Role:** mọi người dùng
- **Nguồn:** Control Plane navigation + MetaForge shell
- **Product pack:** Platform/MetaForge

## Khối 2 — Layout
**Desktop:** sidebar theo app/role, topbar tenant/environment, command palette, notification center, context drawer. **Mobile:** bottom navigation, FAB, full-screen forms, offline/update banners.

### Khối 2b — Nghiệp vụ bắt buộc màn này
- Phân quyền row/field/action do server policy compiler chốt.
- Mọi mutation ghi audit/version; nghiệp vụ async dùng outbox/idempotency.
- List/bảng dùng cursor server-side, virtualization khi >200 rows, query budget/index-aware.
- Mobile có hành vi riêng, không chỉ co desktop.
- Offline chỉ cho action được đánh dấu sync-safe; ledger/payroll/close không submit offline.
- Lỗi hiển thị `error_code`, correlation/evidence ID; không mất draft.
- Không lộ app/module không có quyền
- Tenant switch phải clear cache và session bookmark

## Khối 3 — Component
| Component | Hành vi | Nguồn | Quyền | Trạng thái |
|---|---|---|---|---|
| `AppSwitcher` | CloudERP/CloudHR/CloudCRM/CloudInsights/Platform | source contract | server-enforced | loading/empty/error |
| `TenantBadge` | tenant, environment, region, release | source contract | server-enforced | loading/empty/error |
| `CommandPalette` | route/action/document global | source contract | server-enforced | loading/empty/error |
| `NotificationBell` | unread + deep-link | source contract | server-enforced | loading/empty/error |
| `ConnectivityIndicator` | online/offline/sync backlog | source contract | server-enforced | loading/empty/error |

## Khối 4 — Hành động
| Thao tác | Validate | Thành công | Lỗi |
|---|---|---|---|
| Đổi app | giữ tenant/session/route context | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Đổi tenant | re-auth policy + clear tenant cache | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Mở command | permission-filtered | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Cài PWA | manifest hợp lệ | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |

## Khối 5 — Autofill / Smart defaults
- Khôi phục app/route gần nhất theo user+tenant
- Theme/density/ngôn ngữ từ preference

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
