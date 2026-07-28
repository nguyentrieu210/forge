import type { DocField, DocTypeMeta } from "@metaforge/core";

const CODE_FIELD = /(?:^code$|_code$)/i;

/**
 * Chỉ tự điền MÃ ĐỊNH DANH CHÍNH mà DocType dùng để đặt tên bản ghi.
 *
 * Không suy từ nhãn "Mã …": `Mã số thuế`, `Mã bưu chính`, `Mã vạch` đều bắt đầu như vậy nhưng là
 * dữ liệu do bên ngoài cấp, tự bịa giá trị cho chúng là sai. Điều kiện `autoname=field:<..._code>`
 * vừa tường minh, vừa không chạm các Link `item_code` nằm trong dòng chứng từ.
 */
export function editableCodeField(meta: DocTypeMeta): DocField | undefined {
  const match = /^field:([a-z][a-z0-9_]*)$/i.exec(meta.autoname?.trim() ?? "");
  if (!match || !CODE_FIELD.test(match[1] ?? "")) return undefined;
  return meta.fields.find((field) =>
    field.fieldname === match[1]
    && field.fieldtype === "Data"
    && field.read_only !== 1
    && field.hidden !== 1,
  );
}

function codePrefix(meta: DocTypeMeta, field: DocField): string {
  const fieldPrefix = field.fieldname.replace(/_code$/i, "").replace(/^code$/i, "");
  const source = fieldPrefix || meta.name;
  const normalized = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return (normalized || "MA").slice(0, 12);
}

function compactDate(now: Date): string {
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function randomToken(): string {
  const bytes = new Uint8Array(3);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    const value = (bytes[0]! << 16) | (bytes[1]! << 8) | bytes[2]!;
    return value.toString(36).toUpperCase().padStart(5, "0").slice(-5);
  }
  return Math.floor(Math.random() * 36 ** 5).toString(36).toUpperCase().padStart(5, "0");
}

/**
 * Mã gợi ý ngắn, dễ đọc và đủ phân tán cho nhiều người cùng mở form:
 * `ITEM-260728-A4K9Q`. Đây là DEFAULT, không phải khoá; control Data vẫn sửa bình thường.
 */
export function suggestEditableCode(
  meta: DocTypeMeta,
  field: DocField,
  now = new Date(),
  token = randomToken(),
): string {
  return `${codePrefix(meta, field)}-${compactDate(now)}-${token.toUpperCase().slice(0, 5).padStart(5, "0")}`;
}

