# Frappe Controller & Hook Compatibility Matrix

## 1. Document lifecycle

| Frappe semantic | CloudForge phase | Quy tắc parity |
|---|---|---|
| `before_insert` | `beforeInsert` | Chỉ mutation deterministic trong Unit of Work. |
| `validate` | `validate` | Có thể bổ sung lỗi/giá trị; không network side effect. |
| `before_save` | `beforeSave` | Sau permission, trước MutationPlan freeze. |
| `on_update` | `afterPersistPlan` | Side effect phải ghi outbox, không gọi trực tiếp. |
| `before_submit` | `beforeSubmit` | Validate docstatus transition và ledger preview. |
| `on_submit` | `submitPlan` | Ledger/status/outbox trong cùng batch. |
| `before_cancel` | `beforeCancel` | Kiểm downstream links/period lock. |
| `on_cancel` | `cancelPlan` | Reversal, không sửa ledger lịch sử. |
| `on_trash` | `deletePlan` | Chỉ draft/non-linked theo source rule. |
| `on_update_after_submit` | `updateAfterSubmitPlan` | Chỉ field allow-on-submit + audit. |

## 2. Framework primitives

| Frappe | CloudForge |
|---|---|
| `frappe.get_doc/new_doc` | `DocumentRepository.get/new` |
| `frappe.db.get_value/get_all` | `QueryService` + permission-aware AST |
| `frappe.db.set_value` | Cấm ngoài Unit of Work; dùng `MutationContext.patch`. |
| `frappe.throw` | Typed `DomainError`. |
| `frappe.enqueue` | Transactional outbox → Queue. |
| `frappe.publish_realtime` | Outbox → realtime DO room. |
| `frappe.flags` | Request/command context immutable. |
| `doc.db_set` | Controlled patch command; audit/permission bắt buộc. |
| transaction hooks | Outbox phases + receipt callbacks. |
| `safe_eval` | Policy/Expression DSL allowlist; Python expression không chạy trong Worker. |
| `override_doctype_class` | Versioned controller registry with one resolved implementation. |
| `doc_events` | Ordered event subscribers with deterministic pre-commit vs async post-commit split. |

## 3. Unsupported direct semantics

Monkey patch, arbitrary Python import, raw SQL trong business controller và implicit global state không được copy vào runtime Worker. Direct-port profile có thể chạy legacy code trong isolated Container bridge, nhưng canonical mutation vẫn phải quay về Command API.

## 4. Ordering

Controller registry tạo exact ordered pipeline. Hai extension cùng priority phải có deterministic app dependency order; cycle là publish error.

## 5. Test

Mỗi controller method có fixture before/after, emitted ledger/outbox, error code và source reference. Critical methods phải differential-test với upstream.
