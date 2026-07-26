import type { FormGuideMap } from "@metaforge/views";

/**
 * Hướng dẫn nhập cho từng chứng từ kho.
 *
 * Viết cho THỦ KHO, không viết cho lập trình viên: nói việc đang làm và hậu quả nếu làm sai, không
 * mô tả lại tên field. Người dùng đóng được và lựa chọn đó được nhớ theo từng chứng từ.
 *
 * Điểm chung quan trọng nhất, lặp lại ở mọi chứng từ vì đây là hiểu nhầm số một:
 * LƯU chỉ tạo bản nháp — tồn kho KHÔNG đổi. Chỉ khi GHI SỔ (submit) tồn mới chạy.
 */
export const FORM_GUIDES: FormGuideMap = {
  "Purchase Receipt": {
    what: "Phiếu nhập kho — ghi nhận hàng nhà cung cấp giao tới và nhập vào kho.",
    points: [
      "Chọn nhà cung cấp, rồi thêm từng dòng hàng: mã hàng, số lượng thực nhận, đơn giá.",
      "Kho nhận lấy theo kho đang chọn ở thanh trên; muốn khác thì sửa ở từng dòng hàng.",
      "Hàng quản lý theo lô: khai số lô và hạn dùng ngay lúc nhập, sau này không sửa được.",
    ],
    warn: "Lưu mới chỉ là bản nháp. Tồn kho chỉ tăng sau khi bấm Ghi sổ.",
  },

  "Delivery Note": {
    what: "Phiếu xuất kho bán hàng — hàng rời kho giao cho khách.",
    points: [
      "Chọn khách hàng, thêm dòng hàng và số lượng giao thực tế.",
      "Chỉ xuất được trong phạm vi tồn KHẢ DỤNG (tồn thực tế trừ phần đã giữ cho đơn khác).",
    ],
    warn: "Đây là hàng bán ra ngoài. Chuyển sang xưởng sản xuất thì dùng Chuyển kho, không dùng phiếu này — dùng nhầm sẽ ghi khống doanh thu.",
  },

  "Stock Entry": {
    what: "Phiếu kho nội bộ — chuyển kho, nhập/xuất khác, xuất cho sản xuất.",
    points: [
      "Chuyển kho: khai CẢ kho xuất và kho nhận.",
      "Xuất cho sản xuất: chọn loại “Xuất kho” (Material Issue) — hàng ra khỏi kho nhưng vẫn trong công ty.",
      "Nhập kho khác: chỉ khai kho nhận (hàng thừa, hàng thu hồi…).",
    ],
    warn: "Chọn sai loại phiếu là sai luôn hạch toán: xuất bán ghi vào doanh thu, xuất sản xuất ghi vào chi phí. Sai thì phải huỷ phiếu làm lại.",
  },

  "Material Request": {
    what: "Yêu cầu vật tư — đề nghị mua hoặc đề nghị chuyển hàng về kho của mình.",
    points: [
      "Bảng dòng hàng khai: cần mặt hàng nào, bao nhiêu, cần trước ngày nào.",
      "Những gì đã khai ở đầu phiếu (công ty, kho, ngày) không phải khai lại ở từng dòng.",
    ],
    warn: "Yêu cầu KHÔNG làm đổi tồn kho. Nó chỉ là đề nghị, chờ người có thẩm quyền duyệt.",
  },

  "Stock Reconciliation": {
    what: "Phiếu kiểm kê — chỉnh tồn trên hệ thống cho khớp số đếm thực tế.",
    points: [
      "Khai số lượng ĐẾM ĐƯỢC, không khai phần chênh lệch; hệ thống tự tính chênh lệch.",
      "Nên kiểm kê vào lúc kho không xuất nhập, nếu không số đếm sẽ lệch ngay khi đang đếm.",
    ],
    warn: "Đây là chứng từ ghi đè thẳng lên sổ kho, dấu vết còn lại vĩnh viễn. Người đếm và người duyệt nên là hai người khác nhau.",
  },

  Item: {
    what: "Mặt hàng — khai một lần, dùng cho mọi phiếu về sau.",
    points: [
      "Đơn vị tính kho là đơn vị GỐC để tính tồn; chọn xong rồi thì đừng đổi khi đã phát sinh.",
      "Bật “quản lý lô” nếu hàng có hạn dùng hoặc cần truy xuất nguồn gốc.",
      "Khai mã vạch để quét được ở màn Nhập hàng nhanh và màn công nhân.",
    ],
    warn: "Đổi đơn vị tính kho sau khi đã có phát sinh sẽ làm sai toàn bộ số tồn cũ.",
  },

  Warehouse: {
    what: "Kho — tổ chức theo dạng cây: kho tổng chứa khu, khu chứa vị trí.",
    points: [
      "Bật “Là nhóm” cho kho tổng/khu; chỉ kho LÁ (không phải nhóm) mới chứa được hàng.",
      "Mỗi kho thuộc đúng một công ty.",
    ],
    warn: "Kho nhóm luôn hiện tồn bằng 0 — đó là đúng, hàng nằm ở các kho lá bên dưới.",
  },

  Batch: {
    what: "Lô hàng — theo dõi hạn dùng và truy xuất nguồn gốc theo từng lô.",
    points: ["Lô thường được tạo tự động khi nhập hàng; ít khi phải tạo tay ở đây."],
  },

  "Quality Inspection": {
    what: "Phiếu kiểm tra chất lượng — ghi kết quả kiểm hàng trước khi cho nhập kho.",
    points: ["Gắn với phiếu nhập tương ứng để biết đang kiểm lô hàng nào."],
  },

  Supplier: {
    what: "Nhà cung cấp — bên bán hàng cho mình.",
    points: ["Chỉ cần tên và mã số thuế là đủ dùng cho nghiệp vụ kho."],
  },

  Customer: {
    what: "Khách hàng — bên mình xuất hàng giao tới.",
    points: ["Chỉ cần tên và mã số thuế là đủ dùng cho nghiệp vụ kho."],
  },

  UOM: {
    what: "Đơn vị tính — cái, thùng, kg, mét…",
    warn: "Phải bật “Đang dùng” thì đơn vị mới chọn được trên các phiếu.",
  },

  "Item Group": {
    what: "Nhóm mặt hàng — xếp hàng hoá thành cây để lọc và báo cáo theo nhóm.",
  },

  Brand: {
    what: "Thương hiệu — dùng để lọc và tra cứu, không ảnh hưởng tới tồn kho.",
  },
};
