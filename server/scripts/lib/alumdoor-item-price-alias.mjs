/**
 * Ghép TÊN CŨ của dòng giá với TÊN CHUẨN mà payload phát ra.
 *
 * VÌ SAO tồn tại: khoá đặt tên của `Item Price` nay có năm đoạn
 * (`{price_list}:{item_code}:{uom}:{price_variant}:{area_tier}`), trong khi 558/558 dòng đang
 * chạy trên D1 vẫn mang tên bốn đoạn (đếm trên `work/pricing-preimage.json`, chụp 2026-08-19).
 * Nếu importer coi lệch tên là "dòng thừa" thì lượt tiền kiểm kế tiếp phun đúng 558 blocker và
 * cả adapter `pricing` dừng ở preflight với 0 lượt ghi — Price List + 558 Item Price + 83
 * Pricing Rule mất đường lên D1.
 *
 * VÌ SAO không đổi tên: tên `Item Price` nằm trên dòng bán (`item_price`), và guard tham chiếu
 * của nền tảng (`document-kernel/src/d1-store.ts` ~692) từ chối đổi tên một bản ghi còn được
 * trỏ tới. Đi qua được thì phải `cascade: 1`, mà cascade ghi lại payload của cả chứng từ đã
 * duyệt — quyết định đó thuộc về chủ xưởng, không thuộc một lượt import giá.
 *
 * TÊN KHÔNG PHẢI DỮ LIỆU: đường tra giá đọc được cả hai dạng tên, và ô bậc trống được xử lý
 * như `MOI-DIEN-TICH`. Nên giữ tên cũ vẫn bán đúng; dòng TẠO MỚI từ nay mang tên năm đoạn.
 */

const clean = (value) => String(value ?? "").normalize("NFC").trim();

/**
 * @param {object} input
 * @param {Iterable<string>} input.existingNames tên `Item Price` đang có trên D1 (đã lọc theo bảng giá quản lý)
 * @param {Iterable<string>} input.expectedNames tên chuẩn do payload phát ra
 * @param {string} input.allAreaTier mã bậc sentinel
 * @returns {{ alias: Map<string,string>, blockers: Array<object> }}
 *   `alias`: tên chuẩn → tên đang thực có trên D1. `blockers`: dòng thừa thật và dòng trùng.
 */
export function classifyManagedItemPriceNames({ existingNames, expectedNames, allAreaTier }) {
  const tier = clean(allAreaTier);
  if (!tier) throw new Error("classifyManagedItemPriceNames cần mã bậc sentinel");
  const existing = new Set([...existingNames].map(clean));
  const expected = new Set([...expectedNames].map(clean));
  const alias = new Map();
  const blockers = [];
  for (const name of existing) {
    if (expected.has(name)) continue;
    const withTierSegment = `${name}:${tier}`;
    if (!expected.has(withTierSegment)) {
      blockers.push({ type: "extra_managed_item_price", name });
      continue;
    }
    // Cùng một danh tính dưới HAI tên là nhập nhằng thật, không phải bí danh: `resolveServerPrice`
    // sẽ ném "Multiple active Item Price records match" ngay lượt bán đầu tiên. Chặn, đừng ghi đè.
    if (existing.has(withTierSegment)) {
      blockers.push({ type: "item_price_duplicate_legacy_and_tiered_name", name, tiered_name: withTierSegment });
      continue;
    }
    alias.set(withTierSegment, name);
  }
  return { alias, blockers };
}
