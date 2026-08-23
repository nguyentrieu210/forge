type Json = Record<string, unknown>;

export type GeometryRuntimeCall = (path: string, init?: RequestInit) => Promise<Response>;

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
 * Hàm này chỉ đọc master data. Nó KHÔNG biết tên loại cửa, nhóm khách, công thức cắt hay giá.
 * Geometry Profile sở hữu role/visible/required/editable/sequence; Geometry Field sở hữu label,
 * UOM, axis và runtime_fieldname. Cutting Policy tiếp tục là authority của phép tính.
 */
export async function readGeometryProfileRuntime(
  call: GeometryRuntimeCall,
  geometryProfileName: string,
): Promise<GeometryProfileRuntimeContract | null> {
  const name = text(geometryProfileName);
  if (!name) return null;
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
    return {
      geometry_field: geometryField,
      label: text(master?.field_name) || geometryField,
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
  };
}
