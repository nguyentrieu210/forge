/**
 * Đọc một tấm ảnh bảng giá thành dòng hàng — phần THUẦN, không I/O, nên kiểm được.
 *
 * Mô hình đọc ảnh nằm ở `index.ts`. Ở đây là hai việc mà mô hình KHÔNG được phép quyết,
 * vì cả hai đều sai theo kiểu không ai nhìn ra:
 *
 *   1. ĐỌC SỐ. "98.000" là chín mươi tám nghìn, "3,5" là ba phẩy năm — cùng một dấu chấm
 *      và dấu phẩy mang hai nghĩa ngược nhau tuỳ chỗ. Sai chỗ này là sai TIỀN, và một hoá
 *      đơn 98.000 đọc thành 98 thì không có gì trong sổ kêu lên cả.
 *   2. KHỚP MÃ HÀNG. Mô hình đoán ra một mã không tồn tại thì nhân từ chối — ồn ào, nhưng
 *      an toàn. Nguy hiểm là nó đoán trúng một mã CÓ THẬT nhưng SAI: hàng nhập vào nhầm
 *      mã, tồn kho lệch hai chiều, và không ai truy ngược được vì chứng từ trông hợp lệ.
 *      Nên ở đây chỉ khớp bằng luật xác định, và khớp không chắc thì ĐỂ TRỐNG cho người
 *      chọn — một ô trống là câu hỏi, một mã sai là câu trả lời sai.
 */

/** Bỏ dấu tiếng Việt. `đ`/`Đ` phải xử riêng — NFD không tách chúng ra. */
export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Chuẩn hoá để SO SÁNH: bỏ dấu, thường hoá, bỏ mọi thứ không phải chữ hoặc số. */
export function normaliseKey(input: string): string {
  return stripDiacritics(String(input ?? "")).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Đọc một con số viết kiểu Việt Nam.
 *
 * Luật, và lý do từng luật:
 *
 *   · Có CẢ `.` lẫn `,` → dấu XUẤT HIỆN SAU là dấu thập phân, dấu kia là phân nhóm.
 *     "1.234,56" và "1,234.56" đều đọc đúng, không cần biết người viết theo lối nào.
 *   · Chỉ một loại dấu, lặp nhiều lần → phân nhóm. "1.234.567" không thể là số thập phân.
 *   · Chỉ một dấu, và theo sau ĐÚNG BA chữ số → phân nhóm. Đây là chỗ "98.000" thành
 *     98000 chứ không thành 98. Ba chữ số là quy ước phân nhóm, và bảng giá của NCC viết
 *     đúng như vậy.
 *   · Còn lại → thập phân. "3,5" là 3,5 và "5.85" là 5,85.
 *
 * Chỗ mơ hồ THẬT SỰ còn lại: "1.500" đọc thành 1500, không phải 1,5. Với tiền thì luôn
 * đúng; với hệ số quy đổi thì không ai viết 1.500 để chỉ 1,5, nên chấp nhận được. Ghi ra
 * đây để người sau biết chỗ này đã được cân nhắc chứ không phải bỏ sót.
 */
export function parseVietnameseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // Bỏ tiền tệ, đơn vị và khoảng trắng; giữ dấu âm, chữ số, `.` và `,`.
  const cleaned = stripDiacritics(raw)
    .replace(/\s+/g, "")
    .replace(/(vnd|vnđ|dong|d)$/i, "")
    .replace(/[^0-9.,-]/g, "");
  if (!/[0-9]/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const body = cleaned.replace(/-/g, "");
  const lastDot = body.lastIndexOf(".");
  const lastComma = body.lastIndexOf(",");

  let normalised: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    normalised = `${body.slice(0, decimalAt).replace(/[.,]/g, "")}.${body.slice(decimalAt + 1).replace(/[.,]/g, "")}`;
  } else {
    const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : "";
    if (!separator) {
      normalised = body;
    } else {
      const parts = body.split(separator);
      const tail = parts[parts.length - 1] ?? "";
      const grouping = parts.length > 2 || tail.length === 3;
      normalised = grouping ? parts.join("") : `${parts.slice(0, -1).join("")}.${tail}`;
    }
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export interface CatalogItem {
  item_code: string;
  item_name?: string;
}

export type MatchConfidence = "code" | "name" | "contains";

export interface ItemMatch {
  item_code: string;
  confidence: MatchConfidence;
}

/**
 * Khớp một dòng chữ đọc được với danh mục hàng hoá — hoặc KHÔNG khớp gì cả.
 *
 * Ba tầng, chặt trước lỏng sau, và tầng cuối chỉ nhận khi có ĐÚNG MỘT ứng viên. Hai ứng
 * viên nghĩa là không biết chọn cái nào, và đoán bừa lúc đó là cách tạo ra một chứng từ
 * trông hợp lệ với mã sai.
 */
export function matchItem(text: string, catalog: readonly CatalogItem[]): ItemMatch | null {
  const key = normaliseKey(text);
  if (!key) return null;

  for (const item of catalog) {
    if (normaliseKey(item.item_code) === key) return { item_code: item.item_code, confidence: "code" };
  }
  for (const item of catalog) {
    if (item.item_name && normaliseKey(item.item_name) === key) return { item_code: item.item_code, confidence: "name" };
  }

  // Chứa nhau: "AL548 màu GS 3m9" chứa mã "AL548". Mã ngắn hơn 3 ký tự bị loại — "S2"
  // nằm trong gần như mọi chuỗi, và một mã như thế sẽ khớp bừa với mọi dòng.
  const candidates = new Set<string>();
  for (const item of catalog) {
    const codeKey = normaliseKey(item.item_code);
    if (codeKey.length >= 3 && key.includes(codeKey)) candidates.add(item.item_code);
    const nameKey = item.item_name ? normaliseKey(item.item_name) : "";
    if (nameKey.length >= 4 && (key.includes(nameKey) || nameKey.includes(key))) candidates.add(item.item_code);
  }
  if (candidates.size !== 1) return null;
  return { item_code: [...candidates][0]!, confidence: "contains" };
}

export interface OcrRow {
  /** Chữ mô hình đọc được ở cột mặt hàng — GIỮ NGUYÊN, kể cả khi đã khớp được mã. */
  raw_text: string;
  item_code?: string;
  confidence?: MatchConfidence;
  qty?: number;
  uom?: string;
  rate?: number;
  amount?: number;
  note?: string;
}

/** Đơn vị mà brief cho phép. Mô hình đọc ra thứ khác thì bỏ, không bịa. */
const KNOWN_UOMS = ["m2", "Bộ", "Cái", "Mét", "Kg", "Cây", "Thanh", "Sợi", "Cuộn", "Tấm", "Túi", "Hộp", "Bình"];
const UOM_KEYS = new Map(KNOWN_UOMS.map((uom) => [normaliseKey(uom), uom]));

export function normaliseUom(input: unknown): string | undefined {
  const key = normaliseKey(String(input ?? ""));
  if (!key) return undefined;
  const direct = UOM_KEYS.get(key);
  if (direct) return direct;
  // Cách viết hay gặp trên bảng giá viết tay.
  const alias: Record<string, string> = { m: "Mét", met: "Mét", kilogam: "Kg", kilo: "Kg", cai: "Cái", bo: "Bộ", cay: "Cây", thanh: "Thanh", soi: "Sợi" };
  return alias[key];
}

/**
 * Đọc câu trả lời của mô hình thành dòng hàng đã khớp mã.
 *
 * Phòng thủ ở mọi bước: mô hình có thể trả JSON thiếu khoá, thừa khoá, số viết bằng chữ,
 * hoặc một mảng rỗng. Cái duy nhất không được phép xảy ra là một dòng có `item_code` mà
 * `item_code` đó không nằm trong danh mục.
 */
export function buildRows(parsed: unknown, catalog: readonly CatalogItem[]): OcrRow[] {
  const source = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { items?: unknown })?.items)
      ? (parsed as { items: unknown[] }).items
      : Array.isArray((parsed as { rows?: unknown })?.rows)
        ? (parsed as { rows: unknown[] }).rows
        : [];

  const rows: OcrRow[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const text = String(record.item ?? record.item_name ?? record.name ?? record.description ?? record.raw_text ?? "").trim();
    if (!text) continue;

    const qty = parseVietnameseNumber(record.qty ?? record.quantity ?? record.so_luong);
    const rate = parseVietnameseNumber(record.rate ?? record.price ?? record.unit_price ?? record.don_gia);
    const amount = parseVietnameseNumber(record.amount ?? record.total ?? record.thanh_tien);
    const uom = normaliseUom(record.uom ?? record.unit ?? record.dvt ?? record.don_vi);
    const match = matchItem(text, catalog);

    rows.push({
      raw_text: text,
      ...(match ? { item_code: match.item_code, confidence: match.confidence } : {}),
      ...(qty !== null && qty > 0 ? { qty } : {}),
      ...(uom ? { uom } : {}),
      ...(rate !== null && rate > 0 ? { rate } : {}),
      ...(amount !== null && amount > 0 ? { amount } : {}),
      // Chữ gốc luôn đi cùng dòng, kể cả khi đã khớp mã: người soát cần đối chiếu với ảnh,
      // và mã khớp kiểu "contains" là mã đáng ngờ nhất trong ba kiểu.
      note: text,
    });
  }
  return rows;
}

/**
 * Lôi JSON ra khỏi câu trả lời của mô hình.
 *
 * Mô hình hay bọc JSON trong ```json … ``` hoặc thêm một câu dẫn phía trước, dù prompt đã
 * dặn đừng. Trả `null` khi không có gì đọc được, để nơi gọi báo một câu tử tế thay vì để
 * `JSON.parse` ném ra một lỗi cú pháp mà người dùng không hiểu.
 */
export function extractJson(text: string): unknown {
  const body = String(text ?? "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  const candidates = [fenced?.[1], body];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    /**
     * Dấu mở XUẤT HIỆN TRƯỚC mới là cấu trúc ngoài cùng — không phải mảng trước, object sau.
     *
     * Thử mảng trước thì `Đây là kết quả: {"items":[]}` lôi ra đúng cái `[]` NẰM BÊN TRONG,
     * và trả về một danh sách rỗng thay vì object. Người dùng thấy "không đọc được dòng nào"
     * trong khi mô hình trả lời đàng hoàng.
     */
    const slices = ([["[", "]"], ["{", "}"]] as const)
      .map(([open, close]) => ({ start: trimmed.indexOf(open), end: trimmed.lastIndexOf(close) }))
      .filter((slice) => slice.start >= 0 && slice.end > slice.start)
      .sort((left, right) => left.start - right.start);
    for (const slice of slices) {
      try { return JSON.parse(trimmed.slice(slice.start, slice.end + 1)); } catch { /* thử kiểu còn lại */ }
    }
  }
  return null;
}
