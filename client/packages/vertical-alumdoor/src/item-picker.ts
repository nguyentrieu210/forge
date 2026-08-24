/**
 * Ô CHỌN MẶT HÀNG DÙNG CHUNG (bán · mua · phiếu nhập).
 *
 * Ba màn trước đây mỗi màn tự bắn nhiều biến thể từ khoá lên server rồi gộp hợp — chậm, và
 * gõ không trúng gì vẫn đổ cả danh mục ra. Ở đây nạp danh mục MỘT LẦN cho cả phiên rồi xếp
 * hạng tại chỗ bằng `timMatHang`, kèm ảnh mặt hàng cho ô chọn vẽ.
 *
 * Danh mục vài trăm mã nên một lượt đọc là đủ; hỏng thì trả rỗng chứ không tự đoán, để màn gọi
 * còn đường lui về `services.searchLink` cũ.
 */
import type { Doc, Filters } from "@metaforge/core";
import { timMatHang, type MatHangTimKiem } from "./sales-item-search.js";

export interface MucChonMatHang extends MatHangTimKiem {
  /** Đường dẫn ảnh — ô chọn chỉ vẽ khi có. */
  image?: string;
}

interface BoDocDanhSach {
  getList: (doctype: string, options: { fields: string[]; filters?: Filters; pageLength?: number }) => Promise<Doc[]>;
}

function chu(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

/**
 * Tạo một hàm tìm mặt hàng có nhớ đệm. Gọi ở tầng `useMemo` của từng màn để mỗi màn giữ một
 * bộ nhớ đệm riêng theo đúng bộ lọc của mình (bán khác mua).
 */
export function taoTimMatHangCucBo(adapter: BoDocDanhSach, loc: Filters) {
  let danhMuc: Promise<MucChonMatHang[]> | null = null;

  const nap = () => {
    danhMuc ??= adapter.getList("Item", {
      fields: ["name", "item_name", "item_group", "item_image"],
      filters: loc,
      pageLength: 1000,
    }).then((rows) => rows
      .map((row) => ({
        value: chu(row.name),
        label: chu(row.item_name),
        group: chu(row.item_group),
        image: chu(row.item_image),
      }))
      .filter((row) => row.value));
    return danhMuc;
  };

  return {
    /** Xếp hạng tại chỗ. Ném ra ngoài nếu không nạp được — màn gọi tự quyết đường lui. */
    async tim(query: unknown, gioiHan = 100): Promise<MucChonMatHang[]> {
      try {
        return timMatHang(await nap(), query, gioiHan) as MucChonMatHang[];
      } catch (error) {
        // Đừng nhớ cái hỏng cho những lần gõ sau.
        danhMuc = null;
        throw error;
      }
    },
  };
}
