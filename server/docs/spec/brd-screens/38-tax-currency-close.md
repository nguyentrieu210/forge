# M38 — Tax, Currency & Period Close

> Screen Spec Card — CloudForge Full Suite 360. Mọi dữ liệu và action đều đi qua Platform API/server policy; client chỉ mirror quyền.

## Khối 1 — Định danh
- **Tên:** Tax, Currency & Period Close
- **Route:** `/erp/accounting/close`
- **Role:** Accounts Manager, Tax Manager, Auditor
- **Nguồn:** Tax templates/rules, exchange rate, revaluation, closing, consolidation
- **Product pack:** CloudERP

## Khối 2 — Layout
Tax configuration; revaluation preview; close checklist; trial balance evidence.

### Khối 2b — Nghiệp vụ bắt buộc màn này
- Phân quyền row/field/action do server policy compiler chốt.
- Mọi mutation ghi audit/version; nghiệp vụ async dùng outbox/idempotency.
- List/bảng dùng cursor server-side, virtualization khi >200 rows, query budget/index-aware.
- Mobile có hành vi riêng, không chỉ co desktop.
- Offline chỉ cho action được đánh dấu sync-safe; ledger/payroll/close không submit offline.
- Lỗi hiển thị `error_code`, correlation/evidence ID; không mất draft.
- Closed period gate
- Revaluation/reversal deterministic

## Khối 3 — Component
| Component | Hành vi | Nguồn | Quyền | Trạng thái |
|---|---|---|---|---|
| `TaxRuleStudio` | Hiển thị và thao tác Tax Rule Studio theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `ExchangeRates` | Hiển thị và thao tác Exchange Rates theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `RevaluationRun` | Hiển thị và thao tác Revaluation Run theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `ClosingChecklist` | Hiển thị và thao tác Closing Checklist theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `TrialBalance` | Hiển thị và thao tác Trial Balance theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |
| `Consolidation` | Hiển thị và thao tác Consolidation theo rule ledger và source manifest được dẫn tại “Authoritative contract references” | source contract | server-enforced | loading/empty/error |

## Khối 4 — Hành động
| Thao tác | Validate | Thành công | Lỗi |
|---|---|---|---|
| Configure tax | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Run revaluation | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Close/reopen | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |
| Consolidate | quyền + schema + trạng thái + các invariant được dẫn tại “Authoritative contract references” | cập nhật canonical data + audit/outbox | lỗi typed + retry an toàn, không mất draft |

## Khối 5 — Autofill / Smart defaults
- Jurisdiction templates
- Rates from approved provider

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
- Business behavior: `business-rules/erp/pricing-taxes.md`.
- Business behavior: `business-rules/erp/period-close-repost.md`.
