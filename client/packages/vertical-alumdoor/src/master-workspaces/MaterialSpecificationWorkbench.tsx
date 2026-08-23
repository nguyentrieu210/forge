/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;
type MaterialDoc = Json & {
  name?: string;
  modified?: string;
  spec_code?: string;
  spec_name?: string;
  item_group?: string;
  spec_type?: string;
  profile_system?: string;
  section_code?: string;
  theoretical_kg_per_m?: number | string;
  standard_length_m?: number | string;
  thickness_mm?: number | string;
  width_m?: number | string;
  effective_width_m?: number | string;
  scrap_threshold_m?: number | string;
  note?: string;
  disabled?: number | boolean;
};

export interface MaterialSpecificationWorkbenchProps {
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function on(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function numeric(value: unknown): number | "" {
  if (!text(value)) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}
function options(meta: DocTypeMeta | null, fieldname: string): string[] {
  return text(meta?.fields.find((field) => field.fieldname === fieldname)?.options).split("\n").map((entry) => entry.trim()).filter(Boolean);
}
const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>;
}
function emptyDoc(): MaterialDoc { return { spec_code: "", spec_name: "", item_group: "", spec_type: "", profile_system: "", section_code: "", theoretical_kg_per_m: "", standard_length_m: "", thickness_mm: "", width_m: "", effective_width_m: "", scrap_threshold_m: "", note: "", disabled: 0 }; }

export function MaterialSpecificationWorkbench({ name, listPath, onNavigate, onSaved, onCancel }: MaterialSpecificationWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<MaterialDoc>(emptyDoc);
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [groups, setGroups] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      adapter.getMeta("Material Specification"),
      adapter.getList("Item Group", { fields: ["name"], orderBy: "name asc", pageLength: 300 }),
      name ? adapter.getDoc("Material Specification", name) : Promise.resolve(null),
    ]).then(([nextMeta, nextGroups, result]) => {
      if (!active) return;
      setMeta(nextMeta); setGroups(nextGroups); setDoc({ ...emptyDoc(), ...(result?.doc as MaterialDoc ?? {}) });
    }).catch((error) => { if (active) toast.error(adapter.mapError(error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, name]);

  const patch = (next: Partial<MaterialDoc>) => setDoc((current) => ({ ...current, ...next }));
  const fieldSet = useMemo(() => new Set(meta?.fields.map((field) => field.fieldname) ?? []), [meta]);
  const specTypes = useMemo(() => options(meta, "spec_type"), [meta]);
  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;

  const save = async () => {
    if (!text(doc.spec_code)) { toast.error("Mã quy cách không được để trống."); return; }
    if (!text(doc.spec_name)) { toast.error("Tên quy cách không được để trống."); return; }
    if (fieldSet.has("item_group") && !text(doc.item_group)) { toast.error("Cần chọn Nhóm hàng."); return; }
    if (fieldSet.has("spec_type") && !text(doc.spec_type)) { toast.error("Cần chọn Loại quy cách."); return; }
    const kgPerM = numeric(doc.theoretical_kg_per_m);
    if (kgPerM !== "" && kgPerM <= 0) { toast.error("Kg/m lý thuyết phải lớn hơn 0."); return; }
    const standardLength = numeric(doc.standard_length_m);
    if (standardLength !== "" && standardLength <= 0) { toast.error("Chiều dài chuẩn phải lớn hơn 0."); return; }
    const payload: MaterialDoc = {};
    for (const [key, value] of Object.entries(doc)) {
      if (key === "name" || key === "modified" || !fieldSet.has(key)) continue;
      if (["theoretical_kg_per_m", "standard_length_m", "thickness_mm", "width_m", "effective_width_m", "scrap_threshold_m"].includes(key)) payload[key] = numeric(value);
      else if (typeof value === "string") payload[key] = text(value);
      else payload[key] = value;
    }
    setSaving(true);
    try {
      const result = name
        ? await adapter.updateDoc("Material Specification", name, payload, text(doc.modified))
        : await adapter.createDoc("Material Specification", payload);
      const savedName = text((result as Json).name) || text(doc.spec_code);
      toast.success(name ? "Đã lưu Quy cách kỹ thuật." : "Đã tạo Quy cách kỹ thuật.");
      onSaved?.(savedName);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải Quy cách kỹ thuật…</div>;

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-material-specification-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{name ? `${text(doc.spec_code) || name} · ${text(doc.spec_name)}` : "Tạo Quy cách kỹ thuật vật tư"}</h2><Badge variant="outline">Technical facts</Badge></div><p className="mt-1 text-sm text-muted-foreground">Kg/m, chiều dài chuẩn, tiết diện, độ dày và kích thước vật liệu. Danh mục này không quyết field nào hiện trên PO/Receipt.</p></div></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => onNavigate(`${currentPath}?master_ui=generic`)}>Form đầy đủ</Button><Button disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div>
    </div></header>
    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"><div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Nhận diện quy cách</h3><div className="grid gap-3 md:grid-cols-4">
        {fieldSet.has("spec_code") ? <Field label="Mã quy cách"><input className={fieldClass} disabled={Boolean(name)} value={text(doc.spec_code)} onChange={(e) => patch({ spec_code: e.target.value.toUpperCase() })} /></Field> : null}
        {fieldSet.has("spec_name") ? <Field label="Tên quy cách" className="md:col-span-2"><input className={fieldClass} value={text(doc.spec_name)} onChange={(e) => patch({ spec_name: e.target.value })} /></Field> : null}
        {fieldSet.has("spec_type") ? <Field label="Loại quy cách"><select className={fieldClass} value={text(doc.spec_type)} onChange={(e) => patch({ spec_type: e.target.value })}><option value="">— chọn —</option>{specTypes.map((value) => <option key={value}>{value}</option>)}</select></Field> : null}
        {fieldSet.has("item_group") ? <Field label="Nhóm hàng"><select className={fieldClass} value={text(doc.item_group)} onChange={(e) => patch({ item_group: e.target.value })}><option value="">— chọn —</option>{groups.map((row) => <option key={text(row.name)} value={text(row.name)}>{text(row.name)}</option>)}</select></Field> : null}
        {fieldSet.has("profile_system") ? <Field label="Hệ / nguồn profile"><input className={fieldClass} value={text(doc.profile_system)} onChange={(e) => patch({ profile_system: e.target.value })} /></Field> : null}
        {fieldSet.has("section_code") ? <Field label="Mã tiết diện"><input className={fieldClass} value={text(doc.section_code)} onChange={(e) => patch({ section_code: e.target.value })} /></Field> : null}
        {fieldSet.has("disabled") ? <label className="flex items-center gap-2 self-end rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={on(doc.disabled)} onChange={(e) => patch({ disabled: e.target.checked ? 1 : 0 })} /> Ngưng dùng</label> : null}
      </div></section>

      <section className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Thông số kỹ thuật</h3><p className="mb-3 text-xs text-muted-foreground">Các số dưới đây là facts kỹ thuật. `standard_length_m` chỉ là gợi ý đầu vào khi đổi Item; chiều dài thực của lô vẫn được phép sửa.</p><div className="grid gap-3 md:grid-cols-4">
        {fieldSet.has("theoretical_kg_per_m") ? <Field label="Kg/m lý thuyết" hint="Purchase Runtime chiếu xuống read-only để tính/đối chiếu barem."><input className={fieldClass} type="number" min="0" step="0.000001" value={text(doc.theoretical_kg_per_m)} onChange={(e) => patch({ theoretical_kg_per_m: e.target.value })} /></Field> : null}
        {fieldSet.has("standard_length_m") ? <Field label="Chiều dài chuẩn (m)" hint="PO/Receipt chỉ lấy làm gợi ý ban đầu; không khóa chiều dài thực của chuyến hàng."><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.standard_length_m)} onChange={(e) => patch({ standard_length_m: e.target.value })} /></Field> : null}
        {fieldSet.has("thickness_mm") ? <Field label="Độ dày (mm)"><input className={fieldClass} type="number" min="0" step="0.01" value={text(doc.thickness_mm)} onChange={(e) => patch({ thickness_mm: e.target.value })} /></Field> : null}
        {fieldSet.has("width_m") ? <Field label="Chiều rộng vật liệu (m)"><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.width_m)} onChange={(e) => patch({ width_m: e.target.value })} /></Field> : null}
        {fieldSet.has("effective_width_m") ? <Field label="Chiều rộng hữu hiệu (m)"><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.effective_width_m)} onChange={(e) => patch({ effective_width_m: e.target.value })} /></Field> : null}
        {fieldSet.has("scrap_threshold_m") ? <Field label="Ngưỡng phế (m)" hint="Chỉ khai nếu metadata/source thực sự dùng."><input className={fieldClass} type="number" min="0" step="0.01" value={text(doc.scrap_threshold_m)} onChange={(e) => patch({ scrap_threshold_m: e.target.value })} /></Field> : null}
      </div></section>

      {fieldSet.has("note") ? <section className="rounded-xl border bg-card p-4"><Field label="Ghi chú"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={text(doc.note)} onChange={(e) => patch({ note: e.target.value })} /></Field></section> : null}
      <section className="rounded-xl border bg-card p-4"><h3 className="mb-2 font-medium">Được dùng bởi Purchase</h3><div className="grid gap-2 md:grid-cols-3"><div className="rounded-md border bg-background p-3 text-sm"><strong>Purchase Order</strong><div className="mt-1 text-xs text-muted-foreground">Đọc Kg/m, chiều dài chuẩn và facts kỹ thuật qua Purchase Runtime.</div></div><div className="rounded-md border bg-background p-3 text-sm"><strong>Purchase Receipt</strong><div className="mt-1 text-xs text-muted-foreground">Đối chiếu barem với số thực nhận/cân.</div></div><div className="rounded-md border bg-background p-3 text-sm"><strong>Không sở hữu UI visibility</strong><div className="mt-1 text-xs text-muted-foreground">Visibility/required thuộc Measurement Profile.</div></div></div></section>
    </div></main>
  </div>;
}
