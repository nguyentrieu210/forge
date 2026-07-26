# Report, Print, Script & Custom Page Runtime

## 1. Report types

| Upstream type | CloudForge execution |
|---|---|
| Report Builder | Query AST → permission compiler → D1 query plan. |
| Query Report | Approved SQL/AST adapter; tenant-bound source only. |
| Script Report | TypeScript report module hoặc isolated legacy Container profile. |
| Prepared Report | Platform Workflow + object result in R2; polling/notification. |
| Dashboard Chart | Versioned chart query contract + cache key including policy version. |
| Number Card | Aggregate AST with query budget. |

Response contract giữ `columns`, `result`, `message`, `chart`, `report_summary`, `skip_total_row`, `prepared_report`, warnings và execution provenance.

## 2. Print

- Standard print schema → block renderer.
- Legacy Jinja/HTML direct-port chỉ chạy trong isolated rendering service.
- Clean-room profile dùng safe template AST, helper allowlist và CSS sanitizer.
- PDF rendering không có network mặc định; asset URL signed/allowlisted.
- Print output chứa source document version và format version để audit.

## 3. Client Script

- Không dùng `new Function` như security sandbox.
- Trusted direct-port profile: compatibility executor trong tenant-isolated Worker/Container với capability limits.
- Clean-room profile: event API typed (`onLoad`, `validate`, `fieldChange`, `refresh`, `beforeSave`) và expression DSL.
- Client script không thể vượt server permission hoặc ghi canonical data ngoài Command API.

## 4. Server Script / workflow condition

- Python source không chạy trực tiếp trong Worker.
- Supported semantics được compile/rewrite vào Expression DSL hoặc TS extension.
- Legacy mode chạy Container với no direct D1 binding; chỉ gọi capability-scoped platform API.

## 5. Custom Page / CRM Vue behavior

Custom page được inventory riêng gồm route, API calls, keyboard behavior, state transitions và permission. MetaForge có thể thay UI nhưng oracle phải giữ workflow/data side effects.

## 6. SQL/Python Insights

- SQL: read-only source credentials, timeout, row/byte limit, cancellation.
- Python/Ibis/DuckDB: Container/Sandbox scale-to-zero, sealed input dataset, output schema validation.
- Không cho notebook/runtime ghi trực tiếp ERP canonical DB.
