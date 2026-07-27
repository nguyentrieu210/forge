# Theo dõi pha — SaaS quản lý bán hàng đa kênh

Luồng áp dụng: **B — module lớn trên nền Forge hiện có**.

## 7 pha và cổng

- [x] Pha 1 — Audit code + research 5 lớp; Cổng 1 được người dùng chốt Facebook/SaaS/COD và yêu cầu tiếp tục ngày 2026-07-27.
- [ ] Pha 2 — BRD toàn sản phẩm S01–S27 hoàn tất tại `docs/BRD_SOCIAL_COMMERCE_SAAS.md`; đang chờ duyệt Cổng 2.
- [ ] Pha 3 — Thiết kế kỹ thuật + API + Field Ledger; Cổng 3 cần người dùng duyệt.
- [ ] Pha 4 — Chuẩn bị nhánh/cổng kiểm tra; Cổng 4: verify chạy được.
- [ ] Pha 5 — Build slice đầu tiên theo BRD và Field Ledger.
- [ ] Pha 6 — Verify + QA quyền/cách ly/UI; Cổng 6 phải xanh.
- [ ] Pha 7 — Docs + PR/release.

## Checklist luồng B

### Intake & BRD

- [ ] Đọc tài liệu bối cảnh và cấu trúc hiện có trước khi sửa mã nguồn.
- [ ] Research nghiệp vụ mới, có nhật ký tối thiểu 10 nguồn đủ 5 lớp.
- [ ] Chốt yêu cầu chi tiết và slice đầu tiên với người dùng.
- [ ] Tạo/cập nhật BRD theo guide, gồm Screen Spec Card, kịch bản per-actor và ma trận quyền.

### Thiết kế

- [ ] API routes, bảng/cột/migration và Field Ledger đầy đủ cho slice.
- [ ] Thiết kế desktop/mobile riêng.
- [ ] OAuth Facebook/TikTok dùng authorization-code flow; secret nền tảng chỉ ở server.

### Build

- [ ] Migration cục bộ, API + middleware quyền, frontend đúng contract.
- [ ] Thư viện nặng được lazy-load nếu có.

### Verify & QA

- [ ] `pnpm run verify` xanh.
- [ ] Smoke test thành công / thất bại / bị chặn quyền.
- [ ] Test tự động phủ logic, webhook idempotency và tenant isolation.

### Tài liệu & PR

- [ ] Cập nhật changelog và tài liệu bối cảnh/cấu trúc.
- [ ] Nhánh phụ, PR và DoD.

## Bằng chứng Pha 1

- Audit + research: `docs/AUDIT_SOCIAL_COMMERCE_SAAS.md`.
- Đã đọc repo, tài liệu nền AppWeb và nghiên cứu 16 nguồn rải đủ 5 lớp.
- Đã qua Cổng 1: Facebook Page; SaaS nhiều khách; vận chuyển + COD; benchmark pain ghi thành assumptions.
- Không sửa mã nguồn trong Pha 1.

## Assumptions tạm thời

- Tier đa khách: `shared`, nhưng giữ mô hình D1 vật lý riêng theo tenant đang có sẵn trong Forge.
- Slice đề xuất ban đầu: kết nối một kênh bằng OAuth + nhận webhook idempotent + inbox/bình luận hợp nhất + tạo đơn nháp có giữ tồn.
- Facebook/TikTok app credentials thuộc nhà vận hành SaaS, lưu server-side; khách chỉ bấm kết nối và cấp quyền.

## Câu hỏi mở gom cho Cổng 1

- Kênh ưu tiên cho slice đầu: Facebook Page hay TikTok Shop.
- Nhóm khách hàng đầu tiên và quy mô đơn/ngày, phiên livestream/tuần.
- Phạm vi MVP có bao gồm vận chuyển/COD ngay hay chỉ tạo và xử lý đơn nội bộ.
