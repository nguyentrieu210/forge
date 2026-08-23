/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Boxes, ExternalLink, Link2, Loader2, Plus, Ruler, Save, Trash2 } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;
type TabId = "basic" | "uom" | "spec" | "links";

type UomConversion = Json & {
  uom?: string;
  conversion_factor?: number | string;
};

type ItemDoc = Json & {
  name?: string;
  modified?: string;
  item_code?: string;
  item_name?: string;
  item_group?: string;
  item_nature?: string;
  material_stage?: string;
  supply_type?: string;
  is_stock_item?: number | boolean;
  is_purchase_item?: number | boolean;
  is_sales_item?: number | boolean;
  disabled?: number | boolean;
  measurement_profile?: string;
  stock_uom?: string;
  has_catch_weight?: number | boolean;
  weight_uom?: string;
  default_purchase_uom?: string;
  default_sales_uom?: string;
  uom_conversions?: UomConversion[];
  material_specification?: string;
  geometry_profile?: string;
  door_type?: string;
  cutting_policy?: string;
  purchase_kg_per_m2?: number | string;
  min_area_sqm?: number | string;
  default_warehouse?: string;
  valuation_method?: string;
  has_batch_no?: number | boolean;
  has_serial_no?: number | boolean;
  allow_negative_stock?: number | boolean;
};

type Options = {
  itemGroups: Doc[];
  profiles: Doc[];
  uoms: Doc[];
  specifications: Doc[];
  geometryProfiles: Doc[];
  cuttingPolicies: Doc[];
  warehouses: Doc[];
};

export interface ItemMasterWorkbenchProps {
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const EMPTY_OPTIONS: Options = {
  itemGroups: [], profiles: [], uoms: [], specifications: [], geometryProfiles: [], cuttingPolicies: [], warehouses: [],
};

const DOOR_TYPES = ["Cửa Đức", "Cửa Úc", "Cửa Lưới", "Cửa Đài Loan", "Cửa Siêu Trường", "Cửa tấm liền Úc"];
const ITEM_NATURES = ["Hàng tồn kho", "Dịch vụ", "Tài sản"];
const MATERIAL_STAGES = ["Nguyên vật liệu", "Vật tư tiêu hao", "Bán thành phẩm", "Thành phẩm", "Hàng hoá"];
const SUPPLY_TYPES = ["Mua ngoài", "Tự sản xuất", "Mua hoặc sản xuất"];
const VALUATION_METHODS = ["FIFO", "Bình quân di động"];

function emptyItem(): ItemDoc {
  return {
    item_code: "",
    item_name: "",
    item_group: "",
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    is_purchase_item: 1,
    is_sales_item: 1,
    disabled: 0,
    measurement_profile: "",
    stock_uom: "",
    has_catch_weight: 0,
    weight_uom: "Kg",
    default_purchase_uom: "",
    default_sales_uom: "",
    uom_conversions: [],
    material_specification: "",
    geometry_profile: "",
    door_type: "",
    cutting_policy: "",
    purchase_kg_per_m2: "",
    min_area_sqm: "",
    default_warehouse: "",
    valuation_method: "FIFO",
    has_batch_no: 0,
    has_serial_no: 0,
    allow_negative_stock: 0,
  };
}

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function on(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function numberOrBlank(value: unknown): number | "" {
  if (text(value) === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}
function rows(value: unknown): UomConversion[] {
  return Array.isArray(value) ? value.filter((row): row is UomConversion => Boolean(row) && typeof row === "object") : [];
}
function optionName(row: Doc): string { return text(row.name); }

const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>;
}
function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
function NativeSelect({ value, rows, empty = "— chọn —", onChange }: { value: string; rows: Doc[]; empty?: string; onChange: (value: string) => void }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{rows.map((row) => <option key={optionName(row)} value={optionName(row)}>{optionName(row)}</option>)}</select>;
}

export function ItemMasterWorkbench({ name, base, listPath, onNavigate, onSaved, onCancel }: ItemMasterWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<ItemDoc>(emptyItem);
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [tab, setTab] = useState<TabId>("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const optionLoads = Promise.all([
          adapter.getList("Item Group", { fields: ["name"], orderBy: "name asc", pageLength: 300 }),
          adapter.getList("Measurement Profile", { fields: ["name"], orderBy: "name asc", pageLength: 100 }),
          adapter.getList("UOM", { fields: ["name"], orderBy: "name asc", pageLength: 100 }),
          adapter.getList("Material Specification", { fields: ["name"], orderBy: "name asc", pageLength: 300 }).catch(() => [] as Doc[]),
          adapter.getList("Geometry Profile", { fields: ["name"], orderBy: "name asc", pageLength: 100 }).catch(() => [] as Doc[]),
          adapter.getList("Cutting Policy", { fields: ["name"], orderBy: "name asc", pageLength: 100 }).catch(() => [] as Doc[]),
          adapter.getList("Warehouse", { fields: ["name"], orderBy: "name asc", pageLength: 200 }).catch(() => [] as Doc[]),
        ]);
        const [itemGroups, profiles, uoms, specifications, geometryProfiles, cuttingPolicies, warehouses] = await optionLoads;
        const loaded = name ? (await adapter.getDoc("Item", name)).doc as ItemDoc : emptyItem();
        if (!active) return;
        setOptions({ itemGroups, profiles, uoms, specifications, geometryProfiles, cuttingPolicies, warehouses });
        setDoc({ ...emptyItem(), ...loaded, uom_conversions: rows(loaded.uom_conversions) });
      } catch (error) {
        if (active) toast.error(adapter.mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, name]);

  const patch = (next: Partial<ItemDoc>) => setDoc((current) => ({ ...current, ...next }));
  const patchConversion = (index: number, next: Partial<UomConversion>) => setDoc((current) => ({
    ...current,
    uom_conversions: rows(current.uom_conversions).map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row),
  }));

  const purchaseUom = text(doc.default_purchase_uom) || text(doc.stock_uom);
  const salesUom = text(doc.default_sales_uom) || text(doc.stock_uom);
  const conversions = rows(doc.uom_conversions);
  const catchWeight = on(doc.has_catch_weight);
  const isDoor = Boolean(text(doc.door_type));

  const warnings = useMemo(() => {
    const result: string[] = [];
    if (!text(doc.material_specification) && !isDoor && text(doc.material_stage) === "Nguyên vật liệu") result.push("Nguyên vật liệu chưa gắn Quy cách kỹ thuật. Không chặn lưu, nhưng Kg/m và thông số vật tư có thể chưa đủ để quy đổi.");
    if (isDoor && !text(doc.geometry_profile)) result.push("Thành phẩm cửa chưa gắn Bộ quy cách hình học — màn bán hàng sẽ không biết cần những kích thước nào.");
    if (isDoor && numberOrBlank(doc.purchase_kg_per_m2) === "") result.push("Chưa có barem Kg/m². Hệ thống hiện cho phát sản xuất nhưng phần ước tính Kg mua sẽ để trống.");
    if (purchaseUom !== text(doc.stock_uom) && !conversions.some((row) => text(row.uom) === purchaseUom)) result.push(`ĐVT mua ${purchaseUom} khác ĐVT tồn ${text(doc.stock_uom)} nhưng chưa có dòng quy đổi.`);
    if (salesUom !== text(doc.stock_uom) && !conversions.some((row) => text(row.uom) === salesUom)) result.push(`ĐVT bán ${salesUom} khác ĐVT tồn ${text(doc.stock_uom)} nhưng chưa có dòng quy đổi.`);
    if (catchWeight && conversions.length) result.push("Mặt hàng cân theo kiện không được dùng hệ số quy đổi cố định; khối lượng phải bắt tại từng dòng/lô.");
    if (on(doc.has_batch_no) && on(doc.has_serial_no)) result.push("Không bật đồng thời theo lô và theo serial cho cùng một mặt hàng.");
    return result;
  }, [catchWeight, conversions, doc, isDoor, purchaseUom, salesUom]);

  const validate = (): string | null => {
    if (!name && !/^[A-Z0-9][A-Z0-9.-]{0,23}$/.test(text(doc.item_code))) return "Mã hàng chỉ dùng chữ IN HOA, số, dấu gạch ngang và dấu chấm — tối đa 24 ký tự.";
    if (!text(doc.item_name)) return "Tên hàng không được để trống.";
    if (!text(doc.item_group)) return "Cần chọn Nhóm hàng.";
    if (!text(doc.measurement_profile)) return "Cần chọn Bộ theo dõi vật tư.";
    if (!text(doc.stock_uom)) return "Cần chọn ĐVT tồn.";
    if (catchWeight && !text(doc.weight_uom)) return "Mặt hàng cân theo kiện phải khai ĐVT khối lượng.";
    if (catchWeight && conversions.length) return "Mặt hàng cân theo kiện không dùng hệ số quy đổi cố định. Xoá các dòng quy đổi trước khi lưu.";
    if (!catchWeight && purchaseUom !== text(doc.stock_uom) && !conversions.some((row) => text(row.uom) === purchaseUom && Number(row.conversion_factor) > 0)) return `Cần khai hệ số quy đổi cho ĐVT mua ${purchaseUom}.`;
    if (!catchWeight && salesUom !== text(doc.stock_uom) && !conversions.some((row) => text(row.uom) === salesUom && Number(row.conversion_factor) > 0)) return `Cần khai hệ số quy đổi cho ĐVT bán ${salesUom}.`;
    if (isDoor && !text(doc.cutting_policy)) return "Thành phẩm cửa phải chọn Công thức cửa / Cutting Policy.";
    if (isDoor && !text(doc.geometry_profile)) return "Thành phẩm cửa phải chọn Bộ quy cách hình học.";
    if (on(doc.has_batch_no) && on(doc.has_serial_no)) return "Không được bật đồng thời Theo lô và Theo serial.";
    if (conversions.some((row) => !text(row.uom) || !(Number(row.conversion_factor) > 0))) return "Mỗi dòng quy đổi phải có ĐVT và hệ số lớn hơn 0.";
    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }
    setSaving(true);
    try {
      const payload: ItemDoc = {
        ...doc,
        item_code: text(doc.item_code),
        item_name: text(doc.item_name),
        item_group: text(doc.item_group),
        measurement_profile: text(doc.measurement_profile),
        stock_uom: text(doc.stock_uom),
        weight_uom: catchWeight ? text(doc.weight_uom) : "",
        uom_conversions: conversions.map((row) => ({ ...row, uom: text(row.uom), conversion_factor: Number(row.conversion_factor) })),
        purchase_kg_per_m2: numberOrBlank(doc.purchase_kg_per_m2),
        min_area_sqm: numberOrBlank(doc.min_area_sqm),
      };
      if (name) {
        const updated = await adapter.updateDoc("Item", name, payload, text(doc.modified));
        const savedName = text((updated as Json).name) || name;
        toast.success("Đã lưu mặt hàng.");
        onSaved?.(savedName);
      } else {
        const created = await adapter.createDoc("Item", payload);
        const savedName = text((created as Json).name) || text(payload.item_code);
        toast.success("Đã tạo mặt hàng.");
        onSaved?.(savedName);
      }
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  const openGeneric = () => onNavigate(`${currentPath}?master_ui=generic`);
  const openDoc = (doctype: string, target?: string) => onNavigate(target ? `${base}/${encodeURIComponent(doctype)}/${encodeURIComponent(target)}` : `${base}/${encodeURIComponent(doctype)}`);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải hồ sơ mặt hàng…</div>;

  const tabs: Array<{ id: TabId; label: string; icon: ReactNode }> = [
    { id: "basic", label: "Cơ bản", icon: <Boxes className="size-4" /> },
    { id: "uom", label: "ĐVT & kho", icon: <Ruler className="size-4" /> },
    { id: "spec", label: "Quy cách & cửa", icon: <Link2 className="size-4" /> },
    { id: "links", label: "Liên kết", icon: <ExternalLink className="size-4" /> },
  ];

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-item-master-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button>
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{name ? `${text(doc.item_code) || name} · ${text(doc.item_name)}` : "Tạo mặt hàng"}</h2>{doc.disabled ? <Badge variant="destructive">Ngưng dùng</Badge> : <Badge variant="outline">Đang dùng</Badge>}{isDoor ? <Badge variant="outline">{text(doc.door_type)}</Badge> : null}</div><p className="mt-1 text-sm text-muted-foreground">Một chỗ để hoàn thiện Item, ĐVT, quy cách và các liên kết kỹ thuật; generic form vẫn còn làm đường dự phòng.</p></div>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={openGeneric}>Form đầy đủ</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">{tabs.map((entry) => <Button key={entry.id} size="sm" variant={tab === entry.id ? "default" : "ghost"} onClick={() => setTab(entry.id)}>{entry.icon}{entry.label}</Button>)}</div>
    </header>

    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        {warnings.length ? <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"><div className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Cần chú ý trước khi dùng mặt hàng</div><ul className="space-y-1 text-sm text-muted-foreground">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></section> : null}

        {tab === "basic" ? <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Nhận diện & vai trò</h3><div className="grid gap-3 md:grid-cols-4">
          <Field label="Mã hàng"><input className={fieldClass} value={text(doc.item_code)} disabled={Boolean(name)} onChange={(e) => patch({ item_code: e.target.value.toUpperCase() })} placeholder="RAY-U100" /></Field>
          <Field label="Tên hàng" className="md:col-span-2"><input className={fieldClass} value={text(doc.item_name)} onChange={(e) => patch({ item_name: e.target.value })} /></Field>
          <Field label="Nhóm hàng"><NativeSelect value={text(doc.item_group)} rows={options.itemGroups} onChange={(value) => patch({ item_group: value })} /></Field>
          <Field label="Tính chất"><select className={fieldClass} value={text(doc.item_nature)} onChange={(e) => patch({ item_nature: e.target.value })}>{ITEM_NATURES.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Giai đoạn vật tư"><select className={fieldClass} value={text(doc.material_stage)} onChange={(e) => patch({ material_stage: e.target.value })}>{MATERIAL_STAGES.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Nguồn cung"><select className={fieldClass} value={text(doc.supply_type)} onChange={(e) => patch({ supply_type: e.target.value })}>{SUPPLY_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Phương pháp giá vốn"><select className={fieldClass} value={text(doc.valuation_method)} onChange={(e) => patch({ valuation_method: e.target.value })}>{VALUATION_METHODS.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <div className="grid gap-2 md:col-span-4 sm:grid-cols-2 lg:grid-cols-5"><Check label="Theo dõi tồn" checked={on(doc.is_stock_item)} onChange={(checked) => patch({ is_stock_item: checked ? 1 : 0 })} /><Check label="Được mua" checked={on(doc.is_purchase_item)} onChange={(checked) => patch({ is_purchase_item: checked ? 1 : 0 })} /><Check label="Được bán" checked={on(doc.is_sales_item)} onChange={(checked) => patch({ is_sales_item: checked ? 1 : 0 })} /><Check label="Cho tồn âm" checked={on(doc.allow_negative_stock)} onChange={(checked) => patch({ allow_negative_stock: checked ? 1 : 0 })} /><Check label="Ngưng dùng" checked={on(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /></div>
        </div></section> : null}

        {tab === "uom" ? <><section className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Đơn vị & theo dõi kho</h3><p className="mb-3 text-xs text-muted-foreground">Bộ theo dõi vật tư là nguồn quy tắc; không viết lại inventory mode ở Item.</p><div className="grid gap-3 md:grid-cols-4">
          <Field label="Bộ theo dõi vật tư"><NativeSelect value={text(doc.measurement_profile)} rows={options.profiles} onChange={(value) => patch({ measurement_profile: value })} /></Field>
          <Field label="ĐVT tồn"><NativeSelect value={text(doc.stock_uom)} rows={options.uoms} onChange={(value) => patch({ stock_uom: value })} /></Field>
          <Field label="ĐVT mua mặc định"><NativeSelect value={text(doc.default_purchase_uom)} rows={options.uoms} empty={`Theo ĐVT tồn${text(doc.stock_uom) ? ` · ${text(doc.stock_uom)}` : ""}`} onChange={(value) => patch({ default_purchase_uom: value })} /></Field>
          <Field label="ĐVT bán mặc định"><NativeSelect value={text(doc.default_sales_uom)} rows={options.uoms} empty={`Theo ĐVT tồn${text(doc.stock_uom) ? ` · ${text(doc.stock_uom)}` : ""}`} onChange={(value) => patch({ default_sales_uom: value })} /></Field>
          <Check label="Cân theo kiện / catch weight" checked={catchWeight} onChange={(checked) => patch({ has_catch_weight: checked ? 1 : 0, ...(checked ? { weight_uom: text(doc.weight_uom) || "Kg", has_batch_no: 1 } : {}) })} />
          <Field label="ĐVT khối lượng"><NativeSelect value={text(doc.weight_uom)} rows={options.uoms} onChange={(value) => patch({ weight_uom: value })} /></Field>
          <Check label="Theo lô" checked={on(doc.has_batch_no)} onChange={(checked) => patch({ has_batch_no: checked ? 1 : 0 })} />
          <Check label="Theo serial" checked={on(doc.has_serial_no)} onChange={(checked) => patch({ has_serial_no: checked ? 1 : 0 })} />
          <Field label="Kho mặc định" className="md:col-span-2"><NativeSelect value={text(doc.default_warehouse)} rows={options.warehouses} onChange={(value) => patch({ default_warehouse: value })} /></Field>
        </div></section>
        <section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Hệ số quy đổi cố định</h3><p className="text-xs text-muted-foreground">Chỉ dùng khi ĐVT mua/bán khác ĐVT tồn. Mặt hàng catch-weight không dùng bảng này.</p></div><Button size="sm" variant="outline" disabled={catchWeight} onClick={() => patch({ uom_conversions: [...conversions, { uom: "", conversion_factor: 1 }] })}><Plus className="size-4" /> Thêm</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Đơn vị</th><th className="p-3">1 đơn vị này = bao nhiêu ĐVT tồn</th><th className="w-12" /></tr></thead><tbody>{conversions.length ? conversions.map((row, index) => <tr key={text(row.name) || index} className="border-b"><td className="p-2"><NativeSelect value={text(row.uom)} rows={options.uoms} onChange={(value) => patchConversion(index, { uom: value })} /></td><td className="p-2"><input className={fieldClass} type="number" min="0.000001" step="0.000001" value={text(row.conversion_factor)} onChange={(e) => patchConversion(index, { conversion_factor: e.target.value })} /></td><td className="p-2"><Button size="sm" variant="ghost" onClick={() => patch({ uom_conversions: conversions.filter((_, rowIndex) => rowIndex !== index) })}><Trash2 className="size-4" /></Button></td></tr>) : <tr><td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">Không cần quy đổi cố định khi mua, tồn và bán cùng đơn vị.</td></tr>}</tbody></table></div></section></> : null}

        {tab === "spec" ? <section className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Quy cách kỹ thuật & thành phẩm cửa</h3><p className="mb-3 text-xs text-muted-foreground">Cửa dùng geometry; vật tư cây dùng quy cách kỹ thuật. Không bắt một mặt hàng phải có cả hai.</p><div className="grid gap-3 md:grid-cols-4">
          <Field label="Quy cách kỹ thuật vật tư" className="md:col-span-2"><NativeSelect value={text(doc.material_specification)} rows={options.specifications} onChange={(value) => patch({ material_specification: value })} /></Field>
          <Field label="Loại cửa"><select className={fieldClass} value={text(doc.door_type)} onChange={(e) => patch({ door_type: e.target.value })}><option value="">Không phải thành phẩm cửa</option>{DOOR_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Công thức cửa"><NativeSelect value={text(doc.cutting_policy)} rows={options.cuttingPolicies} onChange={(value) => patch({ cutting_policy: value })} /></Field>
          <Field label="Bộ quy cách hình học" className="md:col-span-2"><NativeSelect value={text(doc.geometry_profile)} rows={options.geometryProfiles} onChange={(value) => patch({ geometry_profile: value })} /></Field>
          <Field label="Barem Kg/m²" hint="Dùng cho dự toán mua. Thiếu thì hiện cảnh báo, không tự bịa số."><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.purchase_kg_per_m2)} onChange={(e) => patch({ purchase_kg_per_m2: e.target.value })} /></Field>
          <Field label="Diện tích tối thiểu tính tiền"><input className={fieldClass} type="number" min="0" step="0.01" value={text(doc.min_area_sqm)} onChange={(e) => patch({ min_area_sqm: e.target.value })} /></Field>
        </div></section> : null}

        {tab === "links" ? <section className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Đi tới danh mục liên quan</h3><p className="mb-4 text-sm text-muted-foreground">Workbench gom việc quanh Item nhưng không xoá các master gốc. Khi cần sửa sâu, mở đúng hồ sơ nguồn thay vì chép logic sang đây.</p><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Related title="Bộ theo dõi vật tư" value={text(doc.measurement_profile)} description="Quy định cách đo và theo dõi tồn." onOpen={() => openDoc("Measurement Profile", text(doc.measurement_profile) || undefined)} />
          <Related title="Quy cách kỹ thuật" value={text(doc.material_specification)} description="Kg/m và thông số vật tư cây." onOpen={() => openDoc("Material Specification", text(doc.material_specification) || undefined)} />
          <Related title="Bộ quy cách hình học" value={text(doc.geometry_profile)} description="Các kích thước cần nhập cho cửa." onOpen={() => openDoc("Geometry Profile", text(doc.geometry_profile) || undefined)} />
          <Related title="Công thức cửa" value={text(doc.cutting_policy)} description="Công thức hình học / chia lá của loại cửa." onOpen={() => openDoc("Cutting Policy", text(doc.cutting_policy) || undefined)} />
          <Related title="Mã hàng theo nhà cung cấp" value="Mở danh sách" description="Đối chiếu mã NCC và giá mua gần nhất." onOpen={() => openDoc("Supplier Item")} />
          <Related title="Form generic đầy đủ" value="Fallback" description="Dùng khi cần field chưa được đưa lên workbench này." onOpen={openGeneric} />
        </div></section> : null}
      </div>
    </div>
  </div>;
}

function Related({ title, value, description, onOpen }: { title: string; value: string; description: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-muted/20"><div className="flex items-start justify-between gap-2"><div className="font-medium">{title}</div><ExternalLink className="size-4 text-muted-foreground" /></div><div className="mt-1 text-sm font-medium text-primary">{value || "Chưa gắn"}</div><div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div></button>;
}
