/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "../../../container/provider.js";

type Json = Record<string, unknown>;

type Applicability = {
  scope_type?: string;
  parent_item?: string;
  parent_item_group?: string;
  door_type?: string;
  component_item?: string;
  bom?: string;
  priority?: number;
  effective_from?: string;
  effective_to?: string;
  disabled?: number;
  note?: string;
};

type BomRuleDoc = Json & {
  name?: string;
  modified?: string;
  rule_code?: string;
  rule_name?: string;
  description?: string;
  result_kind?: string;
  result_uom?: string;
  source_field?: string;
  operator?: string;
  operand?: number;
  multiply?: number;
  divide?: number;
  qty_per_set?: number;
  rounding?: string;
  precision?: number;
  formula_json?: string;
  formula_display?: string;
  version?: number;
  disabled?: number;
  authority_type?: string;
  source_sheet?: string;
  source_row?: number;
  source_formula_text?: string;
  source_formula_code?: string;
  source_note?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  applicability?: Applicability[];
};

export interface AlumdoorBomRuleEditorProps {
  name?: string;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const GEOMETRY_FIELDS = [
  ["PB_RAY_RONG", "Rộng phủ bì ray"],
  ["PB_NHUA_RONG", "Rộng phủ bì nhựa"],
  ["PB_CAO", "Cao phủ bì"],
  ["CAT_LA_RONG", "Rộng cắt lá"],
  ["CAO_LUOI", "Cao lưới"],
  ["billable_area_sqm", "Diện tích tính tiền"],
  ["leaf_count", "Số lá"],
  ["set_count", "Số bộ"],
] as const;

const emptyRule = (): BomRuleDoc => ({
  rule_code: "",
  rule_name: "",
  description: "",
  result_kind: "LENGTH",
  result_uom: "Mét",
  source_field: "PB_RAY_RONG",
  operator: "COPY",
  operand: 0,
  multiply: 1,
  divide: 1,
  qty_per_set: 1,
  rounding: "NONE",
  precision: 6,
  version: 1,
  disabled: 0,
  authority_type: "SOURCE",
  applicability: [],
});

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function num(value: unknown, fallback = 0): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round(value: number, precision = 6): number {
  const factor = 10 ** Math.max(0, Math.min(12, Math.trunc(precision)));
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formulaFromDoc(doc: BomRuleDoc) {
  const sourceField = text(doc.source_field);
  const operator = text(doc.operator).toUpperCase() || "COPY";
  const operand = num(doc.operand);
  const multiply = num(doc.multiply, 1);
  const divide = num(doc.divide, 1);
  if (operator === "CONSTANT") {
    return { base: { kind: "CONSTANT", value: operand }, ...(multiply !== 1 ? { multiply } : {}), ...(text(doc.rounding) && text(doc.rounding) !== "NONE" ? { rounding: text(doc.rounding) } : {}), precision: num(doc.precision, 6) };
  }
  const offset = operator === "ADD" ? operand : operator === "SUBTRACT" ? -operand : 0;
  const factor = (operator === "MULTIPLY" ? operand : operator === "DIVIDE" ? (operand ? 1 / operand : 1) : 1) * multiply / (divide || 1);
  return {
    base: { kind: "FIELD", field: sourceField, ...(offset ? { offset } : {}) },
    ...(Math.abs(factor - 1) > 1e-12 ? { multiply: factor } : {}),
    ...(text(doc.rounding) && text(doc.rounding) !== "NONE" ? { rounding: text(doc.rounding) } : {}),
    precision: num(doc.precision, 6),
  };
}

function formulaDisplay(doc: BomRuleDoc): string {
  const formula = formulaFromDoc(doc);
  if (formula.base.kind === "CONSTANT") return `${formula.base.value}`;
  const offset = num((formula.base as { offset?: number }).offset);
  let base = text((formula.base as { field?: string }).field) || "?";
  if (offset > 0) base += ` + ${offset}`;
  if (offset < 0) base += ` - ${Math.abs(offset)}`;
  const factor = num((formula as { multiply?: number }).multiply, 1);
  if (Math.abs(factor - 1) > 1e-12) base = `(${base}) × ${factor}`;
  return text(doc.rounding) && text(doc.rounding) !== "NONE" ? `${text(doc.rounding)}(${base})` : base;
}

function testFormula(doc: BomRuleDoc, input: number): number | null {
  if (!Number.isFinite(input)) return null;
  const operator = text(doc.operator).toUpperCase();
  const operand = num(doc.operand);
  let value = operator === "CONSTANT" ? operand : input;
  if (operator === "ADD") value += operand;
  if (operator === "SUBTRACT") value -= operand;
  if (operator === "MULTIPLY") value *= operand;
  if (operator === "DIVIDE") { if (!operand) return null; value /= operand; }
  value *= num(doc.multiply, 1);
  const divide = num(doc.divide, 1);
  if (!divide) return null;
  value /= divide;
  const rounding = text(doc.rounding);
  if (rounding === "CEIL") value = Math.ceil(value);
  else if (rounding === "FLOOR") value = Math.floor(value);
  else if (rounding === "ROUND") value = round(value, num(doc.precision, 6));
  return round(value, num(doc.precision, 6));
}

const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}</label>;
}

export function AlumdoorBomRuleEditor({ name, onSaved, onCancel }: AlumdoorBomRuleEditorProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<BomRuleDoc>(emptyRule);
  const [loading, setLoading] = useState(Boolean(name));
  const [saving, setSaving] = useState(false);
  const [testValue, setTestValue] = useState(3);

  useEffect(() => {
    if (!name) { setDoc(emptyRule()); return; }
    let active = true;
    setLoading(true);
    void adapter.getDoc("BOM Rule", name).then((result) => {
      if (!active) return;
      const loaded = result.doc as BomRuleDoc;
      setDoc({ ...emptyRule(), ...loaded, applicability: Array.isArray(loaded.applicability) ? loaded.applicability : [] });
    }).catch((error) => toast.error(adapter.mapError(error).message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [adapter, name]);

  const formula = useMemo(() => formulaDisplay(doc), [doc]);
  const preview = useMemo(() => testFormula(doc, testValue), [doc, testValue]);
  const patch = (next: Partial<BomRuleDoc>) => setDoc((current) => ({ ...current, ...next }));
  const patchApplicability = (index: number, next: Partial<Applicability>) => setDoc((current) => ({
    ...current,
    applicability: (current.applicability ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row),
  }));

  const save = async () => {
    if (!text(doc.rule_code) || !text(doc.rule_name)) { toast.error("Cần nhập Mã quy tắc và Tên quy tắc."); return; }
    if (!text(doc.result_uom)) { toast.error("Cần nhập ĐVT kết quả."); return; }
    if (text(doc.operator) !== "CONSTANT" && !text(doc.source_field)) { toast.error("Cần chọn trường nguồn từ hàng cha."); return; }
    if (num(doc.divide, 1) === 0) { toast.error("Hệ số chia không được bằng 0."); return; }
    const duplicateTargets = new Set<string>();
    for (const row of doc.applicability ?? []) {
      if (!text(row.component_item)) { toast.error("Mỗi dòng Áp dụng cho phải chọn thành phần con."); return; }
      const key = [text(row.scope_type), text(row.parent_item), text(row.parent_item_group), text(row.door_type), text(row.bom), text(row.component_item), num(row.priority)].join("|");
      if (duplicateTargets.has(key)) { toast.error("Có dòng Áp dụng cho bị trùng cùng scope/priority."); return; }
      duplicateTargets.add(key);
    }
    setSaving(true);
    try {
      const payload: BomRuleDoc = {
        ...doc,
        rule_code: text(doc.rule_code),
        rule_name: text(doc.rule_name),
        formula_json: JSON.stringify(formulaFromDoc(doc)),
        formula_display: formula,
        version: Math.max(1, Math.trunc(num(doc.version, 1))),
        qty_per_set: num(doc.qty_per_set, 1) || 1,
      };
      if (name) {
        const updated = await adapter.updateDoc("BOM Rule", name, payload, text(doc.modified));
        const savedName = text((updated as Json).name) || name;
        toast.success("Đã lưu Quy tắc BOM");
        onSaved?.(savedName);
      } else {
        const created = await adapter.createDoc("BOM Rule", payload);
        const savedName = text((created as Json).name) || text(payload.rule_code);
        toast.success("Đã tạo Quy tắc BOM");
        onSaved?.(savedName);
      }
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang đọc Quy tắc BOM…</div>;

  return <div className="h-full overflow-auto bg-background p-4 sm:p-5" data-surface="alumdoor-bom-rule-editor">
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{name ? `Quy tắc BOM ${name}` : "Tạo Quy tắc BOM"}</h2><Badge variant="outline">v{Math.max(1, num(doc.version, 1))}</Badge>{doc.disabled ? <Badge variant="destructive">Ngưng dùng</Badge> : null}</div><p className="mt-1 text-sm text-muted-foreground">Một công thức dùng chung cho nhiều BOM. Cutting Policy vẫn chỉ tính hình học cửa cha.</p></div></div>
        <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button>
      </div>

      <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Nhận diện quy tắc</h3><div className="grid gap-3 md:grid-cols-4">
        <Field label="Mã quy tắc"><input className={fieldClass} value={text(doc.rule_code)} disabled={Boolean(name)} onChange={(e)=>patch({rule_code:e.target.value})} placeholder="BR-TRUC114-RONGPB-2CM" /></Field>
        <Field label="Tên quy tắc" className="md:col-span-2"><input className={fieldClass} value={text(doc.rule_name)} onChange={(e)=>patch({rule_name:e.target.value})} placeholder="Trục = Rộng PB ray + 2cm" /></Field>
        <Field label="Phiên bản"><input className={fieldClass} type="number" min={1} value={num(doc.version,1)} onChange={(e)=>patch({version:Number(e.target.value)})} /></Field>
        <Field label="Mô tả" className="md:col-span-3"><input className={fieldClass} value={text(doc.description)} onChange={(e)=>patch({description:e.target.value})} /></Field>
        <Field label="Trạng thái"><select className={fieldClass} value={doc.disabled ? "1":"0"} onChange={(e)=>patch({disabled:Number(e.target.value)})}><option value="0">Đang dùng</option><option value="1">Ngưng dùng</option></select></Field>
      </div></section>

      <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Calculator className="size-4" /><h3 className="font-medium">Công thức từ hàng cha → hàng con</h3></div><div className="grid gap-3 md:grid-cols-4">
        <Field label="Loại kết quả"><select className={fieldClass} value={text(doc.result_kind)} onChange={(e)=>patch({result_kind:e.target.value})}>{["LENGTH","AREA","COUNT","WEIGHT","CONSTANT"].map((x)=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Trường nguồn từ cha"><select className={fieldClass} value={text(doc.source_field)} disabled={text(doc.operator)==="CONSTANT"} onChange={(e)=>patch({source_field:e.target.value})}>{GEOMETRY_FIELDS.map(([value,label])=><option key={value} value={value}>{label} · {value}</option>)}</select></Field>
        <Field label="Phép tính"><select className={fieldClass} value={text(doc.operator)} onChange={(e)=>patch({operator:e.target.value})}>{["COPY","ADD","SUBTRACT","MULTIPLY","DIVIDE","CONSTANT"].map((x)=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Giá trị phép tính"><input className={fieldClass} type="number" step="0.001" value={num(doc.operand)} onChange={(e)=>patch({operand:Number(e.target.value)})} /></Field>
        <Field label="Hệ số nhân"><input className={fieldClass} type="number" step="0.001" value={num(doc.multiply,1)} onChange={(e)=>patch({multiply:Number(e.target.value)})} /></Field>
        <Field label="Hệ số chia"><input className={fieldClass} type="number" step="0.001" value={num(doc.divide,1)} onChange={(e)=>patch({divide:Number(e.target.value)})} /></Field>
        <Field label="SL mỗi bộ"><input className={fieldClass} type="number" step="0.001" min="0.000001" value={num(doc.qty_per_set,1)} onChange={(e)=>patch({qty_per_set:Number(e.target.value)})} /></Field>
        <Field label="ĐVT kết quả / tiêu hao"><input className={fieldClass} value={text(doc.result_uom)} onChange={(e)=>patch({result_uom:e.target.value})} placeholder="Mét / Cái / m2" /></Field>
        <Field label="Làm tròn"><select className={fieldClass} value={text(doc.rounding)} onChange={(e)=>patch({rounding:e.target.value})}>{["NONE","ROUND","CEIL","FLOOR"].map((x)=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Precision"><input className={fieldClass} type="number" min="0" max="12" value={num(doc.precision,6)} onChange={(e)=>patch({precision:Number(e.target.value)})} /></Field>
        <div className="md:col-span-2 rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Công thức canonical</div><div className="mt-1 font-mono text-sm font-medium">{formula}</div></div>
        <Field label="Giá trị thử"><input className={fieldClass} type="number" step="0.01" value={testValue} onChange={(e)=>setTestValue(Number(e.target.value))} /></Field>
        <div className="flex items-end"><div className="w-full rounded-lg border bg-primary/5 px-3 py-2"><div className="text-xs text-muted-foreground">Kết quả thử</div><div className="font-mono text-base font-semibold text-primary">{preview == null ? "Không hợp lệ" : `${preview} ${text(doc.result_uom)}`}</div></div></div>
      </div></section>

      <section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Áp dụng cho</h3><p className="text-xs text-muted-foreground">Một rule có thể gắn nhiều hàng cha/BOM. Resolve theo BOM &gt; Item &gt; Nhóm/Loại cửa &gt; Generic; cùng mức/cùng priority sẽ bị chặn.</p></div><Button size="sm" variant="outline" onClick={()=>setDoc((current)=>({...current,applicability:[...(current.applicability??[]),{scope_type:"ITEM",priority:100,disabled:0}]}))}><Plus className="size-4" /> Thêm dòng</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-2">Phạm vi</th><th className="p-2">Hàng cha</th><th className="p-2">Nhóm cha</th><th className="p-2">Loại cửa</th><th className="p-2">BOM</th><th className="p-2">Thành phần con</th><th className="p-2">Ưu tiên</th><th className="p-2">Hiệu lực</th><th className="p-2">Ghi chú</th><th className="w-10" /></tr></thead><tbody>
          {(doc.applicability??[]).map((row,index)=><tr key={index} className="border-b align-top"><td className="p-1.5"><select className={fieldClass} value={text(row.scope_type)||"ITEM"} onChange={(e)=>patchApplicability(index,{scope_type:e.target.value})}>{["BOM","ITEM","ITEM_GROUP","DOOR_TYPE","GENERIC"].map((x)=><option key={x}>{x}</option>)}</select></td><td className="p-1.5"><input className={fieldClass} value={text(row.parent_item)} onChange={(e)=>patchApplicability(index,{parent_item:e.target.value})} /></td><td className="p-1.5"><input className={fieldClass} value={text(row.parent_item_group)} onChange={(e)=>patchApplicability(index,{parent_item_group:e.target.value})} /></td><td className="p-1.5"><select className={fieldClass} value={text(row.door_type)} onChange={(e)=>patchApplicability(index,{door_type:e.target.value})}><option value="">—</option>{["Cửa Đức","Cửa Úc","Cửa Lưới","Cửa Đài Loan","Cửa Siêu Trường","Cửa tấm liền Úc"].map((x)=><option key={x}>{x}</option>)}</select></td><td className="p-1.5"><input className={fieldClass} value={text(row.bom)} onChange={(e)=>patchApplicability(index,{bom:e.target.value})} /></td><td className="p-1.5"><input className={fieldClass} value={text(row.component_item)} onChange={(e)=>patchApplicability(index,{component_item:e.target.value})} placeholder="NVL-..." /></td><td className="p-1.5"><input className={fieldClass} type="number" value={num(row.priority)} onChange={(e)=>patchApplicability(index,{priority:Number(e.target.value)})} /></td><td className="p-1.5"><div className="grid gap-1"><input className={fieldClass} type="date" value={text(row.effective_from)} onChange={(e)=>patchApplicability(index,{effective_from:e.target.value})} /><input className={fieldClass} type="date" value={text(row.effective_to)} onChange={(e)=>patchApplicability(index,{effective_to:e.target.value})} /></div></td><td className="p-1.5"><input className={fieldClass} value={text(row.note)} onChange={(e)=>patchApplicability(index,{note:e.target.value})} /></td><td className="p-1.5"><Button size="sm" variant="ghost" onClick={()=>setDoc((current)=>({...current,applicability:(current.applicability??[]).filter((_,i)=>i!==index)}))}><Trash2 className="size-4" /></Button></td></tr>)}
          {!doc.applicability?.length ? <tr><td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">Chưa có phạm vi áp dụng. Thêm dòng để rule được resolve tự động cho BOM.</td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Nguồn / xác nhận kỹ thuật</h3><div className="grid gap-3 md:grid-cols-4">
        <Field label="Authority"><select className={fieldClass} value={text(doc.authority_type)} onChange={(e)=>patch({authority_type:e.target.value})}>{["SOURCE","OWNER_CONFIRMED","ENGINEERING_INFERENCE"].map((x)=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Sheet nguồn"><input className={fieldClass} value={text(doc.source_sheet)} onChange={(e)=>patch({source_sheet:e.target.value})} /></Field>
        <Field label="Dòng nguồn"><input className={fieldClass} type="number" value={doc.source_row == null ? "" : num(doc.source_row)} onChange={(e)=>patch({source_row:e.target.value?Number(e.target.value):undefined})} /></Field>
        <Field label="Mã công thức nguồn"><input className={fieldClass} value={text(doc.source_formula_code)} onChange={(e)=>patch({source_formula_code:e.target.value})} /></Field>
        <Field label="Công thức nguồn gốc" className="md:col-span-2"><input className={fieldClass} value={text(doc.source_formula_text)} onChange={(e)=>patch({source_formula_text:e.target.value})} placeholder="Ví dụ RPBRAY+20CM" /></Field>
        <Field label="Người xác nhận"><input className={fieldClass} value={text(doc.confirmed_by)} onChange={(e)=>patch({confirmed_by:e.target.value})} /></Field>
        <Field label="Thời điểm xác nhận"><input className={fieldClass} type="datetime-local" value={text(doc.confirmed_at).replace(/Z$/,"").slice(0,16)} onChange={(e)=>patch({confirmed_at:e.target.value})} /></Field>
        <Field label="Ghi chú nguồn / override" className="md:col-span-4"><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" value={text(doc.source_note)} onChange={(e)=>patch({source_note:e.target.value})} /></Field>
      </div></section>
    </div>
  </div>;
}
