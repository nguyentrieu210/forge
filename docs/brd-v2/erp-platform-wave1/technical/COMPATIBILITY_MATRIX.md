# Compatibility Matrix L0–L5 — ERP Platform Wave 1

## Định nghĩa mức

| Mức | Nghĩa trong Wave 1 |
|---|---|
| L0 | Đã định danh object/kind/module/dependency và Field Ledger; chưa đòi runtime. |
| L1 | Meta hợp lệ, lưu/cài được; link/field/workflow schema qua validator. |
| L2 | Generic renderer biểu đạt List/Form/Link/Tree/Kanban/Calendar/Timeline/Print cơ bản. |
| L3 | Có API đọc/ghi, scope/permission, idempotency/lock và action handler rõ ràng. |
| L4 | Workflow/report/chart/card/workspace/notification chạy end-to-end theo Meta/manifest. |
| L5 | Qua conformance + quyền trực tiếp API + browser/evidence production-like cho module đó. |

Pha 3 chỉ được tuyên bố mức hiện có bằng bằng chứng. Mức đích của Wave 1 là L5 sau Pha 6, không dùng tài liệu thiết kế để giả làm bằng chứng runtime.

## Ma trận theo năng lực

| Năng lực | Hiện tại | Đích | Bằng chứng hiện tại | Việc còn lại để lên L5 |
|---|---:|---:|---|---|
| 19 DocType mới | L1 | L5 | `docs/meta/doctype-meta.json` validator PASS | dịch Meta → AppManifest, install/upgrade/uninstall tests, runtime conformance |
| 29 external/core DocType | L3–L4 tùy object | L5 | app manifests hiện hữu; resource/list/form/workflow runtime đang có | đối chiếu field extension/permission/version, không giành ownership |
| Field type/required/readonly/mask/link | L1 + runtime nền L2 | L5 | Meta validator; client `DocTypeMeta`/Form/List/Link renderer hiện hữu | tests field-level permission, dirty guard, server validation parity |
| Naming/counters | L1 | L5 | series/field/uuid khai trong Meta; mutation receipt hiện hữu | atomic counter race tests và mapping sang manifest naming |
| List/Form/mobile cards | nền L2–L3 | L5 | generic ListContainer/FormContainer; runtime app manifest | QA 390/412/768/1280, table→card, 7 trạng thái màn hình |
| Tree Company/Branch/Department | nền L3 | L5 | external DocType + tree endpoints hiện hữu | cycle/scope/transfer tests, UI tree evidence |
| Kanban có lý do | nền L3 | L5 | `metaforge.api.kanban_move_with_comment`; 18 workflow Meta | wiring board từng DocType, browser test backward/cancel reason |
| Calendar | nền L3 | L5 | CalendarContainer/route hiện hữu; field ngày khai trong Meta | permission/drop tests và mobile/desktop screenshots |
| Workflow/approval/delegation/SoD | L1; workflow nền L3 | L5 | 18 workflow Meta; generic workflow APIs; thiết kế server guard | build policy/approver engine, four-eyes tests, direct API bypass tests |
| Reports/charts/cards/workspaces | L1; renderer nền L3 | L5 | 4 report, 4 chart, 4 card, 4 workspace hợp lệ | handlers/query allowlist, totals/drilldown/empty state conformance |
| Print/export | L1; nền L3 | L5 | 5 print definitions; print/export API hiện hữu | template build, mask/watermark/audit, PDF visual QA |
| Notifications | L1; outbox nền | L5 | 7 definitions; outbox/hook platform | adapter in-app/email/Zalo, retry/dead-letter/cron tests |
| Audit/timeline | nền L3 | L5 | version/audit/correlation hiện hữu; Audit Event virtual design | projection/query/export evidence; secret redaction tests |
| Kế toán/GL | lõi L4; Wave 1 rule L1 | L5 | document kernel, `gl_entries`, period guards, migration 0035 | TT99/rule engine, oracle, reverse/amend, period/SoD tests |
| TT99 Appendix I–IV/transition | L1 | L5 | 5 Meta objects + ledgers + migration plan | legal content signed, fixtures, preview/apply/reports conformance |
| VAT/CIT/PIT/e-invoice/XML | L1 | L5 | Legal Rule/Tax Ruleset/E-Invoice separation | official version registry, connectors, signature/webhook and filing acceptance |
| HR/payroll→GL | existing HR L3–L4; orchestration L1 | L5 | HRM/VN accounting manifests, migration 0035 | shadow payroll, input hash, SoD approval, posting/reconciliation tests |
| Backup/restore/release/incident | L1 | L5 | 5 Meta objects, operations plan | actual Cloudflare jobs, clone restore, SLO/canary/rollback evidence |
| AI assist | L0–L1 design | L5 | 12 tools có ranh giới quyền/audit | tool schema/implementation, ≥80% coverage test, no-auto-post evidence |

## Mapping Meta chuẩn → Forge runtime

| Meta chuẩn | Forge đích | Cách xử lý |
|---|---|---|
| `doctype` fields/flags/naming/permissions | `AppManifest.doctypes` + custom fields | mapper deterministic; external DocType chỉ tạo custom fields, không đổi ownership |
| `workflow` | `AppManifest.workflows` | giữ nguyên state/action/role; reason/SoD bổ sung app-method guard |
| `viewPolicy.list/form/kanban/calendar` | metadata + nav/experience + generic containers | bật view runtime đã hỗ trợ; màn chuyên sâu dùng override được liệt kê dưới |
| reports/charts/cards/workspaces | report/workspace metadata và generic renderer | query handler allowlist, không lưu arbitrary server script |
| actions | dotted app methods `erp_platform.api.*` | router platform kiểm method lõi trước, sau đó mới dispatch app Worker |
| prints | `print_formats` | template versioned, quyền/mask server |
| notifications | outbox rule + adapter config | channel string chuẩn hóa thành adapter list trong mapper |

## Component override có chủ đích

| Màn | Vì sao generic renderer chưa đủ | Hợp đồng giữ nguyên |
|---|---|---|
| Policy simulator | cần so sánh quyền trước/sau, graph SoD và rescue-path | dữ liệu qua action/query đã phân quyền; record detail vẫn generic |
| TT99 transition workbench | cần coverage, trial balance trước/sau và legal blockers | DocType Meta là source; preview không mutate |
| Posting preview | cần dòng định khoản, rule trace, warning và post gate | post chỉ qua app method idempotent/SoD |
| Payroll workbench | cần input freeze, variance và exception queue | Employee/Payroll/Slip vẫn generic; override chỉ orchestration |
| Reliability control center | cần gate/evidence/canary/SLO và incident link | ops DocType/workflows/report vẫn là source |

## Khác biệt có chủ đích so với Frappe/AppWeb mặc định

- Mỗi khách vẫn một D1 và có `tenant_id`; kernel tables chung không bị ép tiền tố hồi tố.
- Quyền DocType không sửa trực tiếp ở Permission Manager; sửa qua app package/policy versioned để cài lại không làm mất cấu hình âm thầm.
- Không chạy arbitrary server/report script; chỉ handler allowlist.
- Tiền dùng integer minor units ở kernel, không dùng float làm nguồn sổ.
- PWA, service worker, offline mutation queue, Web Push và `/api/sync` không áp dụng theo quyết định phạm vi.
- Quick Entry tắt cho 19 DocType mới vì các policy/rule/ops record cần form đầy đủ, trace và kiểm tra liên kết; các giao dịch nhập nhanh lõi giữ theo Meta của app sở hữu.
