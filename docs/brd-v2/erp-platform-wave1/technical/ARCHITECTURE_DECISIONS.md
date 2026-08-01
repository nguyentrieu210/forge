# Quyết định kiến trúc — ERP Platform Wave 1

## ADR-W1-001 — Giữ kiến trúc Forge, chuẩn hóa ranh giới dữ liệu

**Trạng thái:** đề xuất để duyệt tại Cổng 3.

Forge hiện không phải một app dọc độc lập. Gateway phân giải hostname khách, chuyển tiếp tới Worker tenant, mỗi khách có D1 riêng; document kernel lưu DocType trong `documents`/`document_children` và các sổ append-only riêng. Vì vậy Wave 1 không đổi lõi thành một Worker AppWeb mới và không nhân bản dữ liệu Company/Employee/Journal Entry sang bộ bảng song song.

Quyết định:

1. Giữ một D1 vật lý cho mỗi khách; thiếu hoặc sai tenant/binding phải fail-closed.
2. Route nghiệp vụ chỉ gọi `DocumentService`, `MutationStore`, `DocumentListStore`, report service hoặc app-method adapter; không gọi D1 trực tiếp.
3. Transport được che sau data-access: WFP/per-tenant binding hiện tại và D1 REST/shared-worker tương lai dùng cùng hợp đồng miền.
4. Các bảng kernel Forge sở hữu (`documents`, `document_children`, `gl_entries`, `outbox`...) tiếp tục không có tiền tố vì chúng là schema chung của chính nền tảng.
5. Bảng projection/control mới không biểu đạt được bằng DocType phải có namespace `erp_*`, `hr_*` hoặc `ops_*`; Wave 1 ưu tiên DocType và chỉ thêm projection khi đo đạc chứng minh cần thiết.
6. `tenant_id` vẫn bắt buộc trong mọi truy vấn dù mỗi khách có D1 riêng, tạo lớp bảo vệ kép và tương thích công cụ hiện hữu.

Hệ quả: không phát sinh cuộc viết lại nền tảng; app manifest và generic renderer tiếp tục là nguồn cài đặt. Sai khác với ADR-001 của AppWeb được ghi minh bạch: quy tắc “mọi bảng app có tiền tố” áp dụng cho bảng mới do gói Wave 1 sở hữu, không áp dụng hồi tố lên kernel Forge.

## ADR-W1-002 — DocType là nguồn sự thật nghiệp vụ

- Company, Branch, Department, Journal Entry, GL Entry, Payroll Entry và Salary Slip được tái sử dụng từ core/app hiện có.
- Wave 1 khai báo external DocType trong Meta package và chỉ bổ sung custom fields/versioned policy khi cần.
- Entity mới là DocType cài bằng manifest. Child row nằm trong `document_children`, không có menu/list/form độc lập.
- Meta package thiết kế tại Pha 3 là hợp đồng chuẩn hóa; Pha 5 dịch nó sang `AppManifest` hiện hữu. Nếu renderer chưa biểu đạt một thuộc tính, Compatibility Matrix phải ghi đúng mức thay vì giả vờ hỗ trợ.

## ADR-W1-003 — Ghi sổ và lịch sử là bất biến

- Chứng từ nháp có thể xóa mềm hoặc hủy theo quyền; chứng từ đã submit/post không hard delete.
- Sửa sai tài chính bằng cancel/reverse/amend; GL là append-only và liên kết `source_document_id`, `voucher_revision`, `rule_trace`, `approval_trace`.
- Tổng Nợ bằng tổng Có, tài khoản hợp lệ theo pháp nhân/chế độ/ngày hiệu lực, kỳ cho phép post và SoD được kiểm tra trong cùng mutation trước commit.
- Audit, outbox và receipt idempotency được ghi cùng giao dịch; action replay trả lại kết quả cũ.

## ADR-W1-004 — TT99 là module versioned, không phải nhãn chế độ

Với năm tài chính doanh nghiệp bắt đầu từ 01/01/2026, engine bắt buộc đánh giá TT99/2025 theo ngày bắt đầu năm tài chính và hồ sơ pháp lý đã được phê duyệt. Các module độc lập gồm danh mục văn bản, sơ đồ tài khoản/Appendix II, biểu mẫu chứng từ/Appendix I, sổ/Appendix III, báo cáo tài chính/Appendix IV và chuyển đổi từ chế độ cũ.

TT99 không tự quyết VAT, CIT, PIT, hóa đơn điện tử hoặc XML. Các miền này dùng Tax Ruleset/Legal Rule riêng theo ngày hiệu lực và luôn có `need_legal_check` cho trường hợp thiếu nguồn chính thức hoặc chưa có ký duyệt kế toán/pháp lý.

## ADR-W1-005 — Phân quyền deny-by-default và SoD ở server

- Quyền DocType nền đến từ manifest; gán role/user scope là dữ liệu tenant.
- `Organization Assignment` thu hẹp theo company/branch/department/owner; không được mở rộng quyền nền.
- `Role Policy` là lớp bổ sung versioned, chỉ dùng DSL whitelist và phải mô phỏng trước publish.
- Publish quyền, hard-lock/reopen kỳ, post JE, approve payroll và rollout release có four-eyes; người lập không tự duyệt khi SoD là `block`.
- Recent-auth bắt buộc cho thay đổi thuế/pháp nhân/quyền/break-glass.

## ADR-W1-006 — Không PWA/offline

Không tạo service worker, install/update banner, offline queue, `/api/sync`, background sync hay Web Push. Desktop và mobile vẫn có shell/layout riêng, BottomNav/FAB và trạng thái mất mạng dạng thông báo chỉ đọc; mutation khi mất mạng phải dừng, giữ dữ liệu form trong bộ nhớ phiên và cho người dùng thử lại khi có mạng.
