/**
 * @metaforge/stock-vn — bộ BÁO CÁO KHO theo mẫu kế toán Việt Nam, dựng sẵn trên chứng từ chuẩn
 * của ERPNext.
 *
 * ── Vì sao là package riêng, không nằm trong @metaforge/views ─────────────────────────────────
 * `views` là engine chung: nó chỉ biết metadata của Frappe, không biết ERPNext hay nghiệp vụ kho.
 * Ba biểu dưới đây thì gọi đích danh report `Stock Balance` / `Stock Ledger` và các doctype
 * Purchase Receipt / Delivery Note. Nhét chúng vào `views` là buộc mọi app dựng bằng MetaForge —
 * kể cả app chẳng liên quan gì tới kho — phải kéo theo hiểu biết về ERPNext.
 *
 * ── Vì sao cũng không để nguyên trong app ─────────────────────────────────────────────────────
 * Đây là biểu theo MẪU NHÀ NƯỚC (S10-DN, S11-DN, S12-DN), mọi doanh nghiệp đều cần y hệt nhau.
 * Để trong một app thì app kho tiếp theo lại chép tay lần nữa — và mỗi bản chép lại lệch một chút
 * ở đúng những chỗ khó: dòng số dư đầu kỳ, cách gộp đơn vị tính, cột nào được phép cộng.
 *
 * Phần dùng chung cho MỌI loại báo cáo (khuôn xuất Excel, chọn kỳ) nằm ở `@metaforge/views`
 * (`exportFormXlsx`, `PeriodPicker`) — chỗ này chỉ giữ phần thuộc về nghiệp vụ kho.
 */
export { XuatNhapTonScreen } from "./XuatNhapTonScreen.js";
export { SoChiTietScreen } from "./SoChiTietScreen.js";
export { TongHopDoiTuongScreen } from "./TongHopDoiTuongScreen.js";
