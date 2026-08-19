/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Calculator, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

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
  source_field_offset?: number;
  source_field_2?: string;
  source_field_2_offset?: number;
  operator?: string;
  operand?: number;
  multiply?: number;
  divide?: number;
  final_add?: number;
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

type FormulaOperand = { value: number } | { field: string; offset?: number };
type Formula = {
  base:
    | { kind: "CONSTANT"; value: number }
    | { kind: "FIELD"; field: string; offset?: number }
    | { kind: "PRODUCT"; left: FormulaOperand; right: FormulaOperand }
    | { kind: "QUOTIENT"; numerator: FormulaOperand; denominator: FormulaOperand };
  multiply?: number;
  add?: number;
  rounding?: string;
  precision?: number;
};

export interface AlumdoorBomRuleEditorProps {
  name?: string;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const GEOMETRY_FIELDS = [
  ["PB_RAY_RONG", "Rộng phủ bì ray"],
  ["PB_NHUA_RONG", "Rộng phủ bì nhựa"],
  ["PB_RONG", "Rộng phủ bì chung"],
  ["PB_CAO", "Cao phủ bì"],
  ["CAT_LA_RONG", "Rộng cắt lá"],
  ["CAO_LUOI", "Cao lưới"],
  ["billable_area_sqm", "Diện tích"],
  ["leaf_count", "Số lá"],
  ["set_count", "Số bộ"],
] as const;

const OPERATORS = ["COPY", "ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "PRODUCT", "QUOTIENT", "CONSTANT"] as const;

const emptyRule = (): BomRuleDoc => ({
  rule_code: "",
  rule_name: "",
  description: "",
  result_kind: "LENGTH",
  result_uom: "Mét",
  source_field: "PB_RAY_RONG",
  source_field_offset: 0,
  source_field_2: "PB_CAO",
  source_field_2_offset: 0,
  operator: "COPY",
  operand: 0,
  multiply: 1,
  divide: 1,
  final_add: 0,
  qty_per_set: 1,
  rounding: "NONE",
  precision: 6,
  version: 1,
  disabled: 0,
  authority_type: "SOURCE",
  applicability: [],
});

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function num(value: unknown, fallback = 0): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function round(value: number, precision = 6): number {
  const factor = 10 ** Math.max(0, Math.min(12, Math.trunc(precision)));
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function fieldOperand(field: unknown, offset: unknown): FormulaOperand {
  const name = text(field);
  return { field: name, ...(num(offset) ? { offset: num(offset) } : {}) };
}

function formulaFromDoc(doc: BomRuleDoc): Formula {
  const operator = text(doc.operator).toUpperCase() || "COPY";
  const operand = num(doc.operand);
  const sourceOffset = num(doc.source_field_offset);
  let formula: Formula;

  if (operator === "CONSTANT") {
    formula = { base: { kind: "CONSTANT", value: operand } };
  } else if (operator === "PRODUCT" || operator === "QUOTIENT") {
    const left = fieldOperand(doc.source_field, sourceOffset);
    const right = fieldOperand(doc.source_field_2, doc.source_field_2_offset);
    formula = operator === "PRODUCT"
      ? { base: { kind: "PRODUCT", left, right } }
      : { base: { kind: "QUOTIENT", numerator: left, denominator: right } };
  } else {
    const operationOffset = operator === "ADD" ? operand : operator === "SUBTRACT" ? -operand : 0;
    const offset = sourceOffset + operationOffset;
    formula = { base: { kind: "FIELD", field: text(doc.source_field), ...(offset ? { offset } : {}) } };
    if (operator === "MULTIPLY") formula.multiply = operand;
    if (operator === "DIVIDE") formula.multiply = operand ? 1 / operand : Number.NaN;
  }

  const finalFactor = num(formula.multiply, 1) * num(doc.multiply, 1) / num(doc.divide, 1);
  if (Number.isFinite(finalFactor) && Math.abs(finalFactor - 1) > 1e-12) formula.multiply = finalFactor;
  else delete formula.multiply;
  if (num(doc.final_add)) formula.add = num(doc.final_add);
  if (text(doc.rounding) && text(doc.rounding) !== "NONE") formula.rounding = text(doc.rounding);
  formula.precision = Math.max(0, Math.min(12, Math.trunc(num(doc.precision, 6))));
  return formula;
}

function operandDisplay(operand: FormulaOperand): string {
  if ("value" in operand) return `${operand.value}`;
  const offset = num(operand.offset);
  return `${operand.field || "?"}${offset > 0 ? ` + ${offset}` : offset < 0 ? ` - ${Math.abs(offset)}` : ""}`;
}

function formulaDisplay(doc: BomRuleDoc): string {
  const formula = formulaFromDoc(doc);
  let base: string;
  if (formula.base.kind === "CONSTANT") base = `${formula.base.value}`;
  else if (formula.base.kind === "FIELD") base = operandDisplay(formula.base);
  else if (formula.base.kind === "PRODUCT") base = `${operandDisplay(formula.base.left)} × ${operandDisplay(formula.base.right)}`;
  else base = `${operandDisplay(formula.base.numerator)} ÷ ${operandDisplay(formula.base.denominator)}`;
  const multiply = num(formula.multiply, 1);
  if (Math.abs(multiply - 1) > 1e-12) base = `(${base}) × ${multiply}`;
  const add = num(formula.add);
  if (add > 0) base = `${base} + ${add}`;
  if (add < 0) base = `${base} - ${Math.abs(add)}`;
  return formula.rounding ? `${formula.rounding}(${base})` : base;
}

function operandValue(operand: FormulaOperand, source1: string, value1: number, source2: string, value2: number): number {
  if ("value" in operand) return operand.value;
  const field = text(operand.field);
  const value = field === source2 ? value2 : field === source1 ? value1 : value1;
  return value + num(operand.offset);
}

function testFormula(doc: BomRuleDoc, input1: number, input2: number): number | null {
  if (!Number.isFinite(input1) || !Number.isFinite(input2) || num(doc.divide, 1) === 0) return null;
  const formula = formulaFromDoc(doc);
  let value: number;
  if (formula.base.kind === "CONSTANT") value = formula.base.value;
  else if (formula.base.kind === "FIELD") value = input1 + num(formula.base.offset);
  else if (formula.base.kind === "PRODUCT") {
    value = operandValue(formula.base.left, text(doc.source_field), input1, text(doc.source_field_2), input2)
      * operandValue(formula.base.right, text(doc.source_field), input1, text(doc.source_field_2), input2);
  } else {
    const numerator = operandValue(formula.base.numerator, text(doc.source_field), input1, text(doc.source_field_2), input2);
    const denominator = operandValue(formula.base.denominator, text(doc.source_field), input1, text(doc.source_field_2), input2);
    if (denominator === 0) return null;
    value = numerator / denominator;
  }
  value = value * num(formula.multiply, 1) + num(formula.add);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (formula.rounding === "CEIL") value = Math.ceil(value);
  else if (formula.rounding === "FLOOR") value = Math.floor(value);
  else if (formula.rounding === "ROUND") value = round(value, num(formula.precision, 6));
  return round(value, num(formula.precision, 6));
}

const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}</label>;
}
function GeometrySelect({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <select className={fieldClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value="">— chọn trường —</option>
    {GEOMETRY_FIELDS.map(([field, label]) => <option key={field} value={field}>{label} · {field}</option>)}
  </select>;
}

export function AlumdoorBomRuleEditor({ name, onSaved, onCancel }: AlumdoorBomRuleEditorProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<BomRuleDoc>(emptyRule);
  const [loading, setLoading] = useState(Boolean(name));
  const [saving, setSaving] = useState(false);
  const [testValue1, setTestValue1] = useState(3);
  const [testValue2, setTestValue2] = useState(2);

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
  const preview = useMemo(() => testFormula(doc, testValue1, testValue2), [doc, testValue1, testValue2]);
  const patch = (next: Partial<BomRuleDoc>) => setDoc((current) => ({ ...current, ...next }));
  const patchApplicability = (index: number, next: Partial<Applicability>) => setDoc((current) => ({
    ...current,
    applicability: (current.applicability ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row),
  }));
  const twoSource = ["PRODUCT", "QUOTIENT"].includes(text(doc.operator));
  const needsSource = text(doc.operator) !== "CONSTANT";
  const usesOperand = ["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "CONSTANT"].includes(text(doc.operator));

  const save = async () => {
    if (!text(doc.rule_code) || !text(doc.rule_name)) { toast.error("Cần nhập Mã quy tắc và Tên quy tắc."); return; }
    if (!text(doc.result_uom)) { toast.error("Cần nhập ĐVT kết quả."); return; }
    if (needsSource && !text(doc.source_field)) { toast.error("Cần chọn trường nguồn 1 từ hàng cha."); return; }
    if (twoSource && !text(doc.source_field_2)) { toast.error("PRODUCT/QUOTIENT cần trường nguồn 2."); return; }
    if ((text(doc.operator) === "DIVIDE" && num(doc.operand) === 0) || num(doc.divide, 1) === 0) { toast.error("Số chia không được bằng 0."); return; }
    if ((doc.applicability ?? []).some((row) => !text(row.component_item))) { toast.error("Mỗi dòng Áp dụng cho phải chọn thành phần con."); return; }
    const seen = new Set<string>();
    for (const row of doc.applicability ?? []) {
      const key = [text(row.scope_type), text(row.parent_item), text(row.parent_item_group), text(row.door_type), text(row.bom), text(row.component_item), num(row.priority)].join("|");
      if (seen.has(key)) { toast.error("Có dòng Áp dụng cho bị trùng cùng scope/priority."); return; }
      seen.add(key);
    }
    const test = testFormula(doc, testValue1, testValue2);
    if (test == null) { toast.error("Công thức hiện tại không tính được giá trị dương với dữ liệu thử."); return; }

    setSaving(true);
    try {
      const canonical = formulaFromDoc(doc);
      const payload: BomRuleDoc = {
        ...doc,
        rule_code: text(doc.rule_code),
        rule_name: text(doc.rule_name),
        formula_json: JSON.stringify(canonical),
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
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang đọc Quy tắc BOM…</div>;

  return <div className="h-full overflow-auto bg-background p-4 sm:p-5" data-surface="alumdoor-bom-rule-editor">
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button>
          <div>
            <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{name ? `Quy tắc BOM ${name}` : "Tạo Quy tắc BOM"}</h2><Badge variant="outline">v{Math.max(1, num(doc.version, 1))}</Badge>{doc.disabled ? <Badge variant="destructive">Ngưng dùng</Badge> : null}</div>
            <p className="mt-1 text-sm text-muted-foreground">Một công thức kỹ thuật dùng chung cho nhiều BOM. Cutting Policy vẫn chỉ tính hình học cửa cha.</p>
          </div>
        </div>
        <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-medium">Nhận diện quy tắc</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Mã quy tắc"><input className={fieldClass} value={text(doc.rule_code)} disabled={Boolean(name)} onChange={(e) => patch({ rule_code: e.target.value })} placeholder="BR-TRUC114-RONGPB-2CM" /></Field>
          <Field label="Tên quy tắc" className="md:col-span-2"><input className={fieldClass} value={text(doc.rule_name)} onChange={(e) => patch({ rule_name: e.target.value })} placeholder="Trục = Rộng PB ray + 2cm" /></Field>
          <Field label="Phiên bản"><input className={fieldClass} type="number" min={1} value={num(doc.version, 1)} onChange={(e) => patch({ version: Number(e.target.value) })} /></Field>
          <Field label="Mô tả" className="md:col-span-3"><input className={fieldClass} value={text(doc.description)} onChange={(e) => patch({ description: e.target.value })} /></Field>
          <Field label="Trạng thái"><select className={fieldClass} value={doc.disabled ? "1" : "0"} onChange={(e) => patch({ disabled: Number(e.target.value) })}><option value="0">Đang dùng</option><option value="1">Ngưng dùng</option></select></Field>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2"><Calculator className="size-4" /><h3 className="font-medium">Công thức từ hàng cha → hàng con</h3></div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Loại kết quả"><select className={fieldClass} value={text(doc.result_kind)} onChange={(e) => patch({ result_kind: e.target.value })}>{["LENGTH", "AREA", "COUNT", "WEIGHT", "CONSTANT"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Phép tính"><select className={fieldClass} value={text(doc.operator)} onChange={(e) => patch({ operator: e.target.value })}>{OPERATORS.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Trường nguồn 1"><GeometrySelect value={text(doc.source_field)} disabled={!needsSource} onChange={(value) => patch({ source_field: value })} /></Field>
          <Field label="Offset nguồn 1"><input className={fieldClass} type="number" step="0.001" disabled={!needsSource} value={num(doc.source_field_offset)} onChange={(e) => patch({ source_field_offset: Number(e.target.value) })} /></Field>
          {twoSource ? <><Field label="Trường nguồn 2"><GeometrySelect value={text(doc.source_field_2)} onChange={(value) => patch({ source_field_2: value })} /></Field><Field label="Offset nguồn 2"><input className={fieldClass} type="number" step="0.001" value={num(doc.source_field_2_offset)} onChange={(e) => patch({ source_field_2_offset: Number(e.target.value) })} /></Field></> : null}
          <Field label="Giá trị phép tính"><input className={fieldClass} type="number" step="0.001" disabled={!usesOperand} value={num(doc.operand)} onChange={(e) => patch({ operand: Number(e.target.value) })} /></Field>
          <Field label="Hệ số nhân cuối"><input className={fieldClass} type="number" step="0.001" value={num(doc.multiply, 1)} onChange={(e) => patch({ multiply: Number(e.target.value) })} /></Field>
          <Field label="Hệ số chia cuối"><input className={fieldClass} type="number" step="0.001" value={num(doc.divide, 1)} onChange={(e) => patch({ divide: Number(e.target.value) })} /></Field>
          <Field label="Cộng/trừ cuối"><input className={fieldClass} type="number" step="0.001" value={num(doc.final_add)} onChange={(e) => patch({ final_add: Number(e.target.value) })} /></Field>
          <Field label="SL mỗi bộ"><input className={fieldClass} type="number" step="0.001" min="0.000001" value={num(doc.qty_per_set, 1)} onChange={(e) => patch({ qty_per_set: Number(e.target.value) })} /></Field>
          <Field label="ĐVT kết quả / tiêu hao"><input className={fieldClass} value={text(doc.result_uom)} onChange={(e) => patch({ result_uom: e.target.value })} placeholder="Mét / Cái / m2" /></Field>
          <Field label="Làm tròn"><select className={fieldClass} value={text(doc.rounding)} onChange={(e) => patch({ rounding: e.target.value })}>{["NONE", "ROUND", "CEIL", "FLOOR"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Precision"><input className={fieldClass} type="number" min="0" max="12" value={num(doc.precision, 6)} onChange={(e) => patch({ precision: Number(e.target.value) })} /></Field>
          <div className="md:col-span-2 rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Công thức canonical</div><div className="mt-1 font-mono text-sm font-medium">{formula}</div></div>
          <Field label={`Giá trị thử · ${text(doc.source_field) || "Nguồn 1"}`}><input className={fieldClass} type="number" step="0.01" value={testValue1} onChange={(e) => setTestValue1(Number(e.target.value))} /></Field>
          <Field label={`Giá trị thử · ${twoSource ? text(doc.source_field_2) || "Nguồn 2" : "Nguồn 2 (dự phòng)"}`}><input className={fieldClass} type="number" step="0.01" value={testValue2} disabled={!twoSource} onChange={(e) => setTestValue2(Number(e.target.value))} /></Field>
          <div className="md:col-span-2 rounded-lg border bg-primary/5 px-3 py-2"><div className="text-xs text-muted-foreground">Kết quả thử cho 1 đơn vị</div><div className="font-mono text-base font-semibold text-primary">{preview == null ? "Không hợp lệ" : `${preview} ${text(doc.result_uom)}`}</div><div className="mt-1 text-xs text-muted-foreground">Tổng cho 1 bộ = {preview == null ? "—" : `${round(preview * num(doc.qty_per_set, 1), 6)} ${text(doc.result_uom)}`}</div></div>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Áp dụng cho</h3><p className="text-xs text-muted-foreground">BOM &gt; Item &gt; Nhóm/Loại cửa &gt; Generic. Hai rule cùng mức và cùng priority sẽ bị chặn.</p></div><Button size="sm" variant="outline" onClick={() => setDoc((current) => ({ ...current, applicability: [...(current.applicability ?? []), { scope_type: "ITEM", priority: 100, disabled: 0 }] }))}><Plus className="size-4" /> Thêm dòng</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-2">Phạm vi</th><th className="p-2">Hàng cha</th><th className="p-2">Nhóm cha</th><th className="p-2">Loại cửa</th><th className="p-2">BOM</th><th className="p-2">Thành phần con</th><th className="p-2">Ưu tiên</th><th className="p-2">Hiệu lực</th><th className="p-2">Ghi chú</th><th className="w-10" /></tr></thead><tbody>
          {(doc.applicability ?? []).map((row, index) => <tr key={index} className="border-b align-top">
            <td className="p-1.5"><select className={fieldClass} value={text(row.scope_type) || "ITEM"} onChange={(e) => patchApplicability(index, { scope_type: e.target.value })}>{["BOM", "ITEM", "ITEM_GROUP", "DOOR_TYPE", "GENERIC"].map((value) => <option key={value}>{value}</option>)}</select></td>
            <td className="p-1.5"><input className={fieldClass} value={text(row.parent_item)} onChange={(e) => patchApplicability(index, { parent_item: e.target.value })} /></td>
            <td className="p-1.5"><input className={fieldClass} value={text(row.parent_item_group)} onChange={(e) => patchApplicability(index, { parent_item_group: e.target.value })} /></td>
            <td className="p-1.5"><select className={fieldClass} value={text(row.door_type)} onChange={(e) => patchApplicability(index, { door_type: e.target.value })}><option value="">—</option>{["Cửa Đức", "Cửa Úc", "Cửa Lưới", "Cửa Đài Loan", "Cửa Siêu Trường", "Cửa tấm liền Úc"].map((value) => <option key={value}>{value}</option>)}</select></td>
            <td className="p-1.5"><input className={fieldClass} value={text(row.bom)} onChange={(e) => patchApplicability(index, { bom: e.target.value })} /></td>
            <td className="p-1.5"><input className={fieldClass} value={text(row.component_item)} onChange={(e) => patchApplicability(index, { component_item: e.target.value })} placeholder="NVL-..." /></td>
            <td className="p-1.5"><input className={fieldClass} type="number" value={num(row.priority)} onChange={(e) => patchApplicability(index, { priority: Number(e.target.value) })} /></td>
            <td className="p-1.5"><div className="grid gap-1"><input className={fieldClass} type="date" value={text(row.effective_from)} onChange={(e) => patchApplicability(index, { effective_from: e.target.value })} /><input className={fieldClass} type="date" value={text(row.effective_to)} onChange={(e) => patchApplicability(index, { effective_to: e.target.value })} /></div></td>
            <td className="p-1.5"><input className={fieldClass} value={text(row.note)} onChange={(e) => patchApplicability(index, { note: e.target.value })} /></td>
            <td className="p-1.5"><Button size="sm" variant="ghost" onClick={() => setDoc((current) => ({ ...current, applicability: (current.applicability ?? []).filter((_, rowIndex) => rowIndex !== index) }))}><Trash2 className="size-4" /></Button></td>
          </tr>)}
          {!doc.applicability?.length ? <tr><td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">Chưa có phạm vi áp dụng. Rule chưa được resolve tự động cho BOM nào.</td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-medium">Nguồn / xác nhận kỹ thuật</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Authority"><select className={fieldClass} value={text(doc.authority_type)} onChange={(e) => patch({ authority_type: e.target.value })}>{["SOURCE", "OWNER_CONFIRMED", "ENGINEERING_INFERENCE"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Sheet nguồn"><input className={fieldClass} value={text(doc.source_sheet)} onChange={(e) => patch({ source_sheet: e.target.value })} /></Field>
          <Field label="Dòng nguồn"><input className={fieldClass} type="number" value={doc.source_row == null ? "" : num(doc.source_row)} onChange={(e) => patch({ source_row: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Mã công thức nguồn"><input className={fieldClass} value={text(doc.source_formula_code)} onChange={(e) => patch({ source_formula_code: e.target.value })} /></Field>
          <Field label="Công thức nguồn gốc" className="md:col-span-2"><input className={fieldClass} value={text(doc.source_formula_text)} onChange={(e) => patch({ source_formula_text: e.target.value })} placeholder="Ví dụ RPBRAY+20CM" /></Field>
          <Field label="Người xác nhận"><input className={fieldClass} value={text(doc.confirmed_by)} onChange={(e) => patch({ confirmed_by: e.target.value })} /></Field>
          <Field label="Thời điểm xác nhận"><input className={fieldClass} type="datetime-local" value={text(doc.confirmed_at).replace(/Z$/, "").slice(0, 16)} onChange={(e) => patch({ confirmed_at: e.target.value })} /></Field>
          <Field label="Ghi chú nguồn / override" className="md:col-span-4"><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" value={text(doc.source_note)} onChange={(e) => patch({ source_note: e.target.value })} /></Field>
        </div>
      </section>
    </div>
  </div>;
}
