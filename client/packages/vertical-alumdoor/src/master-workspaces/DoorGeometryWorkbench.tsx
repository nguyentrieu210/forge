/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, Plus, Ruler, Save, Trash2 } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

export type DoorGeometryDoctype = "Quy cách cửa" | "Geometry Profile" | "Cutting Policy";
type Json = Record<string, unknown>;
type ProfileScope = Json & { item_group?: string };
type ProfileField = Json & { geometry_field?: string; role?: string; required?: number | boolean; visible?: number | boolean; editable?: number | boolean; sequence?: number | string };
type GeometryProfileDoc = Json & { name?: string; modified?: string; profile_code?: string; profile_name?: string; item_groups?: ProfileScope[]; fields?: ProfileField[]; note?: string; disabled?: number | boolean };
type SlatDoc = Json & { name?: string; modified?: string; ma?: string; dong_cua?: string; doi?: string; buoc_la_m?: number | string; be_rong_nan_mm?: number | string; tru_mot_la?: number | boolean; rong_toi_da_mm?: number | string; trong_luong_kg_m2?: number | string; nguon?: string; ghi_chu?: string; disabled?: number | boolean };
type GeometryRule = Json & { rule_code?: string; target_field?: string; source_field?: string; operator?: string; operand_m?: number | string; customer_group?: string; ray_type?: string; has_butterfly_bracket?: number | boolean; priority?: number | string; sequence?: number | string; note?: string };
type LeafVariant = Json & { variant_label?: string; addend?: number | string; note?: string };
type CuttingPolicyDoc = Json & {
  name?: string; modified?: string; policy_name?: string; door_type?: string; ray_type?: string; item_group?: string; priority?: number | string; disabled?: number | boolean;
  geometry_profile?: string; height_pb_offset_m?: number | string;
  dealer_width_basis?: string; retail_width_basis?: string; dealer_cut_deduction_m?: number | string; retail_cut_deduction_m?: number | string; butterfly_cut_deduction_m?: number | string;
  dealer_split_sales_basis?: string; dealer_full_sales_basis?: string; retail_sales_basis?: string; manual_pull_sales_basis?: string;
  purchase_formula?: string; purchase_height_basis?: string; purchase_width_basis?: string;
  leaf_formula?: string; leaf_height_deduction_m?: number | string; leaf_divisor_source?: string; leaf_divisor_const?: number | string; leaf_rounding?: string; minus_one_threshold?: number | string;
  leaf_variants?: LeafVariant[]; geometry_rules?: GeometryRule[]; note?: string;
};
type Options = { geometryFields: Doc[]; geometryProfiles: Doc[]; itemGroups: Doc[] };

export interface DoorGeometryWorkbenchProps {
  doctype: DoorGeometryDoctype;
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const DOOR_TYPES = ["Cửa Đức", "Cửa Úc", "Cửa Lưới", "Cửa Đài Loan", "Cửa Siêu Trường", "Cửa tấm liền Úc"];
const PROFILE_ROLES = ["INPUT", "CALCULATED", "INFO"];
const ROLE_LABEL: Record<string, string> = { INPUT: "Nhập liệu", CALCULATED: "Tự tính", INFO: "Thông tin" };
const GEOMETRY_OPERATORS = ["COPY", "SUBTRACT", "ADD"];
const WIDTH_BASES = ["Phủ bì ray", "Phủ bì nhựa", "Rộng cắt lá"];
const HEIGHT_BASES = ["Cao phủ bì", "Cao lưới"];
const LEAF_FORMULAS = ["Kiểu Đức", "Kiểu Úc", "Kiểu tấm liền Úc", "Kiểu Đài Loan/Lưới", "Kiểu Đài Loan Lưới"];
const DIVISOR_SOURCES = ["Bản lá của bộ quy cách", "Hằng số của chính sách"];
const LEAF_ROUNDING = ["Ngưỡng trừ-một-lá", "Nấc 0-0.3-0.7-1", "Làm tròn xuống", "Nấc 0-0.3-0.7-1"];
const PURCHASE_FORMULAS = ["Kg thực tế", "Barem kg/m2"];
const RAY_TYPES = ["U75", "U100", "Ray sắt U70", "Ray hộp/đơn U76", "Không dùng ray"];
const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const textAreaClass = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
const EMPTY_OPTIONS: Options = { geometryFields: [], geometryProfiles: [], itemGroups: [] };

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function yes(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function positive(value: unknown): number | undefined { const parsed = Number(value); return text(value) !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; }
function finite(value: unknown): number | undefined { const parsed = Number(value); return text(value) !== "" && Number.isFinite(parsed) ? parsed : undefined; }
function arrayRows<T extends Json>(value: unknown): T[] { return Array.isArray(value) ? value.filter((row): row is T => Boolean(row) && typeof row === "object") : []; }
function docName(row: Doc): string { return text(row.name); }
function emptyDoc(doctype: DoorGeometryDoctype): SlatDoc | GeometryProfileDoc | CuttingPolicyDoc {
  if (doctype === "Quy cách cửa") return { ma: "", dong_cua: "Cửa Đức", doi: "", buoc_la_m: "", tru_mot_la: 0, disabled: 0 };
  if (doctype === "Geometry Profile") return { profile_code: "", profile_name: "", item_groups: [], fields: [], disabled: 0 };
  return {
    policy_name: "", door_type: "Cửa Đức", ray_type: "", item_group: "", priority: 0, disabled: 0,
    geometry_profile: "", height_pb_offset_m: 0.5,
    dealer_width_basis: "Phủ bì nhựa", retail_width_basis: "Phủ bì ray", dealer_cut_deduction_m: 0, retail_cut_deduction_m: 0,
    dealer_split_sales_basis: "Phủ bì nhựa", dealer_full_sales_basis: "Phủ bì nhựa", retail_sales_basis: "Phủ bì ray",
    purchase_formula: "Barem kg/m2", purchase_height_basis: "Cao phủ bì", purchase_width_basis: "Rộng cắt lá",
    leaf_formula: "Kiểu Đức", leaf_height_deduction_m: 0.13, leaf_divisor_source: "Bản lá của bộ quy cách", leaf_rounding: "Ngưỡng trừ-một-lá", minus_one_threshold: 20.5,
    leaf_variants: [], geometry_rules: [],
  };
}
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) { return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>; }
function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) { return <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>; }
function SelectDocs({ value, rows, onChange, empty = "— chọn —" }: { value: string; rows: Doc[]; onChange: (value: string) => void; empty?: string }) { return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{rows.map((row) => <option key={docName(row)} value={docName(row)}>{docName(row)}</option>)}</select>; }
function NativeSelect({ value, values, labels, onChange, empty }: { value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void; empty?: string }) { return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>{empty !== undefined ? <option value="">{empty}</option> : null}{[...new Set(values)].map((entry) => <option key={entry} value={entry}>{labels?.[entry] ?? entry}</option>)}</select>; }

export function DoorGeometryWorkbench({ doctype, name, base, listPath, onNavigate, onSaved, onCancel }: DoorGeometryWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<SlatDoc | GeometryProfileDoc | CuttingPolicyDoc>(() => emptyDoc(doctype));
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const optional = (dt: string, pageLength: number) => adapter.getList(dt, { fields: ["name"], orderBy: "name asc", pageLength }).catch(() => [] as Doc[]);
        const [geometryFields, geometryProfiles, itemGroups, loaded] = await Promise.all([
          optional("Geometry Field", 100), optional("Geometry Profile", 100), optional("Item Group", 300),
          name ? adapter.getDoc(doctype, name).then((result) => result.doc as Json) : Promise.resolve(emptyDoc(doctype) as Json),
        ]);
        if (!active) return;
        setOptions({ geometryFields, geometryProfiles, itemGroups });
        const hydrated = { ...emptyDoc(doctype), ...loaded } as SlatDoc | GeometryProfileDoc | CuttingPolicyDoc;
        if (doctype === "Geometry Profile") {
          const profile = hydrated as GeometryProfileDoc;
          profile.item_groups = arrayRows<ProfileScope>(profile.item_groups);
          profile.fields = arrayRows<ProfileField>(profile.fields);
        }
        if (doctype === "Cutting Policy") {
          const policy = hydrated as CuttingPolicyDoc;
          policy.geometry_rules = arrayRows<GeometryRule>(policy.geometry_rules);
          policy.leaf_variants = arrayRows<LeafVariant>(policy.leaf_variants);
        }
        setDoc(hydrated);
      } catch (error) { if (active) toast.error(adapter.mapError(error).message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [adapter, doctype, name]);

  const patch = (next: Json) => setDoc((current) => ({ ...current, ...next }));
  const slat = doc as SlatDoc;
  const profile = doc as GeometryProfileDoc;
  const policy = doc as CuttingPolicyDoc;

  const warnings = useMemo(() => {
    const result: string[] = [];
    if (doctype === "Quy cách cửa") {
      if (text(slat.ma) === "AL552 (CŨ)" || text(name) === "AL552 (CŨ)") result.push("AL552 đang có nguồn mâu thuẫn: sheet ghi đời CŨ 0,05 và đời MỚI 0,057, nhưng bảng đang thi hành giữ 0,057 cho đời CŨ. Không tự sửa ước số chia này.");
      if (text(slat.be_rong_nan_mm) === "") result.push("Bề rộng nan đang để trống. Đây không phải ước số chia lá; thiếu nguồn thì giữ trống, không lấy `buoc_la_m × 1000` điền hộ.");
      if (text(slat.rong_toi_da_mm) === "" || text(slat.trong_luong_kg_m2) === "") result.push("Ngưỡng rộng tối đa / trọng lượng kg/m² có thể chưa có nguồn theo từng mã. Workbench không coi ô trống này là lỗi bắt buộc.");
    }
    if (doctype === "Cutting Policy") result.push("Cutting Policy chỉ sở hữu hình học/chia lá/cơ sở đo. Giá bán nằm ở Pricing; lượng vật tư nằm ở BOM/BOM Rule.");
    return result;
  }, [doctype, name, slat]);

  const validate = (): string | null => {
    if (doctype === "Quy cách cửa") {
      if (!text(slat.ma)) return "Cần khai Mã quy cách cửa.";
      if (!text(slat.dong_cua)) return "Cần chọn Dòng cửa.";
      if (positive(slat.buoc_la_m) === undefined) return "Ước số chia lá (m) phải lớn hơn 0.";
      if (text(slat.be_rong_nan_mm) && positive(slat.be_rong_nan_mm) === undefined) return "Bề rộng nan (mm) phải lớn hơn 0 hoặc để trống khi chưa có nguồn.";
      return null;
    }
    if (doctype === "Geometry Profile") {
      const fields = arrayRows<ProfileField>(profile.fields);
      if (!text(profile.profile_code)) return "Cần khai Mã bộ quy cách hình học.";
      if (!text(profile.profile_name)) return "Cần khai Tên bộ quy cách hình học.";
      if (!fields.length) return "Bộ quy cách phải có ít nhất một trường hình học.";
      const seen = new Set<string>();
      for (const [index, row] of fields.entries()) {
        const field = text(row.geometry_field);
        if (!field) return `Dòng trường ${index + 1}: chưa chọn Trường hình học.`;
        if (seen.has(field)) return `Trường ${field} bị khai trùng trong cùng bộ quy cách.`;
        seen.add(field);
        if (!PROFILE_ROLES.includes(text(row.role))) return `Dòng ${index + 1}: Vai trò không hợp lệ.`;
        if (text(row.role) === "CALCULATED" && yes(row.editable)) return `Dòng ${index + 1} (${field}): trường Tự tính không được cho nhập tay.`;
        if (yes(row.required) && !yes(row.visible)) return `Dòng ${index + 1} (${field}): trường Bắt buộc phải được Hiện trên form.`;
      }
      return null;
    }
    if (!text(policy.policy_name)) return "Cần khai Tên công thức cửa.";
    if (!text(policy.door_type)) return "Cần chọn Loại cửa.";
    if (!text(policy.geometry_profile)) return "Cần chọn Bộ quy cách hình học.";
    if (!text(policy.leaf_formula)) return "Mọi loại cửa phải có Công thức chia lá.";
    if (!text(policy.leaf_divisor_source)) return "Cần chọn Nguồn ước số chia lá.";
    if (text(policy.leaf_divisor_source) === "Hằng số của chính sách" && positive(policy.leaf_divisor_const) === undefined) return "Nguồn chia lá là hằng số thì Hằng số chia phải lớn hơn 0.";
    const geometryRules = arrayRows<GeometryRule>(policy.geometry_rules);
    const codes = new Set<string>();
    for (const [index, row] of geometryRules.entries()) {
      const code = text(row.rule_code);
      if (!code) return `Công thức hình học dòng ${index + 1}: thiếu Mã quy tắc.`;
      if (codes.has(code)) return `Mã quy tắc ${code} bị trùng.`;
      codes.add(code);
      if (!text(row.target_field) || !text(row.source_field)) return `Công thức ${code}: phải có Trường kết quả và Trường nguồn.`;
      if (text(row.target_field) === text(row.source_field)) return `Công thức ${code}: trường nguồn và kết quả không được giống nhau.`;
      if (!GEOMETRY_OPERATORS.includes(text(row.operator))) return `Công thức ${code}: phép tính không hợp lệ.`;
      if (finite(row.operand_m) === undefined || Number(row.operand_m) < 0) return `Công thức ${code}: số cộng/trừ phải là số không âm.`;
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      let payload: Json = { ...doc };
      if (doctype === "Quy cách cửa") {
        payload = { ...slat, ma: text(slat.ma), dong_cua: text(slat.dong_cua), doi: text(slat.doi), buoc_la_m: positive(slat.buoc_la_m), be_rong_nan_mm: text(slat.be_rong_nan_mm) ? positive(slat.be_rong_nan_mm) : undefined, rong_toi_da_mm: text(slat.rong_toi_da_mm) ? positive(slat.rong_toi_da_mm) : undefined, trong_luong_kg_m2: text(slat.trong_luong_kg_m2) ? positive(slat.trong_luong_kg_m2) : undefined };
      } else if (doctype === "Geometry Profile") {
        payload = { ...profile, profile_code: text(profile.profile_code), profile_name: text(profile.profile_name), item_groups: arrayRows<ProfileScope>(profile.item_groups).map((row, index) => ({ ...row, row_id: text(row.row_id) || `GROUP-${index + 1}`, item_group: text(row.item_group) })), fields: arrayRows<ProfileField>(profile.fields).map((row, index) => ({ ...row, row_id: text(row.row_id) || `FIELD-${index + 1}`, geometry_field: text(row.geometry_field), role: text(row.role), required: yes(row.required) ? 1 : 0, visible: yes(row.visible) ? 1 : 0, editable: text(row.role) === "CALCULATED" ? 0 : yes(row.editable) ? 1 : 0, sequence: finite(row.sequence) ?? (index + 1) * 10 })) };
      } else {
        payload = { ...policy, policy_name: text(policy.policy_name), door_type: text(policy.door_type), ray_type: text(policy.ray_type), item_group: text(policy.item_group), priority: finite(policy.priority) ?? 0, geometry_profile: text(policy.geometry_profile), geometry_rules: arrayRows<GeometryRule>(policy.geometry_rules).map((row, index) => ({ ...row, row_id: text(row.row_id) || `RULE-${index + 1}`, rule_code: text(row.rule_code), target_field: text(row.target_field), source_field: text(row.source_field), operator: text(row.operator), operand_m: finite(row.operand_m) ?? 0, priority: finite(row.priority) ?? 0, sequence: finite(row.sequence) ?? (index + 1) * 10, has_butterfly_bracket: yes(row.has_butterfly_bracket) ? 1 : 0 })), leaf_variants: arrayRows<LeafVariant>(policy.leaf_variants).map((row, index) => ({ ...row, row_id: text(row.row_id) || `LEAF-${index + 1}`, variant_label: text(row.variant_label), addend: finite(row.addend) ?? 0 })) };
      }
      const saved = name ? await adapter.updateDoc(doctype, name, payload, text((doc as Json).modified)) : await adapter.createDoc(doctype, payload);
      const savedName = text((saved as Json).name) || name || (doctype === "Quy cách cửa" ? text(slat.ma) : doctype === "Geometry Profile" ? text(profile.profile_code) : text(policy.policy_name));
      toast.success(doctype === "Quy cách cửa" ? "Đã lưu quy cách cửa." : doctype === "Geometry Profile" ? "Đã lưu bộ quy cách hình học." : "Đã lưu công thức cửa.");
      if (savedName) onSaved?.(savedName);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  const openGeneric = () => onNavigate(`${currentPath}?master_ui=generic`);
  const openDoc = (dt: string, target?: string) => onNavigate(target ? `${base}/${encodeURIComponent(dt)}/${encodeURIComponent(target)}` : `${base}/${encodeURIComponent(dt)}`);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải cấu hình cửa…</div>;
  const title = doctype === "Quy cách cửa" ? "Bản lá / quy cách cửa" : doctype === "Geometry Profile" ? "Bộ quy cách hình học" : "Công thức cửa";

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-door-geometry-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex items-center gap-2"><Ruler className="size-5 text-primary" /><h2 className="text-lg font-semibold">{title}{name ? ` · ${name}` : " · Mới"}</h2></div><p className="mt-1 text-sm text-muted-foreground">{doctype === "Quy cách cửa" ? "Phân biệt rõ ước số chia lá với bề rộng nan — hai số nhìn gần nhau nhưng sai một cái có thể lệch số lá." : doctype === "Geometry Profile" ? "Chọn những kích thước người bán phải nhập và những kích thước hệ thống tự tính." : "Một nơi cấu hình hình học, chia lá và cơ sở đo của một loại cửa; không nhồi giá/BOM vào đây."}</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={openGeneric}>Form đầy đủ</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div></div></header>
    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"><div className="mx-auto max-w-7xl space-y-4">
      {warnings.length ? <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><div className="font-medium">Điểm cần giữ đúng nguồn</div><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div></div></section> : null}
      {doctype === "Quy cách cửa" ? <SlatEditor doc={slat} patch={patch} /> : null}
      {doctype === "Geometry Profile" ? <ProfileEditor doc={profile} options={options} patch={patch} openDoc={openDoc} /> : null}
      {doctype === "Cutting Policy" ? <CuttingEditor doc={policy} options={options} patch={patch} openDoc={openDoc} /> : null}
    </div></main>
  </div>;
}

function SlatEditor({ doc, patch }: { doc: SlatDoc; patch: (next: Json) => void }) {
  return <><section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Nhận diện mã lá</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Mã quy cách"><input className={fieldClass} value={text(doc.ma)} onChange={(e) => patch({ ma: e.target.value.toUpperCase() })} /></Field><Field label="Dòng cửa"><NativeSelect value={text(doc.dong_cua)} values={DOOR_TYPES} onChange={(value) => patch({ dong_cua: value })} /></Field><Field label="Đời"><NativeSelect value={text(doc.doi)} values={["MỚI", "CŨ"]} empty="Không phân đời" onChange={(value) => patch({ doi: value })} /></Field><Check label="Ngừng dùng" checked={yes(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /></div></section><section className="rounded-xl border bg-card p-4"><h3 className="mb-1 font-medium">Hai đại lượng KHÁC nhau</h3><p className="mb-3 text-xs text-muted-foreground">Bảng giá có thể gọi “bản lá 70”, nhưng số chia lá thực tế của AL70 là 0,068 m. Không suy một cột từ cột kia.</p><div className="grid gap-3 md:grid-cols-4"><Field label="Ước số chia lá (m)" hint="Dùng trực tiếp trong phép chia số lá."><input className={fieldClass} type="number" min="0.000001" step="0.001" value={text(doc.buoc_la_m)} onChange={(e) => patch({ buoc_la_m: e.target.value })} /></Field><Field label="Bề rộng nan (mm)" hint="Nhận diện mã / tra giá; KHÔNG dùng làm ước số chia."><input className={fieldClass} type="number" min="0" step="1" value={text(doc.be_rong_nan_mm)} onChange={(e) => patch({ be_rong_nan_mm: e.target.value })} /></Field><Check label="Trừ một lá" checked={yes(doc.tru_mot_la)} onChange={(checked) => patch({ tru_mot_la: checked ? 1 : 0 })} /><div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">Minh hoạ</div><div className="mt-1 font-mono text-sm">cao hiệu dụng ÷ {text(doc.buoc_la_m) || "ước số"}{yes(doc.tru_mot_la) ? " → áp luật trừ lá" : ""}</div></div><Field label="Rộng tối đa (mm)" hint="Không có nguồn thì để trống."><input className={fieldClass} type="number" min="0" step="1" value={text(doc.rong_toi_da_mm)} onChange={(e) => patch({ rong_toi_da_mm: e.target.value })} /></Field><Field label="Trọng lượng (kg/m²)" hint="Không có nguồn theo mã thì để trống."><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.trong_luong_kg_m2)} onChange={(e) => patch({ trong_luong_kg_m2: e.target.value })} /></Field><Field label="Nguồn" className="md:col-span-2"><input className={fieldClass} value={text(doc.nguon)} onChange={(e) => patch({ nguon: e.target.value })} /></Field><Field label="Ghi chú" className="md:col-span-4"><textarea className={textAreaClass} value={text(doc.ghi_chu)} onChange={(e) => patch({ ghi_chu: e.target.value })} /></Field></div></section></>;
}

function ProfileEditor({ doc, options, patch, openDoc }: { doc: GeometryProfileDoc; options: Options; patch: (next: Json) => void; openDoc: (dt: string, target?: string) => void }) {
  const groups = arrayRows<ProfileScope>(doc.item_groups);
  const fields = arrayRows<ProfileField>(doc.fields);
  const patchGroup = (index: number, next: Json) => patch({ item_groups: groups.map((row, i) => i === index ? { ...row, ...next } : row) });
  const patchField = (index: number, next: Json) => patch({ fields: fields.map((row, i) => i === index ? { ...row, ...next } : row) });
  return <><section className="rounded-xl border bg-card p-4"><div className="grid gap-3 md:grid-cols-4"><Field label="Mã bộ quy cách"><input className={fieldClass} value={text(doc.profile_code)} onChange={(e) => patch({ profile_code: e.target.value.toUpperCase() })} /></Field><Field label="Tên bộ quy cách" className="md:col-span-2"><input className={fieldClass} value={text(doc.profile_name)} onChange={(e) => patch({ profile_name: e.target.value })} /></Field><Check label="Ngừng dùng" checked={yes(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /><Field label="Ghi chú" className="md:col-span-4"><textarea className={textAreaClass} value={text(doc.note)} onChange={(e) => patch({ note: e.target.value })} /></Field></div></section><section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Nhóm hàng áp dụng</h3><p className="text-xs text-muted-foreground">Dùng để gom các Item cửa cùng bộ kích thước.</p></div><Button size="sm" variant="outline" onClick={() => patch({ item_groups: [...groups, { item_group: "" }] })}><Plus className="size-4" /> Thêm</Button></div><div className="space-y-2 p-3">{groups.length ? groups.map((row, index) => <div key={text(row.row_id) || index} className="flex gap-2"><SelectDocs value={text(row.item_group)} rows={options.itemGroups} onChange={(value) => patchGroup(index, { item_group: value })} /><Button size="sm" variant="ghost" onClick={() => patch({ item_groups: groups.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></div>) : <div className="py-4 text-center text-sm text-muted-foreground">Chưa giới hạn theo nhóm hàng.</div>}</div></section><section className="rounded-xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h3 className="font-medium">Các kích thước trên form cửa</h3><p className="text-xs text-muted-foreground">INPUT = người bán nhập; CALCULATED = Cutting Policy tính; INFO = chỉ hiển thị.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openDoc("Geometry Field")}><ExternalLink className="size-4" /> Danh mục trường</Button><Button size="sm" variant="outline" onClick={() => patch({ fields: [...fields, { geometry_field: "", role: "INPUT", required: 0, visible: 1, editable: 1, sequence: (fields.length + 1) * 10 }] })}><Plus className="size-4" /> Thêm trường</Button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Trường hình học</th><th className="p-3 w-40">Vai trò</th><th className="p-3 w-28">Bắt buộc</th><th className="p-3 w-28">Hiện</th><th className="p-3 w-28">Cho nhập</th><th className="p-3 w-28">Thứ tự</th><th className="w-14" /></tr></thead><tbody>{fields.map((row, index) => <tr key={text(row.row_id) || index} className="border-b"><td className="p-2"><SelectDocs value={text(row.geometry_field)} rows={options.geometryFields} onChange={(value) => patchField(index, { geometry_field: value })} /></td><td className="p-2"><NativeSelect value={text(row.role) || "INPUT"} values={PROFILE_ROLES} labels={ROLE_LABEL} onChange={(value) => patchField(index, { role: value, editable: value === "CALCULATED" ? 0 : value === "INPUT" ? 1 : row.editable })} /></td><td className="p-2 text-center"><input type="checkbox" checked={yes(row.required)} onChange={(e) => patchField(index, { required: e.target.checked ? 1 : 0, ...(e.target.checked ? { visible: 1 } : {}) })} /></td><td className="p-2 text-center"><input type="checkbox" checked={row.visible === undefined ? true : yes(row.visible)} onChange={(e) => patchField(index, { visible: e.target.checked ? 1 : 0 })} /></td><td className="p-2 text-center"><input type="checkbox" disabled={text(row.role) === "CALCULATED"} checked={yes(row.editable)} onChange={(e) => patchField(index, { editable: e.target.checked ? 1 : 0 })} /></td><td className="p-2"><input className={fieldClass} type="number" step="10" value={text(row.sequence)} onChange={(e) => patchField(index, { sequence: e.target.value })} /></td><td className="p-2"><Button size="sm" variant="ghost" onClick={() => patch({ fields: fields.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></td></tr>)}</tbody></table></div></section></>;
}

function CuttingEditor({ doc, options, patch, openDoc }: { doc: CuttingPolicyDoc; options: Options; patch: (next: Json) => void; openDoc: (dt: string, target?: string) => void }) {
  const rules = arrayRows<GeometryRule>(doc.geometry_rules);
  const variants = arrayRows<LeafVariant>(doc.leaf_variants);
  const patchRule = (index: number, next: Json) => patch({ geometry_rules: rules.map((row, i) => i === index ? { ...row, ...next } : row) });
  const patchVariant = (index: number, next: Json) => patch({ leaf_variants: variants.map((row, i) => i === index ? { ...row, ...next } : row) });
  return <><section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">1 · Chọn đúng chính sách</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Tên công thức" className="md:col-span-2"><input className={fieldClass} value={text(doc.policy_name)} onChange={(e) => patch({ policy_name: e.target.value })} /></Field><Field label="Loại cửa"><NativeSelect value={text(doc.door_type)} values={DOOR_TYPES} onChange={(value) => patch({ door_type: value })} /></Field><Field label="Loại ray"><NativeSelect value={text(doc.ray_type)} values={RAY_TYPES} empty="Không giới hạn" onChange={(value) => patch({ ray_type: value })} /></Field><Field label="Nhóm hàng"><SelectDocs value={text(doc.item_group)} rows={options.itemGroups} empty="Mọi nhóm của loại cửa" onChange={(value) => patch({ item_group: value })} /></Field><Field label="Độ ưu tiên"><input className={fieldClass} type="number" step="1" value={text(doc.priority)} onChange={(e) => patch({ priority: e.target.value })} /></Field><Field label="Bộ quy cách hình học"><div className="flex gap-1"><SelectDocs value={text(doc.geometry_profile)} rows={options.geometryProfiles} onChange={(value) => patch({ geometry_profile: value })} /><Button size="sm" variant="ghost" onClick={() => openDoc("Geometry Profile", text(doc.geometry_profile) || undefined)}><ExternalLink className="size-4" /></Button></div></Field><Check label="Ngừng dùng" checked={yes(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /></div></section><section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">2 · Cơ sở đo & mua</h3><div className="grid gap-3 md:grid-cols-4"><Field label="CPB = CLL + (m)"><input className={fieldClass} type="number" step="0.001" value={text(doc.height_pb_offset_m)} onChange={(e) => patch({ height_pb_offset_m: e.target.value })} /></Field><Field label="Đại lý nhập rộng theo"><NativeSelect value={text(doc.dealer_width_basis)} values={WIDTH_BASES} onChange={(value) => patch({ dealer_width_basis: value })} /></Field><Field label="Khách lẻ nhập rộng theo"><NativeSelect value={text(doc.retail_width_basis)} values={WIDTH_BASES} onChange={(value) => patch({ retail_width_basis: value })} /></Field><Field label="Mua theo"><NativeSelect value={text(doc.purchase_formula)} values={PURCHASE_FORMULAS} onChange={(value) => patch({ purchase_formula: value })} /></Field><Field label="Đại lý: số trừ cắt (m)"><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.dealer_cut_deduction_m)} onChange={(e) => patch({ dealer_cut_deduction_m: e.target.value })} /></Field><Field label="Khách lẻ: số trừ cắt (m)" hint="Cửa Đức khách lẻ đã chốt 0,08 m; không đổi thành 0,06."><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.retail_cut_deduction_m)} onChange={(e) => patch({ retail_cut_deduction_m: e.target.value })} /></Field><Field label="Có bướm: số trừ (m)"><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.butterfly_cut_deduction_m)} onChange={(e) => patch({ butterfly_cut_deduction_m: e.target.value })} /></Field><Field label="Chiều cao mua"><NativeSelect value={text(doc.purchase_height_basis)} values={HEIGHT_BASES} onChange={(value) => patch({ purchase_height_basis: value })} /></Field><Field label="Đại lý tách món tính rộng"><NativeSelect value={text(doc.dealer_split_sales_basis)} values={WIDTH_BASES} onChange={(value) => patch({ dealer_split_sales_basis: value })} /></Field><Field label="Đại lý trọn bộ tính rộng"><NativeSelect value={text(doc.dealer_full_sales_basis)} values={WIDTH_BASES} onChange={(value) => patch({ dealer_full_sales_basis: value })} /></Field><Field label="Khách lẻ tính rộng"><NativeSelect value={text(doc.retail_sales_basis)} values={WIDTH_BASES} onChange={(value) => patch({ retail_sales_basis: value })} /></Field><Field label="Chiều rộng mua"><NativeSelect value={text(doc.purchase_width_basis)} values={WIDTH_BASES} onChange={(value) => patch({ purchase_width_basis: value })} /></Field></div></section><section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">3 · Chia lá</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Công thức chia lá"><NativeSelect value={text(doc.leaf_formula)} values={LEAF_FORMULAS} onChange={(value) => patch({ leaf_formula: value })} /></Field><Field label="Trừ chiều cao trước chia (m)"><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.leaf_height_deduction_m)} onChange={(e) => patch({ leaf_height_deduction_m: e.target.value })} /></Field><Field label="Nguồn ước số"><NativeSelect value={text(doc.leaf_divisor_source)} values={DIVISOR_SOURCES} onChange={(value) => patch({ leaf_divisor_source: value })} /></Field><Field label="Hằng số chia" hint="Chỉ dùng khi nguồn là Hằng số của chính sách."><input className={fieldClass} type="number" min="0" step="0.001" value={text(doc.leaf_divisor_const)} onChange={(e) => patch({ leaf_divisor_const: e.target.value })} /></Field><Field label="Làm tròn"><NativeSelect value={text(doc.leaf_rounding)} values={LEAF_ROUNDING} onChange={(value) => patch({ leaf_rounding: value })} /></Field><Field label="Ngưỡng trừ một lá"><input className={fieldClass} type="number" step="0.1" value={text(doc.minus_one_threshold)} onChange={(e) => patch({ minus_one_threshold: e.target.value })} /></Field></div><div className="mt-4 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">Ước số từ “Bản lá của bộ quy cách” phải đọc `Quy cách cửa.buoc_la_m`; tuyệt đối không dùng `be_rong_nan_mm` thay thế.</div></section><section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Biến thể chia lá</h3><p className="text-xs text-muted-foreground">Ví dụ cửa Úc: motor trong/kéo tay +2; motor ngoài +1,5 hoặc +1,3.</p></div><Button size="sm" variant="outline" onClick={() => patch({ leaf_variants: [...variants, { variant_label: "", addend: 0, note: "" }] })}><Plus className="size-4" /> Thêm</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Biến thể</th><th className="p-3 w-32">Cộng</th><th className="p-3">Ghi chú</th><th className="w-14" /></tr></thead><tbody>{variants.length ? variants.map((row, index) => <tr key={text(row.row_id) || index} className="border-b"><td className="p-2"><input className={fieldClass} value={text(row.variant_label)} onChange={(e) => patchVariant(index, { variant_label: e.target.value })} /></td><td className="p-2"><input className={fieldClass} type="number" step="0.1" value={text(row.addend)} onChange={(e) => patchVariant(index, { addend: e.target.value })} /></td><td className="p-2"><input className={fieldClass} value={text(row.note)} onChange={(e) => patchVariant(index, { note: e.target.value })} /></td><td className="p-2"><Button size="sm" variant="ghost" onClick={() => patch({ leaf_variants: variants.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></td></tr>) : <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loại cửa này chưa cần biến thể cộng thêm.</td></tr>}</tbody></table></div></section><section className="rounded-xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h3 className="font-medium">4 · Công thức hình học</h3><p className="text-xs text-muted-foreground">Target phải là trường tự tính trong Geometry Profile; source là trường người dùng nhập.</p></div><Button size="sm" variant="outline" onClick={() => patch({ geometry_rules: [...rules, { rule_code: "", target_field: "", source_field: "", operator: "COPY", operand_m: 0, priority: 0, sequence: (rules.length + 1) * 10 }] })}><Plus className="size-4" /> Thêm quy tắc</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Mã</th><th className="p-3">Kết quả</th><th className="p-3">Nguồn</th><th className="p-3 w-32">Phép tính</th><th className="p-3 w-28">Số cộng/trừ</th><th className="p-3">Điều kiện</th><th className="p-3 w-24">Ưu tiên</th><th className="p-3 w-24">Thứ tự</th><th className="w-14" /></tr></thead><tbody>{rules.map((row, index) => <tr key={text(row.row_id) || index} className="border-b align-top"><td className="p-2"><input className={fieldClass} value={text(row.rule_code)} onChange={(e) => patchRule(index, { rule_code: e.target.value.toUpperCase() })} /></td><td className="p-2"><SelectDocs value={text(row.target_field)} rows={options.geometryFields} onChange={(value) => patchRule(index, { target_field: value })} /></td><td className="p-2"><SelectDocs value={text(row.source_field)} rows={options.geometryFields} onChange={(value) => patchRule(index, { source_field: value })} /></td><td className="p-2"><NativeSelect value={text(row.operator) || "COPY"} values={GEOMETRY_OPERATORS} onChange={(value) => patchRule(index, { operator: value })} /></td><td className="p-2"><input className={fieldClass} type="number" min="0" step="0.001" value={text(row.operand_m)} onChange={(e) => patchRule(index, { operand_m: e.target.value })} /></td><td className="p-2"><div className="grid gap-1"><input className={fieldClass} placeholder="Nhóm khách" value={text(row.customer_group)} onChange={(e) => patchRule(index, { customer_group: e.target.value })} /><input className={fieldClass} placeholder="Loại ray" value={text(row.ray_type)} onChange={(e) => patchRule(index, { ray_type: e.target.value })} /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={yes(row.has_butterfly_bracket)} onChange={(e) => patchRule(index, { has_butterfly_bracket: e.target.checked ? 1 : 0 })} /> Có bắn bướm</label></div></td><td className="p-2"><input className={fieldClass} type="number" step="1" value={text(row.priority)} onChange={(e) => patchRule(index, { priority: e.target.value })} /></td><td className="p-2"><input className={fieldClass} type="number" step="10" value={text(row.sequence)} onChange={(e) => patchRule(index, { sequence: e.target.value })} /></td><td className="p-2"><Button size="sm" variant="ghost" onClick={() => patch({ geometry_rules: rules.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></td></tr>)}</tbody></table></div></section><section className="rounded-xl border bg-card p-4"><Field label="Ghi chú nguồn"><textarea className={textAreaClass} value={text(doc.note)} onChange={(e) => patch({ note: e.target.value })} /></Field></section></>;
}
