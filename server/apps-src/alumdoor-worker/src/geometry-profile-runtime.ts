type Json = Record<string, unknown>;

export type GeometryRuntimeCall = ((path: string, init?: RequestInit) => Promise<Response>) & { tenantKey?: string };

export interface GeometryRuntimeField {
  geometry_field: string;
  label: string;
  runtime_fieldname: string | null;
  role: string;
  visible: boolean;
  required: boolean;
  editable: boolean;
  sequence: number;
  uom: string | null;
  axis: string | null;
}

export interface GeometryProfileRuntimeContract {
  profile_code: string;
  profile_name: string;
  fields: GeometryRuntimeField[];
  /**
   * Loại cửa này có xổ định mức vật tư ra màn bán hàng không.
   *
   * Bỏ trống = CÓ. Chỉ loại nào tick tắt mới ẩn, để thêm một Geometry Profile mới không vô tình
   * mất khối định mức.
   */
  show_bom_on_sales: boolean;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function on(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

async function readResource(call: GeometryRuntimeCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

/**
 * Resolve một Geometry Profile thành contract operational mà Sales/Quotation có thể render.
 *
 * Hàm chỉ đọc master data. Nó KHÔNG biết tên loại cửa, nhóm khách, công thức cắt hay giá.
 * Geometry Profile sở hữu role/visible/required/editable/sequence; Geometry Field sở hữu label,
 * UOM, axis và runtime_fieldname. Cutting Policy tiếp tục là authority của phép tính.
 */
/**
 * NHỚ ĐỆM theo tenant + tên profile, có hạn dùng.
 *
 * Một Geometry Profile kéo theo tới 7 lượt đọc Geometry Field riêng lẻ (~43 ms/lượt). Dựng lại
 * từ đầu ở MỖI lần người bán gõ một ký tự kích thước là phí — bộ Geometry Profile gần như không
 * đổi giữa hai lần gõ liên tiếp. Thiếu `tenantKey` thì không nhớ đệm.
 */
const RUNTIME_TTL_MS = 30_000;
const runtimeCache = new Map<string, { at: number; value: Promise<GeometryProfileRuntimeContract | null> }>();

export async function readGeometryProfileRuntime(
  call: GeometryRuntimeCall,
  geometryProfileName: string,
): Promise<GeometryProfileRuntimeContract | null> {
  const name = text(geometryProfileName);
  if (!name) return null;
  const tenant = text(call.tenantKey);
  if (tenant) {
    const key = `${tenant}|${name}`;
    const hit = runtimeCache.get(key);
    if (hit && Date.now() - hit.at < RUNTIME_TTL_MS) return hit.value;
    const pending = readGeometryProfileRuntimeUncached(call, name);
    runtimeCache.set(key, { at: Date.now(), value: pending });
    void pending.catch(() => runtimeCache.delete(key));
    return pending;
  }
  return readGeometryProfileRuntimeUncached(call, name);
}

async function readGeometryProfileRuntimeUncached(
  call: GeometryRuntimeCall,
  name: string,
): Promise<GeometryProfileRuntimeContract | null> {
  const profile = await readResource(call, "Geometry Profile", name);
  if (!profile) return null;

  const childRows = Array.isArray(profile.fields)
    ? profile.fields.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  const fieldNames = [...new Set(childRows.map((row) => text(row.geometry_field)).filter(Boolean))];
  const masters = await Promise.all(fieldNames.map(async (fieldName) => [
    fieldName,
    await readResource(call, "Geometry Field", fieldName).catch(() => null),
  ] as const));
  const fieldByName = new Map(masters);

  const fields = childRows.map((row): GeometryRuntimeField => {
    const geometryField = text(row.geometry_field);
    const master = fieldByName.get(geometryField);
    /*
     * `label_override` thắng tên gốc của Trường hình học.
     *
     * Tên trên Geometry Field là DÙNG CHUNG cho mọi Geometry Profile tham chiếu nó — đổi ở đó
     * là đổi cho tất cả. Nhưng có Profile MƯỢN một trục cho mục đích khác với Profile còn lại
     * (một bên dùng đúng nghĩa gốc, bên kia chỉ mượn trục đó nuôi một phép tính khác) — đổi
     * thẳng tên gốc sẽ đúng cho Profile này và sai cho Profile kia. Danh sách profile/trục nào
     * mượn tên gì là dữ liệu, khai trong Geometry Profile — hàm này không biết và không cần
     * biết, nó chỉ đọc `label_override` nếu có.
     */
    const ten = text(row.label_override) || text(master?.field_name) || geometryField;
    return {
      geometry_field: geometryField,
      label: ten,
      runtime_fieldname: text(master?.runtime_fieldname) || null,
      role: text(row.role),
      visible: on(row.visible),
      required: on(row.required),
      editable: on(row.editable),
      sequence: Number.isFinite(Number(row.sequence)) ? Number(row.sequence) : 0,
      uom: text(master?.uom) || null,
      axis: text(master?.axis) || null,
    };
  }).sort((left, right) => left.sequence - right.sequence || left.geometry_field.localeCompare(right.geometry_field));

  return {
    profile_code: text(profile.profile_code ?? profile.name) || name,
    profile_name: text(profile.profile_name) || name,
    fields,
    show_bom_on_sales: profile.show_bom_on_sales === undefined ? true : on(profile.show_bom_on_sales),
  };
}
