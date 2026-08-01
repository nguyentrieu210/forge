# Bằng chứng triển khai G03 — Organization, Security & SoD

Ngày chốt: 2026-08-01

Nhánh: `feat/erp-platform-wave1-g03-20260801`

Phạm vi loại trừ: PWA, service worker, Web Push và hàng đợi offline.

## Phạm vi đã hoàn thành

- Nâng HRM lên `1.4.0`; Company, Branch và Department hỗ trợ cây tổ chức cùng liên kết company/branch/parent.
- App `erp-organization-security` gồm 5 DocType nghiệp vụ, 5 workflow, 2 mẫu in, 2 báo cáo và điều hướng tiếng Việt.
- Quyền server theo company/branch/department/owner; User Permission và Organization Assignment chỉ được thu hẹp quyền DocPerm nền.
- Role Policy có version, mô phỏng quyền, field mask/write guard, recent-auth khi publish và tăng session epoch để vô hiệu phiên cũ.
- SoD bốn mắt, approval inbox, ủy quyền có thời hạn/không mở rộng scope và kiểm tra lại ngay lúc thực thi.
- Audit query/export đã phân quyền, che dữ liệu nhạy cảm và giữ correlation/evidence cho điều tra.
- Trung tâm quyền gồm Người dùng, Vai trò, Kiểm tra quyền, Hộp duyệt và Nhật ký kiểm toán; bố cục responsive cho desktop/mobile.
- Migration `0036_organization_security_scope.sql` tạo projection/index/trigger cho scope và invalidation policy.

## Bằng chứng kiểm định

| Hạng mục | Kết quả |
|---|---|
| Verify tổng repository | PASS |
| Server/domain | 781/781 PASS |
| Tenant Worker | 138/138 PASS |
| Query Worker | 3/3 PASS |
| TypeScript server/worker/client | PASS |
| App pack/check | `erp-organization-security@1.0.0` PASS |
| Migration SQL G03 | PASS |
| Cài HRM + G03 trên D1 local qua API thật | PASS |
| Tạo Department gốc/con và đọc cây tổ chức trên D1 sạch | PASS |
| Vòng đời Durable Object: khởi tạo D1 service trong từng RPC | PASS |
| QA giao diện desktop/mobile | PASS |
| Kiểm tra whitespace/diff | PASS |

Các cảnh báo kích thước chunk và sourcemap của app mẫu đã tồn tại ở baseline, không làm fail build và không phải regression của G03.

## Quyết định phát hành

G03 đủ điều kiện merge độc lập làm nền quyền/tổ chức cho Wave 1. Chưa deploy production riêng tại mốc này vì G01 kế toán, G02 HR/payroll và G11 operational readiness còn là dependency của đợt phát hành ERP hoàn chỉnh. Sau khi bốn lát cắt xanh mới thực hiện backup → canary → migrate → smoke → production trên Cloudflare.
