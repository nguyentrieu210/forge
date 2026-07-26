# Source Baseline & Upgrade Policy

## 1. Baseline đã khóa

| App | Baseline | Vai trò | Ghi chú |
|---|---|---|---|
| Frappe | `v16.19.0` / `version-16` | Framework oracle | CI phải resolve full SHA từ tag. |
| ERPNext | `v16.20.0` / `version-16` | ERP oracle | Schema, controller, report, patch và test đều phải inventory. |
| HRMS | `v16.7.1` / `version-16` | HR/payroll oracle | Payroll-to-GL là critical path. |
| CRM | `v1.72.0` / `main` | CRM oracle | Official matrix hỗ trợ Frappe/ERPNext v15 và v16. |
| Insights | `v3.9.11` / `version-3` | BI behavior oracle | **Không tuyên bố native v16 compatibility.** CloudInsights port behavior độc lập với Frappe runtime version. |

## 2. Source Inventory Gate

Gate chỉ xanh khi mỗi source có:

1. Full 40-character commit SHA.
2. SHA-256 của source archive.
3. Tree manifest từ scanner.
4. Danh mục DocType/controller/hook/API/report/page/patch/test.
5. `source_path`, `source_hash`, `dependencies`, `license` cho từng artifact.
6. Disposition: `PORT`, `REIMPLEMENT`, `REPLACE`, `NOT_APPLICABLE`, hoặc waiver có lý do.

## 3. Upgrade policy

- Mỗi upstream release tạo `source-diff.json`.
- Rename/delete phải có migration mapping.
- Business-rule diff mở task bắt buộc, không tự auto-merge.
- Critical artifact không được nâng version nếu oracle cũ và mới chưa cùng xanh.
- CloudForge có thể vượt upstream về hiệu năng nhưng không được âm thầm đổi số dư, trạng thái chứng từ hoặc permission semantics.

## 4. Insights boundary

Insights v3 là nguồn hành vi BI, không phải bằng chứng rằng app chạy native trên Frappe v16. CloudInsights lấy:

- data-source semantics;
- visual query model;
- SQL/Python/workbook/chart/dashboard behavior;
- share/refresh/export behavior;

rồi triển khai bằng Cloudflare Workers + Containers/Sandboxes/Hyperdrive. Compatibility được chứng minh bằng oracle fixture, không bằng câu “cài được trên v16”.
