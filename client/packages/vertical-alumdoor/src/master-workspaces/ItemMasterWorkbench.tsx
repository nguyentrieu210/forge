/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Boxes, ExternalLink, Link2, Loader2, Plus, Ruler, Save, Trash2 } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;
type ConversionRow = { uom?: string; conversion_factor?: number | string };
type TabId = "basic" | "uom" | "spec" | "runtime" | "links";

interface ItemDoc extends Json {
  name?: string;
  modified?: string;
  item_code?: string;
  item_name?: string;
  item_group?: string;
  description?: string;
  is_stock_item?: number | boolean;
  is_purchase_item?: number | boolean;
  is_sales_item?: number | boolean;
  disabled?: number | boolean;
  measurement_profile?: string;
  stock_uom?: string;
  default_purchase_uom?: string;
  default_sales_uom?: string;
  has_catch_weight?: number | boolean;
  weight_uom?: string;
  has_batch_no?: number | boolean;
  has_serial_no?: number | boolean;
  uom_conversions?: ConversionRow[];
  material_specification?: string;
  geometry_profile?: string;
  cutting_policy?: string;
  door_type?: string;
  purchase_kg_per_m2?: number | string;
  min_area_sqm?: number | string;
  default_warehouse?: string;
  valuation_method?: string;
}

export interface ItemMasterWorkbenchProps {
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function checked(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function numberOrBlank(value: unknown): number | "" { if (!text(value)) return ""; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : ""; }
function emptyItem(): ItemDoc {
  return { item_code: "", item_name: "", item_group: "", description: "", is_stock_item: 1, is_purchase_item: 1, is_sales_item: 1, disabled: 0, measurement_profile: "", stock_uom: "", default_purchase_uom: "", default_sales_uom: "", has_catch_weight: 0, weight_uom: "", has_batch_no: 0, has_serial_no: 0, uom_conversions: [], material_specification: "", geometry_profile: "", cutting_policy: "", door_type: "", purchase_kg_per_m2: "", min_area_sqm: "", default_warehouse: "", valuation_method: "" };
}
function OptionSelect({ value, values, onChange, placeholder = "— chọn —" }: { value: unknown; values: string[]; onChange: (value: string) => void; placeholder?: string }) {
  return <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={text(value)} onChange={(e) => onChange(e.target.value)}><option value="">{placeholder}</option>{values.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>;
}
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={className}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>;
}
function Check({ label, checked: value, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
function uniq(rows: Doc[]): string[] { return [...new Set(rows.map((row) => text(row.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")); }

export function ItemMasterWorkbench({ name, base, listPath, onNavigate, onSaved, onCancel }: ItemMasterWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<ItemDoc>(emptyItem);
  const [tab, setTab] = useState<TabId>("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldNames, setFieldNames] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState({ groups: [] as string[], uoms: [] as string[], profiles: [] as string[], specs: [] as string[], geometries: [] as string[], cuttings: [] as string[], warehouses: [] as string[] });
  const [measurement, setMeasurement] = useState<Json | null>(null);
  const [material, setMaterial] = useState<Json | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      adapter.getMeta("Item"),
      adapter.getList("Item Group", { fields: ["name"], orderBy: "name asc", pageLength: 300 }),
      adapter.getList("UOM", { fields: ["name"], orderBy: "name asc", pageLength: 300 }),
      adapter.getList("Measurement Profile", { fields: ["name"], orderBy: "name asc", pageLength: 100 }),
      adapter.getList("Material Specification", { fields: ["name"], orderBy: "name asc", pageLength: 300 }),
      adapter.getList("Geometry Profile", { fields: ["name"], orderBy: "name asc", pageLength: 100 }),
      adapter.getList("Cutting Policy", { fields: ["name"], orderBy: "name asc", pageLength: 200 }),
      adapter.getList("Warehouse", { fields: ["name"], orderBy: "name asc", pageLength: 200 }),
      name ? adapter.getDoc("Item", name) : Promise.resolve(null),
    ]).then(([meta, groups, uoms, profiles, specs, geometries, cuttings, warehouses, result]) => {
      if (!active) return;
      setFieldNames(new Set(meta.fields.map((field) => field.fieldname));
      setOptions({ groups: uniq(groups), uoms: uniq(uoms), profiles: uniq(profiles), specs: uniq(specs), geometries: uniq(geometries), cuttings: uniq(cuttings), warehouses: uniq(warehouses) });
      const incoming = result?.doc as ItemDoc | undefined;
      setDoc({ ...emptyItem(), ...(incoming ?? {}), uom_conversions: Array.isArray(incoming?.uom_conversions) ? incoming!.uom_conversions!.map((row) => ({ ...row })) : [] });
    }).catch((error) => { if (active) toast.error(adapter.mapError(error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, name]);

  useEffect(() => {
    let active = true;
    const profile = text(doc.measurement_profile);
    if (!profile) { setMeasurement(null); return; }
    void adapter.getDoc("Measurement Profile", profile).then(({ doc: value }) => { if (active) setMeasurement(value as Json); }).catch(() => { if (active) setMeasurement(null); });
    return () => { active = false; };
  }, [adapter, doc.measurement_profile]);
  useEffect(() => {
    let active = true;
    const spec = text(doc.material_specification);
    if (!spec) { setMaterial(null); return; }
    void adapter.getDoc("Material Specification", spec).then(({ doc: value }) => { if (active) setMaterial(value as Json); }).catch(() => { if (active) setMaterial(null); });
    return () => { active = false; };
  }, [adapter, doc.material_specification]);

  const patch = (next: Partial<ItemDoc>) => setDoc((current) => ({ ...current, ...next }));
  const conversions = Array.isArray(doc.uom_conversions) ? doc.uom_conversions : [];
  const catchWeight = checked(doc.has_catch_weight);
  const purchaseUom = text(doc.default_purchase_uom);
  const stockUom = text(doc.stock_uom);
  const salesUom = text(doc.default_sales_uom);
  const dynamicPurchaseAxis = catchWeight && purchaseUom && stockUom && purchaseUom !== stockUom && text(doc.weight_uom) === purchaseUom;
  const conversionMap = useMemo(() => new Map(conversions.map((row) => [text(row.uom), Number(row.conversion_factor)])), [conversions]);
  const warnings = useMemo(() => {
    const rows: string[] = [];
    if (!text(doc.measurement_profile)) rows.push("Chưa gắn Bộ theo dõi vật tư: PO/Receipt chỉ có thể dùng contract cơ bản.");
    if (checked(doc.is_stock_item) && !stockUom) rows.push("Mặt hàng quản lý tồn nhưng chưa có ĐVT tồn.");
    if (checked(doc.is_purchase_item) && !purchaseUom) rows.push("Mặt hàng mua nhưng chưa có ĐVT mua mặc định.");
    if (dynamicPurchaseAxis && conversions.some((row) => text(row.uom) === purchaseUom)) rows.push(`ĐVT mua ${purchaseUom} là catch-weight động: không khai hệ số ${purchaseUom} → ${stockUom} cố định trên Item.`);
    if (!dynamicPurchaseAxis && purchaseUom && stockUom && purchaseUom !== stockUom && !conversionMap.has(purchaseUom)) rows.push(`Thiếu hệ số quy đổi tĩnh ${purchaseUom} → ${stockUom}.`);
    if (salesUom && stockUom && salesUom !== stockUom && !conversionMap.has(salesUom)) rows.push(`ĐVT bán ${salesUom} khác ĐVT tồn nhưng chưa có hệ số quy đổi tĩnh.`);
    if (text(doc.geometry_profile) && !checked(doc.is_sales_item)) rows.push("Đã gắn Geometry Profile nhưng Item đang tắt Cho phép bán.");
    return rows;
  }, [conversionMap, conversions, doc.geometry_profile, doc.is_purchase_item, doc.is_sales_item, doc.is_stock_item, doc.measurement_profile, dynamicPurchaseAxis, purchaseUom, salesUom, stockUom]);

  const validate = (): string | null => {
    if (!text(doc.item_code)) return "Mã hàng không được để trống.";
    if (!text(doc.item_name)) return "Tên hàng không được để trống.";
    if (!text(doc.item_group)) return "Cần chọn Nhóm hàng.";
    if (checked(doc.is_stock_item) && !stockUom) return "Mặt hàng tồn kho phải có ĐVT tồn.";
    if (checked(doc.is_purchase_item) && !purchaseUom) return "Mặt hàng mua phải có ĐVT mua.";
    if (catchWeight && !text(doc.weight_uom)) return "Catch-weight phải khai ĐVT cân.";
    const seen = new Set<string>();
    for (const row of conversions) {
      const uom = text(row.uom); const factor = Number(row.conversion_factor);
      if (!uom) return "Một dòng quy đổi đang thiếu ĐVT.";
      if (!Number.isFinite(factor) || factor <= 0) return `Hệ số của ${uom} phải lớn hơn 0.`;
      if (uom === stockUom) return `Không khai ${stockUom} trong bảng quy đổi; ĐVT tồn luôn có hệ số 1.`;
      if (seen.has(uom)) return `ĐVT ${uom} bị lặp trong bảng quy đổi.`;
      seen.add(uom);
    }
    if (dynamicPurchaseAxis && seen.has(purchaseUom)) return `Catch-weight ${purchaseUom} → ${stockUom} phải tính theo từng dòng nhận, không dùng hệ số tĩnh.`;
    if (!dynamicPurchaseAxis && purchaseUom && stockUom && purchaseUom !== stockUom && !seen.has(purchaseUom)) return `Cần hệ số quy đổi ${purchaseUom} → ${stockUom}, hoặc cấu hình catch-weight hợp lệ.`;
    if (salesUom && stockUom && salesUom !== stockUom && !seen.has(salesUom)) return `Cần hệ số quy đổi ${salesUom} → ${stockUom} cho ĐVT bán.`;
    return null;
  };

  const save = async () => {
    const error = validate(); if (error) { toast.error(error); return; }
    const payload: ItemDoc = {};
    for (const [key, value] of Object.entries(doc)) {
      if (["name", "modified", "owner", "creation", "doctype"].includes(key) || !fieldNames.has(key)) continue;
      if (key === "uom_conversions") payload[key] = conversions.map((row) => ({ uom: text(row.uom), conversion_factor: Number(row.conversion_factor) }));
      else if (["purchase_kg_per_m2", "min_area_sqm"].includes(key)) payload[key] = numberOrBlank(value);
      else payload[key] = value;
    }
    payload.item_code = text(doc.item_code); payload.item_name = text(doc.item_name); payload.item_group = text(doc.item_group);
    setSaving(true);
    try {
      const result = name ? await adapter.updateDoc("Item", name, payload, text(doc.modified)) : await adapter.createDoc("Item", payload);
      const savedName = text((result as Json).name) || text(doc.item_code);
      toast.success(name ? "Đã lưu mặt hàng." : "Đã tạo mặt hàng."); onSaved?.(savedName);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  const setConversion = (index: number, next: Partial<ConversionRow>) => patch({ uom_conversions: conversions.map((row, i) => i === index ? { ...row, ...next } : row) });
  const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  const masterLink = (doctype: string, masterName: unknown) => masterName ? `${base}/${encodeURIComponent(doctype)}/${encodeURIComponent(text(masterName))}` : `${base}/${encodeURIComponent(doctype)}`;

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải mặt hàng…</div>;
  const tabs: Array<[TabId, string]> = [["basic", "Cơ bản"], ["uom", "ĐVT & theo dõi"], ["spec", "Quy cách"], ["runtime", "Runtime summary"], ["links", "Nguồn dữ liệu"]];

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-item-master-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{name ? `${text(doc.item_code) || name} · ${text(doc.item_name)}` : "Tạo mặt hàng"}</h2><Badge variant="outline">Item authority map</Badge></div><p className="mt-1 text-sm text-muted-foreground">Item giữ danh tính và liên kết authority; không sao chép các cờ Measurement/Geometry vào đây.</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => onNavigate(`${currentPath}?master_ui=generic`)}>Form đầy đủ</Button><Button disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div></div>
      <nav className="mt-3 flex gap-1 overflow-x-auto">{tabs.map(([id, label]) => <Button key={id} size="sm" variant={tab === id ? "default" : "ghost"} onClick={() => setTab(id)}>{label}</Button>)}</nav></header>
    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"><div className="mx-auto max-w-7xl space-y-4">
      {warnings.length ? <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"><div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4" /> Cần chú ý</div><ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{warnings.map((row) => <li key={row}>{row}</li>)}</ul></div> : null}

      {tab === "basic" ? <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Boxes className="size-4" /><h3 className="font-medium">Danh tính mặt hàng</h3></div><div className="grid gap-3 md:grid-cols-4">
        <Field label="Mã hàng"><input className={fieldClass} disabled={Boolean(name)} value={text(doc.item_code)} onChange={(e) => patch({ item_code: e.target.value })} /></Field><Field label="Tên hàng" className="md:col-span-2"><input className={fieldClass} value={text(doc.item_name)} onChange={(e) => patch({ item_name: e.target.value })} /></Field><Field label="Nhóm hàng"><OptionSelect value={doc.item_group} values={options.groups} onChange={(value) => patch({ item_group: value })} /></Field>
        <div className="grid gap-2 md:col-span-4 md:grid-cols-4"><Check label="Quản lý tồn" checked={checked(doc.is_stock_item)} onChange={(value) => patch({ is_stock_item: value ? 1 : 0 })} /><Check label="Cho phép mua" checked={checked(doc.is_purchase_item)} onChange={(value) => patch({ is_purchase_item: value ? 1 : 0 })} /><Check label="Cho phép bán" checked={checked(doc.is_sales_item)} onChange={(value) => patch({ is_sales_item: value ? 1 : 0 })} /><Check label="Ngưng dùng" checked={checked(doc.disabled)} onChange={(value) => patch({ disabled: value ? 1 : 0 })} /></div>
        {fieldNames.has("description") ? <Field label="Mô tả" className="md:col-span-4"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={text(doc.description)} onChange={(e) => patch({ description: e.target.value })} /></Field> : null}
      </div></section> : null}

      {tab === "uom" ? <section className="rounded-xl border bg-card p-4"><div className="mb-1 flex items-center gap-2"><Ruler className="size-4" /><h3 className="font-medium">ĐVT & theo dõi</h3></div><p className="mb-3 text-xs text-muted-foreground">Catch-weight chỉ làm động trục ĐVT cân → ĐVT tồn; các quy đổi khác vẫn có thể là static nếu có thật.</p><div className="grid gap-3 md:grid-cols-4">
        <Field label="Measurement Profile"><OptionSelect value={doc.measurement_profile} values={options.profiles} onChange={(value) => patch({ measurement_profile: value })} /></Field><Field label="ĐVT tồn"><OptionSelect value={doc.stock_uom} values={options.uoms} onChange={(value) => patch({ stock_uom: value })} /></Field><Field label="ĐVT mua"><OptionSelect value={doc.default_purchase_uom} values={options.uoms} onChange={(value) => patch({ default_purchase_uom: value })} /></Field><Field label="ĐVT bán"><OptionSelect value={doc.default_sales_uom} values={options.uoms} onChange={(value) => patch({ default_sales_uom: value })} /></Field>
        <Check label="Catch weight" checked={catchWeight} onChange={(value) => patch({ has_catch_weight: value ? 1 : 0 })} /><Field label="ĐVT cân"><OptionSelect value={doc.weight_uom} values={options.uoms} onChange={(value) => patch({ weight_uom: value })} /></Field><Check label="Theo lô" checked={checked(doc.has_batch_no)} onChange={(value) => patch({ has_batch_no: value ? 1 : 0 })} /><Check label="Theo serial" checked={checked(doc.has_serial_no)} onChange={(value) => patch({ has_serial_no: value ? 1 : 0 })} />
      </div><div className="mt-4 border-t pt-4"><div className="mb-2 flex items-center justify-between"><div><h4 className="text-sm font-medium">Quy đổi tĩnh về ĐVT tồn</h4><p className="text-[11px] text-muted-foreground">Không thêm dòng cho trục catch-weight động.</p></div><Button size="sm" variant="outline" onClick={() => patch({ uom_conversions: [...conversions, { uom: "", conversion_factor: "" }] })}><Plus className="size-3.5" /> Thêm</Button></div><div className="space-y-2">{conversions.length ? conversions.map((row, index) => <div key={`${index}-${text(row.uom)}`} className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_1fr_auto]"><OptionSelect value={row.uom} values={options.uoms.filter((value) => value !== stockUom)} onChange={(value) => setConversion(index, { uom: value })} /><input className={fieldClass} type="number" min="0" step="0.000001" placeholder={`1 ĐVT = ? ${stockUom || "ĐVT tồn"}`} value={text(row.conversion_factor)} onChange={(e) => setConversion(index, { conversion_factor: e.target.value })} /><Button variant="ghost" size="sm" onClick={() => patch({ uom_conversions: conversions.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></div>) : <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Không có quy đổi tĩnh.</div>}</div></div></section> : null}

      {tab === "spec" ? <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Quy cách & authority liên quan</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Material Specification"><OptionSelect value={doc.material_specification} values={options.specs} onChange={(value) => patch({ material_specification: value })} /></Field><Field label="Geometry Profile"><OptionSelect value={doc.geometry_profile} values={options.geometries} onChange={(value) => patch({ geometry_profile: value })} /></Field><Field label="Cutting Policy"><OptionSelect value={doc.cutting_policy} values={options.cuttings} onChange={(value) => patch({ cutting_policy: value })} /></Field>{fieldNames.has("door_type") ? <Field label="Loại cửa"><input className={fieldClass} value={text(doc.door_type)} onChange={(e) => patch({ door_type: e.target.value })} /></Field> : null}{fieldNames.has("purchase_kg_per_m2") ? <Field label="Barem mua kg/m²"><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.purchase_kg_per_m2)} onChange={(e) => patch({ purchase_kg_per_m2: e.target.value })} /></Field> : null}{fieldNames.has("min_area_sqm") ? <Field label="Diện tích tối thiểu tính tiền"><input className={fieldClass} type="number" min="0" step="0.01" value={text(doc.min_area_sqm)} onChange={(e) => patch({ min_area_sqm: e.target.value })} /></Field> : null}{fieldNames.has("default_warehouse") ? <Field label="Kho mặc định"><OptionSelect value={doc.default_warehouse} values={options.warehouses} onChange={(value) => patch({ default_warehouse: value })} /></Field> : null}{fieldNames.has("valuation_method") ? <Field label="Phương pháp giá vốn"><input className={fieldClass} value={text(doc.valuation_method)} onChange={(e) => patch({ valuation_method: e.target.value })} /></Field> : null}</div></section> : null}

      {tab === "runtime" ? <section className="space-y-3"><div className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Runtime summary</h3><p className="mb-3 text-xs text-muted-foreground">Chỉ đọc các authority đã liên kết; không lưu bản sao của rule vào Item.</p><div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border bg-background p-3"><div className="mb-2 flex items-center justify-between"><strong>MUA</strong><Badge variant="outline">Purchase</Badge></div><dl className="space-y-1 text-sm"><div><dt className="inline text-muted-foreground">Measurement: </dt><dd className="inline font-medium">{text(doc.measurement_profile) || "—"}</dd></div><div><dt className="inline text-muted-foreground">Material Spec: </dt><dd className="inline font-medium">{text(doc.material_specification) || "—"}</dd></div><div><dt className="inline text-muted-foreground">ĐVT mua → tồn: </dt><dd className="inline">{purchaseUom || "—"} → {stockUom || "—"}</dd></div><div><dt className="inline text-muted-foreground">Catch weight: </dt><dd className="inline">{catchWeight ? `Có · cân ${text(doc.weight_uom) || "?"}` : "Không"}</dd></div><div><dt className="inline text-muted-foreground">Profile yêu cầu: </dt><dd className="inline">{measurement ? [checked(measurement.require_color) && "màu", checked(measurement.require_condition) && "tình trạng", checked(measurement.require_length) && "dài", checked(measurement.require_width) && "rộng", checked(measurement.require_piece_qty) && "số cây/lá", checked(measurement.track_bundle_qty) && "số bó"].filter(Boolean).join(" · ") || "chỉ SL" : "chưa đọc được"}</dd></div><div><dt className="inline text-muted-foreground">Kg/m: </dt><dd className="inline">{material && text(material.theoretical_kg_per_m) ? `${text(material.theoretical_kg_per_m)} kg/m` : "—"}</dd></div></dl></div>
        <div className="rounded-lg border bg-background p-3"><div className="mb-2 flex items-center justify-between"><strong>BÁN</strong><Badge variant="outline">Sales</Badge></div><dl className="space-y-1 text-sm"><div><dt className="inline text-muted-foreground">Geometry: </dt><dd className="inline font-medium">{text(doc.geometry_profile) || "—"}</dd></div><div><dt className="inline text-muted-foreground">Cutting: </dt><dd className="inline font-medium">{text(doc.cutting_policy) || "—"}</dd></div><div><dt className="inline text-muted-foreground">ĐVT bán: </dt><dd className="inline">{salesUom || "—"}</dd></div><div><dt className="inline text-muted-foreground">Loại cửa: </dt><dd className="inline">{text(doc.door_type) || "—"}</dd></div></dl></div>
        <div className="rounded-lg border bg-background p-3"><div className="mb-2 flex items-center justify-between"><strong>SẢN XUẤT</strong><Badge variant="outline">Link authority</Badge></div><p className="text-sm text-muted-foreground">BOM/Router không được bịa thành field Item nếu schema hiện tại chưa có mapping. Workbench chỉ hiển thị authority thật đang có.</p><div className="mt-2 text-sm"><strong>Geometry / Cutting</strong> cung cấp đầu vào công thức; BOM và Routing tiếp tục là master riêng.</div></div>
      </div></div></section> : null}

      {tab === "links" ? <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Link2 className="size-4" /><h3 className="font-medium">Đi tới nguồn dữ liệu</h3></div><div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{[["Measurement Profile", doc.measurement_profile, "Bộ theo dõi vật tư"], ["Material Specification", doc.material_specification, "Quy cách kỹ thuật"], ["Geometry Profile", doc.geometry_profile, "Geometry Profile"], ["Cutting Policy", doc.cutting_policy, "Cutting Policy"]].map(([doctype, value, label]) => <button key={doctype} type="button" onClick={() => onNavigate(masterLink(doctype, value))} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted/40"><span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{text(value) || "Mở danh sách"}</span></span><ExternalLink className="size-4 text-muted-foreground" /></button>)}</div></section> : null}
    </div></main>
  </div>;
}
