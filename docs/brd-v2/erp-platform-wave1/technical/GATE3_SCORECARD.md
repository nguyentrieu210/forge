# Scorecard Cổng 3 — ERP Platform Wave 1

Ngày tự chấm: 2026-08-01. Trạng thái: **hồ sơ kỹ thuật đạt; chờ chủ dự án duyệt Cổng 3**.

| Yêu cầu Cổng 3 | Kết quả | Bằng chứng |
|---|---|---|
| Kiến trúc đúng codebase, không đoán | ✅ | `ARCHITECTURE_DECISIONS.md`; khảo sát document kernel, D1 store, Frappe router, app registry và generic client. |
| Data model/FK/unique/không trùng nguồn sự thật | ✅ | `TECHNICAL_DESIGN.md` §3; `MIGRATION_AND_OPERATIONS_PLAN.md`; external/core DocType được tái sử dụng. |
| Field Ledger 9 cột cho mọi bảng/logical DocType Wave 1 | ✅ | `field-ledgers/00_PHYSICAL_KERNEL.md`, `G03_*`, `G01_*`, `G02_*`, `G11_*`. |
| State machine cho mọi entity có status | ✅ | Cuối từng Field Ledger + 18 workflow trong Meta. |
| DocType Meta package đầy đủ | ✅ | `docs/meta/doctype-meta.json`: 19 mới + 29 external, 18 workflow, 4 report/chart/card/workspace, 16 action, 5 print, 7 notification. |
| Meta validator PASS | ✅ | `validate-doctype-meta.mjs ... --json`: `ok=true`, 0 error, 0 warning. |
| Compatibility Matrix L0–L5, không tuyên bố quá mức | ✅ | `COMPATIBILITY_MATRIX.md`: hiện tại/đích/bằng chứng/việc còn lại. |
| API route/payload/envelope/idempotency/lock | ✅ | `API_AND_SECURITY_DESIGN.md` §1 và mapping §3. |
| Permission server, scopeWhere, field mask, SoD, recent-auth | ✅ | `API_AND_SECURITY_DESIGN.md` §2/§4/§5. |
| Audit/counters/files/notification/message log/AI logs | ✅ | `TECHNICAL_DESIGN.md` §6–§7. |
| Webhook idempotent khi có e-invoice | ✅ | API G01 + migration/test contract; raw signature và claim-first. |
| 3 cron bắt buộc | ✅ | `TECHNICAL_DESIGN.md` §6: reminders, reports/controls, backup/rehearsal. |
| AI tools phủ ≥80% miền phân tích | ✅ thiết kế | 12 tool cụ thể; permission/mask/no-auto-post. Chỉ nâng L5 sau build/test. |
| Export-all có recent-auth/rate limit/private artifact | ✅ | API G11 và hạ tầng chung. |
| `/api/sync`/offline | ✅ N/A | PWA/offline bị loại; mutation khi mất mạng dừng an toàn. |
| UI map Screen Card → renderer/override, desktop/mobile riêng | ✅ | `TECHNICAL_DESIGN.md` §8 và `COMPATIBILITY_MATRIX.md` override table. |
| Palette dùng chung, không tự đặt màu | ✅ | Palette KeToan/Toka chốt trong thiết kế; brand hiện hữu sẽ được quy về token ở Pha 5. |
| TT99 đúng boundary, tách thuế/e-invoice/XML, có legal gate | ✅ | ADR-W1-004; ledger G01; transition plan; `need_legal_check`. |
| Migration additive, backup/canary/rollback/reconcile | ✅ | `MIGRATION_AND_OPERATIONS_PLAN.md`. |
| Không viết code/chạy migration trước duyệt | ✅ | Nhánh hiện chỉ thêm tài liệu/Meta; chưa sửa TS/SQL runtime, chưa migrate/deploy. |

## Kết luận tự chấm

Không còn mục kỹ thuật đỏ ở Cổng 3. Các mức L4/L5 chưa tồn tại cho object mới được ghi đúng là việc Pha 5–6, không bị dùng để đánh tráo mức hoàn thành thiết kế. Bước tiếp theo duy nhất được phép là xin chủ dự án duyệt Cổng 3; sau khi được duyệt mới chuẩn bị nhánh build và thực thi G03 → G01 → G02 → G11.
