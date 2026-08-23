/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, Plus, Save, Trash2, Workflow } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;
type BomRow = Json & {
  name?: string;
  row_id?: string;
  item_code?: string;
  qty?: string | number;
  qty_basis?: string;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: string | number;
  bom_rule?: string;
  bom_rule_version?: number;
  source_value_status?: string;
  source_pending_reason?: string;
  source_note?: string;
  source_formula_text?: string;
};
type BomDoc = Json & {
  name?: string;
  modified?: string;
  docstatus?: 0 | 1 | 2;
  item?: string;
  company?: string;
  quantity?: string | number;
  is_active?: number | boolean;
  items?: BomRow[];
};

export interface BomMasterWorkbenchProps {
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function yes(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function rows(value: unknown): BomRow[] { return Array.isArray(value) ? value.filter((row): row is BomRow => Boolean(row) && typeof row === "object") : []; }
function positive(value: unknown): number | undefined { const parsed = Number(value); return text(value) !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; }
function optionName(row: Doc): string { return text(row.name); }
function emptyBom(): BomDoc { return { item: "", company: "", quantity: 1, is_active: 1, items: [], docstatus: 0 }; }
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) { return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>; }
function SelectDocs({ value, rows, onChange, empty = "— chọn —", disabled = false }: { value: string; rows: Doc[]; onChange: (value: string) => void; empty?: string; disabled?: boolean }) { return <select className={fieldClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{rows.map((row) => <option key={optionName(row)} value={optionName(row)}>{optionName(row)}</option>)}</select>; }

export function BomMasterWorkbench({ name, base, listPath, onNavigate, onSaved, onCancel }: BomMasterWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<BomDoc>(emptyBom);
  const [uoms, setUoms] = useState<Doc[]>([]);
  const [rules, setRules] = useState<Doc[]>([]);
  const [companies, setCompanies] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const optional = (dt: string, pageLength: number) => adapter.getList(dt, { fields: ["name"], orderBy: "name asc", pageLength }).catch(() => [] as Doc[]);
        const [uomRows, ruleRows, companyRows, loaded] = await Promise.all([
          optional("UOM", 100), optional("BOM Rule", 500), optional("Company", 100),
          name ? adapter.getDoc("Bill of Materials", name).then((result) => result.doc as BomDoc) : Promise.resolve(emptyBom()),
        ]);
        if (!active) return;
        setUoms(uomRows); setRules(ruleRows); setCompanies(companyRows);
        setDoc({ ...emptyBom(), ...loaded, items: rows(loaded.items) });
      } catch (error) { if (active) toast.error(adapter.mapError(error).message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [adapter, name]);

  const components = rows(doc.items);
  const readOnly = Number(doc.docstatus) !== 0;
  const patch = (next: Json) => setDoc((current) => ({ ...current, ...next }));
  const patchRow = (index: number, next: Json) => patch({ items: components.map((row, i) => i === index ? { ...row, ...next } : row) });
  const hasTemporary = useMemo(() => components.some((row) => JSON.stringify(row).includes("_tam_dien_1")), [components]);
  const pendingRows = useMemo(() => components.filter((row) => text(row.source_value_status).toUpperCase() === "PENDING" || text(row.source_pending_reason)), [components]);
  /*
   * SL trống KHÔNG còn là dấu hiệu dữ liệu thiếu — nó là cách khai "số lượng động".
   * Chỉ đáng cảnh báo khi trống mà cũng chẳng có Quy tắc BOM nào tính ra số đó: dòng ấy
   * xuống tới lệnh sản xuất là không ai biết cắt bao nhiêu.
   */
  const blankQtyRows = useMemo(
    () => components.filter((row) => positive(row.qty) === undefined && !text(row.bom_rule)),
    [components],
  );
  const ruleRows = useMemo(() => components.filter((row) => text(row.bom_rule)), [components]);

  const validate = (): string | null => {
    if (!text(doc.item)) return "Cần chọn Thành phẩm của BOM.";
    if (!text(doc.company)) return "Cần chọn Công ty.";
    if (positive(doc.quantity) === undefined) return "Số lượng thành phẩm cơ sở phải lớn hơn 0.";
    if (!components.length) return "BOM phải có ít nhất một cấu phần.";
    for (const [index, row] of components.entries()) {
      if (!text(row.item_code)) return `Dòng ${index + 1}: chưa có Vật tư.`;
      /*
       * SL để TRỐNG là hợp lệ — nghĩa là "số này động, Quy tắc BOM tính khi có đơn".
       *
       * Định mức chỉ nói bộ cửa gồm món gì và, nếu cố định, mấy món. Dòng lá không có số cố
       * định nào để điền: số lá phụ thuộc chiều cao từng đơn. Bắt điền một con số ở đây là
       * ép người dùng bịa, và con số bịa đó sẽ đi thẳng xuống lệnh sản xuất.
       */
      if (text(row.qty) && positive(row.qty) === undefined) {
        return `Dòng ${index + 1} (${text(row.item_code)}): SL phải lớn hơn 0, hoặc để trống nếu số lượng do Quy tắc BOM tính.`;
      }
      if (!text(row.qty) && !text(row.bom_rule)) {
        return `Dòng ${index + 1} (${text(row.item_code)}): để trống SL thì phải chọn Quy tắc BOM tính ra số đó.`;
      }
      if (!text(row.uom)) return `Dòng ${index + 1} (${text(row.item_code)}): chưa có ĐVT.`;
    }
    return null;
  };

  const save = async () => {
    if (readOnly) { toast.error("BOM đã ghi sổ/hủy không sửa trực tiếp được."); return; }
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      const payload: BomDoc = {
        ...doc,
        item: text(doc.item), company: text(doc.company), quantity: positive(doc.quantity) ?? 1,
        items: components.map((row, index) => ({ ...row, row_id: text(row.row_id) || `ROW-${index + 1}`, item_code: text(row.item_code), qty: positive(row.qty), qty_basis: text(row.qty_basis), uom: text(row.uom), bom_rule: text(row.bom_rule) })),
      };
      const saved = name ? await adapter.updateDoc("Bill of Materials", name, payload, text(doc.modified)) : await adapter.createDoc("Bill of Materials", payload);
      const savedName = text((saved as Json).name) || name || "";
      toast.success("Đã lưu BOM nháp.");
      if (savedName) onSaved?.(savedName);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  const openGeneric = () => onNavigate(`${currentPath}?master_ui=generic`);
  const openRule = (rule?: string) => onNavigate(rule ? `${base}/${encodeURIComponent("BOM Rule")}/${encodeURIComponent(rule)}` : `${base}/${encodeURIComponent("BOM Rule")}`);
  const openItem = (item?: string) => onNavigate(item ? `${base}/${encodeURIComponent("Item")}/${encodeURIComponent(item)}` : `${base}/${encodeURIComponent("Item")}`);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải định mức…</div>;

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-bom-master-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex flex-wrap items-center gap-2"><Workflow className="size-5 text-primary" /><h2 className="text-lg font-semibold">Định mức BOM{name ? ` · ${name}` : " · Mới"}</h2><Badge variant={Number(doc.docstatus) === 1 ? "default" : Number(doc.docstatus) === 2 ? "destructive" : "outline"}>{Number(doc.docstatus) === 1 ? "Đã ghi sổ" : Number(doc.docstatus) === 2 ? "Đã hủy" : "Bản nháp"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Định mức chỉ nói bộ này gồm món gì và, nếu cố định, mấy món. Chiều dài cắt, số lá, quy đổi kg đều do Quy tắc BOM và công thức cửa tính khi có đơn.</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={openGeneric}>Form đầy đủ / Ghi sổ</Button><Button onClick={() => void save()} disabled={saving || readOnly}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu nháp</Button></div></div></header>
    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"><div className="mx-auto max-w-7xl space-y-4">
      {(hasTemporary || pendingRows.length || blankQtyRows.length) ? <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><div className="font-medium">BOM này còn dữ liệu chưa đủ tin cậy để ghi sổ.</div><div className="mt-1 text-sm text-muted-foreground">{hasTemporary ? "Có dấu `_tam_dien_1` (số 1 điền tạm). " : ""}{pendingRows.length ? `${pendingRows.length} dòng đang PENDING. ` : ""}{blankQtyRows.length ? `${blankQtyRows.length} dòng để trống SL nhưng chưa gắn Quy tắc BOM nào tính ra số đó.` : ""} Workbench không tự đổi các giá trị này thành dữ liệu thật.</div></div></div></section> : null}
      <section className="rounded-xl border bg-card p-4"><div className="grid gap-3 md:grid-cols-4"><Field label="Thành phẩm" className="md:col-span-2" hint="Gõ đúng mã Item. Có thể mở hồ sơ Item để kiểm tra geometry/công thức cửa."><div className="flex gap-2"><input className={fieldClass} disabled={readOnly} value={text(doc.item)} onChange={(e) => patch({ item: e.target.value.toUpperCase() })} /><Button variant="outline" onClick={() => openItem(text(doc.item) || undefined)}><ExternalLink className="size-4" /></Button></div></Field><Field label="Công ty"><SelectDocs value={text(doc.company)} rows={companies} disabled={readOnly} onChange={(value) => patch({ company: value })} /></Field><Field label="SL thành phẩm cơ sở"><input className={fieldClass} disabled={readOnly} type="number" min="0.000001" step="0.001" value={text(doc.quantity)} onChange={(e) => patch({ quantity: e.target.value })} /></Field><label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:col-span-2"><input type="checkbox" disabled={readOnly} checked={yes(doc.is_active)} onChange={(e) => patch({ is_active: e.target.checked ? 1 : 0 })} /> BOM đang hoạt động</label><div className="md:col-span-2 flex items-center justify-end text-xs text-muted-foreground">{components.length} cấu phần · {ruleRows.length} dòng gắn BOM Rule</div></div></section>
      <section className="rounded-xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h3 className="font-medium">Cấu phần</h3><p className="text-xs text-muted-foreground">Để trống SL nghĩa là số lượng động — Quy tắc BOM tính khi có đơn (ví dụ số lá theo chiều cao cửa).</p></div><Button size="sm" variant="outline" disabled={readOnly} onClick={() => patch({ items: [...components, { row_id: `ROW-${components.length + 1}`, item_code: "", qty: "", qty_basis: "Cố định", uom: "", bom_rule: "" }] })}><Plus className="size-4" /> Thêm dòng</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Vật tư</th><th className="p-3 w-32">SL cố định</th><th className="p-3 w-32">ĐVT</th><th className="p-3">BOM Rule</th><th className="p-3">Nguồn / trạng thái</th><th className="w-14" /></tr></thead><tbody>{components.length ? components.map((row, index) => { const temporary = JSON.stringify(row).includes("_tam_dien_1"); const pending = text(row.source_value_status).toUpperCase() === "PENDING" || Boolean(text(row.source_pending_reason)); return <tr key={text(row.name) || text(row.row_id) || index} className={`border-b align-top ${temporary || pending ? "bg-amber-500/[0.035]" : ""}`}><td className="p-2"><input className={fieldClass} disabled={readOnly} value={text(row.item_code)} onChange={(e) => patchRow(index, { item_code: e.target.value.toUpperCase() })} /></td><td className="p-2"><input className={fieldClass} disabled={readOnly} type="number" min="0.000001" step="0.000001" placeholder="động" value={text(row.qty)} onChange={(e) => patchRow(index, { qty: e.target.value })} /></td><td className="p-2"><SelectDocs value={text(row.uom)} rows={uoms} disabled={readOnly} onChange={(value) => patchRow(index, { uom: value })} /></td><td className="p-2"><div className="flex gap-1"><SelectDocs value={text(row.bom_rule)} rows={rules} disabled={readOnly} onChange={(value) => patchRow(index, { bom_rule: value })} /><Button size="sm" variant="ghost" onClick={() => openRule(text(row.bom_rule) || undefined)}><ExternalLink className="size-4" /></Button></div>{row.bom_rule_version ? <div className="mt-1 text-[11px] text-muted-foreground">Snapshot v{row.bom_rule_version}</div> : null}</td><td className="p-2"><div className="flex flex-wrap gap-1">{temporary ? <Badge variant="destructive">TẠM 1</Badge> : null}{pending ? <Badge variant="outline">PENDING</Badge> : null}{text(row.source_value_status) === "RESOLVED" ? <Badge variant="outline">RESOLVED</Badge> : null}</div><div className="mt-1 max-w-72 text-[11px] leading-4 text-muted-foreground">{text(row.source_pending_reason) || text(row.source_note) || text(row.source_formula_text) || "—"}</div></td><td className="p-2"><Button size="sm" variant="ghost" disabled={readOnly} onClick={() => patch({ items: components.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></td></tr>; }) : <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Chưa có cấu phần.</td></tr>}</tbody></table></div></section>
      <section className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">Quy tắc BOM dùng chung</h3><p className="mt-1 text-sm text-muted-foreground">Cutting Policy giữ hình học cửa; BOM Rule chỉ mô tả cấu phần tiêu hao hình học đó. Không gộp hai authority thành một.</p></div><Button variant="outline" onClick={() => openRule()}><ExternalLink className="size-4" /> Mở danh mục BOM Rule</Button></div></section>
    </div></main>
  </div>;
}
