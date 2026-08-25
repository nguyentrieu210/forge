import { previewChildRow as previewLegacyChildRow } from "./ui-child-preview-legacy.js";
import { previewPurchaseChildRow } from "./purchase-child-preview.js";
import type { SalesPlatformCall } from "./sales-item-context.js";
import type { ProductionPlatformCall } from "./sales-production.js";

type Json = Record<string, unknown>;
type PlatformCall = SalesPlatformCall & ProductionPlatformCall;

const PURCHASE_DOCTYPES = new Set([
  "Supplier Quotation Item",
  "Purchase Order Item",
  "Purchase Receipt Item",
  "Purchase Invoice Item",
]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

/**
 * Server-owned child-row preview router.
 *
 * Purchase rows use the catalog-driven Item → Measurement Profile → Material Specification
 * contract. Every non-purchase row keeps the previously shipped implementation byte-for-byte
 * in `ui-child-preview-legacy.ts`, so this refactor cannot silently rewrite Sales behavior.
 */
/**
 * ĐỆM ĐỌC TRONG PHẠM VI MỘT LƯỢT TÍNH LẠI.
 *
 * Một lần nhập kích thước sinh 28 lượt đọc, trong đó gần một nửa là ĐỌC LẠI đúng thứ vừa đọc:
 * `Item` 4 lần, danh sách `Cutting Policy` 3 lần, `Geometry Profile` 2 lần, và 4 lượt đọc lẻ
 * `Surface Finish` ngay sau một truy vấn danh sách đã trả về đủ. Đó là vì các tầng (hình học,
 * chính sách cắt, màu, giá) được viết độc lập nhau, mỗi tầng tự đi đọc thứ nó cần — đúng về
 * mặt tách bạch, nhưng người bán phải chờ.
 *
 * Chỉ đệm phương thức ĐỌC và chỉ trong MỘT lời gọi preview: `readDoc`/`listDocs` đều gọi
 * `call(path)` không kèm `init`, nên đường dẫn là khoá đầy đủ. Có `init` (tức ghi, hoặc đọc có
 * tuỳ chọn riêng) thì đi thẳng, không đệm.
 *
 * `Response` chỉ đọc được thân MỘT lần, nên bản gốc được giữ nguyên và mỗi người gọi nhận một
 * bản sao. Không làm vậy thì người thứ hai nhận thân rỗng — hỏng im lặng, tệ hơn là chậm.
 */
function demMotLuot(call: PlatformCall): PlatformCall {
  const daDoc = new Map<string, Promise<Response>>();
  return ((path: string, init?: RequestInit) => {
    if (init) return call(path, init);
    const cu = daDoc.get(path);
    if (cu) return cu.then((res) => res.clone());
    const moi = call(path);
    daDoc.set(path, moi);
    // Hỏng thì quên đi, để lượt sau còn thử lại thay vì nhớ mãi một lỗi.
    void moi.catch(() => daDoc.delete(path));
    return moi.then((res) => res.clone());
  }) as PlatformCall;
}

export async function previewChildRow(call: PlatformCall, args: Json): Promise<Response> {
  const childDoctype = text(args.child_doctype);
  const dem = demMotLuot(call);
  if (PURCHASE_DOCTYPES.has(childDoctype)) return previewPurchaseChildRow(dem, args);
  return previewLegacyChildRow(dem, args);
}
