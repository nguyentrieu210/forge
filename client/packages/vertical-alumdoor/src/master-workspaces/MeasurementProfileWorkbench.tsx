/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;
type MeasurementDoc = Json & {
  name?: string;
  modified?: string;
  profile_name?: string;
  inventory_mode?: string;
  stock_uom?: string;
  track_dimension_lot?: number | boolean;
  require_color?: number | boolean;
  require_condition?: number | boolean;
  require_length?: number | boolean;
  require_width?: number | boolean;
  require_piece_qty?: number | boolean;
  track_bundle_qty?: number | boolean;
  weight_tolerance_pct?: number | string;
  note?: string;
  disabled?: number | boolean;
};

export interface MeasurementProfileWorkbenchProps {
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function on(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function numberOrBlank(value: unknown): number | "" {
  if (!text(value)) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}
function selectOptions(meta: DocTypeMeta | null, fieldname: string): string[] {
  return text(meta?.fields.find((field) => field.fieldname === fieldname)?.options)
    .split("\n").map((entry) => entry.trim()).filter(Boolean);
}

const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>;
}
function Check({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-start gap-2 rounded-md border px-3 py-2"><input className="mt-0.5" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><span className="block text-sm font-medium">{label}</span><span className="block text-[11px] leading-4 text-muted-foreground">{detail}</span></span></label>;
}
function emptyDoc(): MeasurementDoc {
  return { profile_name: "", inventory_mode: "", stock_uom: "", track_dimension_lot: 0, require_color: 0, require_condition: 0, require_length: 0, require_width: 0, require_piece_qty: 0, track_bundle_qty: 0, weight_tolerance_pct: "", note: "", disabled: 0 };
}

export function MeasurementProfileWorkbench({ name, listPath, onNavigate, onSaved, onCancel }: MeasurementProfileWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<MeasurementDoc>(emptyDoc);
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [uoms, setUoms] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      adapter.getMeta("Measurement Profile"),
      adapter.getList("UOM", { fields: ["name"], orderBy: "name asc", pageLength: 200 }),
      name ? adapter.getDoc("Measurement Profile", name) : Promise.resolve(null),
    ]).then(([nextMeta, nextUoms, result]) => {
      if (!active) return;
      setMeta(nextMeta);
      setUoms(nextUoms);
      setDoc({ ...emptyDoc(), ...(result?.doc as MeasurementDoc ?? {}) });
    }).catch((error) => { if (active) toast.error(adapter.mapError(error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, name]);

  const patch = (next: Partial<MeasurementDoc>) => setDoc((current) => ({ ...current, ...next }));
  const inventoryModes = useMemo(() => selectOptions(meta, "inventory_mode"), [meta]);
  const fieldSet = useMemo(() => new Set(meta?.fields.map((field) => field.fieldname) ?? []), [meta]);
  const purchaseFields = useMemo(() => [
    ["Màu", on(doc.require_color)],
    ["Tình trạng", on(doc.require_condition)],
    ["Chiều dài", on(doc.require_length)],
    ["Chiều rộng", on(doc.require_width)],
    ["Số cây/lá/tấm", on(doc.require_piece_qty)],
    ["Số bó", on(doc.track_bundle_qty)],
  ] as Array<[string, boolean]>, [doc]);

  const save = async () => {
    if (!text(doc.profile_name)) { toast.error("Tên Bộ theo dõi không được để trống."); return; }
    if (!text(doc.inventory_mode)) { toast.error("Cần chọn chế độ tồn kho."); return; }
    if (!text(doc.stock_uom)) { toast.error("Cần chọn ĐVT tồn đề xuất."); return; }
    const tolerance = numberOrBlank(doc.weight_tolerance_pct);
    if (tolerance !== "" && (tolerance < 0 || tolerance > 50)) { toast.error("Dung sai cân phải nằm trong khoảng 0–50%."); return; }
    const payload: MeasurementDoc = { ...doc, profile_name: text(doc.profile_name), inventory_mode: text(doc.inventory_mode), stock_uom: text(doc.stock_uom), weight_tolerance_pct: tolerance, note: text(doc.note) };
    setSaving(true);
    try {
      const result = name
        ? await adapter.updateDoc("Measurement Profile", name, payload, text(doc.modified))
        : await adapter.createDoc("Measurement Profile", payload);
      const savedName = text((result as Json).name) || text(payload.profile_name);
      toast.success(name ? "Đã lưu Bộ theo dõi vật tư." : "Đã tạo Bộ theo dõi vật tư.");
      onSaved?.(savedName);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải Bộ theo dõi…</div>;

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-measurement-profile-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{name ? text(doc.profile_name) || name : "Tạo Bộ theo dõi vật tư"}</h2><Badge variant="outline">Purchase authority</Badge></div><p className="mt-1 text-sm text-muted-foreground">Quy định đại lượng vật lý cần nhập. PO và Receipt cùng đọc một nguồn này; Geometry của cửa không nằm ở đây.</p></div></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => onNavigate(`${currentPath}?master_ui=generic`)}>Form đầy đủ</Button><Button disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div>
      </div>
    </header>
    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"><div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Trục tồn & nhận diện</h3><div className="grid gap-3 md:grid-cols-3">
        <Field label="Tên Bộ theo dõi"><input className={fieldClass} disabled={Boolean(name)} value={text(doc.profile_name)} onChange={(e) => patch({ profile_name: e.target.value })} /></Field>
        <Field label="Chế độ tồn kho" hint="Mô tả kiểu tồn; không dùng chuỗi này để React tự quyết field."><select className={fieldClass} value={text(doc.inventory_mode)} onChange={(e) => patch({ inventory_mode: e.target.value })}><option value="">— chọn —</option>{inventoryModes.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="ĐVT tồn đề xuất"><select className={fieldClass} value={text(doc.stock_uom)} onChange={(e) => patch({ stock_uom: e.target.value })}><option value="">— chọn —</option>{uoms.map((row) => <option key={text(row.name)} value={text(row.name)}>{text(row.name)}</option>)}</select></Field>
        {fieldSet.has("weight_tolerance_pct") ? <Field label="Dung sai cân (%)" hint="0 là hợp lệ: lệch bất kỳ cũng cần giải trình."><input className={fieldClass} type="number" min="0" max="50" step="0.1" value={text(doc.weight_tolerance_pct)} onChange={(e) => patch({ weight_tolerance_pct: e.target.value })} /></Field> : null}
        <Check label="Theo lô kích thước" detail="Theo dõi kích thước theo từng lô/đợt nhận." checked={on(doc.track_dimension_lot)} onChange={(value) => patch({ track_dimension_lot: value ? 1 : 0 })} />
        <Check label="Ngưng dùng" detail="Không chọn cho Item mới; hồ sơ cũ vẫn giữ lịch sử." checked={on(doc.disabled)} onChange={(value) => patch({ disabled: value ? 1 : 0 })} />
      </div></section>

      <section className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Khi mua / nhận hàng cần nhập gì?</h3><p className="mb-3 text-xs text-muted-foreground">Các cờ này là authority. Không tạo purchase_show_* hay receipt_show_* riêng.</p><div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        <Check label="Bắt buộc màu" detail="Điều khiển field Màu ở PO/Receipt." checked={on(doc.require_color)} onChange={(value) => patch({ require_color: value ? 1 : 0 })} />
        <Check label="Bắt buộc tình trạng" detail="Thô / đã sơn / lỗi theo metadata chứng từ." checked={on(doc.require_condition)} onChange={(value) => patch({ require_condition: value ? 1 : 0 })} />
        <Check label="Bắt buộc chiều dài" detail="Hiện và bắt nhập length_m." checked={on(doc.require_length)} onChange={(value) => patch({ require_length: value ? 1 : 0 })} />
        <Check label="Bắt buộc chiều rộng" detail="Hiện và bắt nhập width_m cho vật tư cần khổ." checked={on(doc.require_width)} onChange={(value) => patch({ require_width: value ? 1 : 0 })} />
        <Check label="Bắt buộc số cây/lá/tấm" detail="Hiện và bắt nhập qty_bar." checked={on(doc.require_piece_qty)} onChange={(value) => patch({ require_piece_qty: value ? 1 : 0 })} />
        <Check label="Theo dõi số bó" detail="Hiện qty_bundle; không tự biến thành bắt buộc." checked={on(doc.track_bundle_qty)} onChange={(value) => patch({ track_bundle_qty: value ? 1 : 0 })} />
      </div></section>

      <section className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Ảnh hưởng runtime</h3><p className="mb-3 text-xs text-muted-foreground">Preview này phản chiếu trực tiếp các cờ trên. Server Purchase Runtime mới là contract cuối mà PO/Receipt render.</p><div className="grid gap-4 md:grid-cols-2">
        {(["Purchase Order", "Purchase Receipt"] as const).map((surface) => <div key={surface} className="rounded-lg border bg-background p-3"><div className="mb-2 flex items-center justify-between"><strong className="text-sm">{surface}</strong><Badge variant="outline">cùng Measurement Profile</Badge></div><ul className="space-y-1 text-sm">{purchaseFields.map(([label, visible]) => <li key={label} className={visible ? "text-foreground" : "text-muted-foreground"}>{visible ? "✓" : "—"} {label}</li>)}{surface === "Purchase Receipt" ? <li className="text-muted-foreground">+ field thực nhận/cân theo Item tracking</li> : null}</ul></div>)}
      </div></section>

      {fieldSet.has("note") ? <section className="rounded-xl border bg-card p-4"><Field label="Ghi chú" hint="Mô tả quy tắc, không nhét công thức BOM/Geometry vào đây."><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={text(doc.note)} onChange={(e) => patch({ note: e.target.value })} /></Field></section> : null}
    </div></main>
  </div>;
}
