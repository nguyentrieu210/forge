/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, BadgeDollarSign, Eye, ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

type Json = Record<string, unknown>;
export type PricingMasterDoctype = "Item Price" | "Pricing Scope" | "Pricing Rule";

type ScopeMember = Json & { member_type?: string; item_code?: string; item_group?: string };
type PricingScopeDoc = Json & { name?: string; modified?: string; scope_name?: string; members?: ScopeMember[]; disabled?: number | boolean };
type PricingRuleDoc = Json & {
  name?: string; modified?: string; title?: string; price_list?: string; pricing_scope?: string; item_code?: string; item_group?: string;
  party_type?: string; party?: string; customer_group?: string; currency?: string; effect_type?: string; rate?: string | number;
  discount_percentage?: string | number; discount_amount?: string | number; adjustment_basis?: string; adjustment_rate?: string | number;
  conditions?: unknown; exclusive_group?: string; priority?: string | number; valid_from?: string; valid_upto?: string; taxable?: number | boolean;
  discountable?: number | boolean; disabled?: number | boolean;
};
type ItemPriceDoc = Json & {
  name?: string; modified?: string; price_list?: string; item_code?: string; uom?: string; price_variant?: string; area_tier?: string;
  currency?: string; rate?: string | number; disabled?: number | boolean;
};

type Options = { priceLists: Doc[]; scopes: Doc[]; itemGroups: Doc[]; customers: Doc[]; customerGroups: Doc[]; uoms: Doc[]; areaTiers: Doc[] };

type PreviewInput = { item_code: string; price_list: string; uom: string; qty: string; set_count: string; area_per_set_sqm: string; customer: string };

export interface PricingMasterWorkbenchProps {
  doctype: PricingMasterDoctype;
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const textAreaClass = "min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
const EMPTY_OPTIONS: Options = { priceLists: [], scopes: [], itemGroups: [], customers: [], customerGroups: [], uoms: [], areaTiers: [] };
const EFFECTS = ["RATE_OVERRIDE", "DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "ADJUSTMENT"];
const EFFECT_LABEL: Record<string, string> = { RATE_OVERRIDE: "Giá riêng", DISCOUNT_PERCENT: "Giảm theo %", DISCOUNT_AMOUNT: "Giảm số tiền", ADJUSTMENT: "Phụ thu / điều chỉnh" };
const BASES = ["FIXED", "PRICED_QTY", "AREA_SQM", "LENGTH_M", "SET_COUNT"];
const BASIS_LABEL: Record<string, string> = { FIXED: "Một mức cố định", PRICED_QTY: "Theo số lượng bán", AREA_SQM: "Theo diện tích", LENGTH_M: "Theo chiều dài", SET_COUNT: "Theo số bộ" };

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function yes(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function rows(value: unknown): ScopeMember[] { return Array.isArray(value) ? value.filter((row): row is ScopeMember => Boolean(row) && typeof row === "object") : []; }
function docName(row: Doc): string { return text(row.name); }
function numberValue(value: unknown): number | undefined { const parsed = Number(value); return text(value) !== "" && Number.isFinite(parsed) ? parsed : undefined; }
function today(): string { return new Date().toISOString().slice(0, 10); }
function asJsonText(value: unknown): string {
  if (value === undefined || value === null || value === "") return "[]";
  if (typeof value === "string") { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
  return JSON.stringify(value, null, 2);
}
function parseConditions(value: string): unknown[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Điều kiện bổ sung phải là một mảng JSON.");
  return parsed;
}
function emptyDoc(doctype: PricingMasterDoctype): PricingScopeDoc | PricingRuleDoc | ItemPriceDoc {
  if (doctype === "Pricing Scope") return { scope_name: "", members: [], disabled: 0 };
  if (doctype === "Pricing Rule") return {
    title: "", pricing_scope: "", price_list: "", currency: "VND", effect_type: "RATE_OVERRIDE", adjustment_basis: "FIXED",
    priority: 0, conditions: [], taxable: 1, discountable: 0, disabled: 1,
  };
  return { price_list: "", item_code: "", uom: "", price_variant: "STANDARD", area_tier: "MOI-DIEN-TICH", currency: "VND", rate: "", disabled: 0 };
}

function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>;
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
function SelectDocs({ value, rows, onChange, empty = "— chọn —" }: { value: string; rows: Doc[]; onChange: (value: string) => void; empty?: string }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{rows.map((row) => <option key={docName(row)} value={docName(row)}>{docName(row)}</option>)}</select>;
}

export function PricingMasterWorkbench({ doctype, name, base, listPath, onNavigate, onSaved, onCancel }: PricingMasterWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<PricingScopeDoc | PricingRuleDoc | ItemPriceDoc>(() => emptyDoc(doctype));
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const [conditionsText, setConditionsText] = useState("[]");
  const [previewInput, setPreviewInput] = useState<PreviewInput>({ item_code: "", price_list: "", uom: "", qty: "1", set_count: "1", area_per_set_sqm: "", customer: "" });
  const [preview, setPreview] = useState<Json | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const optional = async (dt: string, pageLength: number) => adapter.getList(dt, { fields: ["name"], orderBy: "name asc", pageLength }).catch(() => [] as Doc[]);
        const [priceLists, scopes, itemGroups, customers, customerGroups, uoms, areaTiers, loaded] = await Promise.all([
          optional("Price List", 200), optional("Pricing Scope", 300), optional("Item Group", 300), optional("Customer", 300), optional("Customer Group", 200), optional("UOM", 100), optional("Bậc diện tích", 100),
          name ? adapter.getDoc(doctype, name).then((result) => result.doc as Json) : Promise.resolve(emptyDoc(doctype) as Json),
        ]);
        if (!active) return;
        setOptions({ priceLists, scopes, itemGroups, customers, customerGroups, uoms, areaTiers });
        const hydrated = { ...emptyDoc(doctype), ...loaded } as PricingScopeDoc | PricingRuleDoc | ItemPriceDoc;
        if (doctype === "Pricing Scope") (hydrated as PricingScopeDoc).members = rows((hydrated as PricingScopeDoc).members);
        setDoc(hydrated);
        if (doctype === "Pricing Rule") {
          const rule = hydrated as PricingRuleDoc;
          setConditionsText(asJsonText(rule.conditions));
          setPreviewInput((current) => ({ ...current, price_list: text(rule.price_list), customer: text(rule.party_type) === "Customer" ? text(rule.party) : "" }));
        }
        if (doctype === "Item Price") {
          const price = hydrated as ItemPriceDoc;
          setPreviewInput((current) => ({ ...current, item_code: text(price.item_code), price_list: text(price.price_list), uom: text(price.uom) }));
        }
      } catch (error) {
        if (active) toast.error(adapter.mapError(error).message);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [adapter, doctype, name]);

  const patch = (next: Json) => setDoc((current) => ({ ...current, ...next }));
  const scope = doc as PricingScopeDoc;
  const rule = doc as PricingRuleDoc;
  const price = doc as ItemPriceDoc;

  const ruleHasExplicitTarget = useMemo(() => doctype === "Pricing Rule" && Boolean(
    text(rule.pricing_scope) || text(rule.item_code) || text(rule.item_group) || text(rule.party) || text(rule.customer_group) || text(rule.price_list) || conditionsText.trim() !== "[]",
  ), [conditionsText, doctype, rule]);

  const validate = (): string | null => {
    if (doctype === "Pricing Scope") {
      const members = rows(scope.members);
      if (!text(scope.scope_name)) return "Tên phạm vi không được để trống.";
      if (!members.length) return "Phạm vi phải có ít nhất một mặt hàng hoặc nhóm hàng.";
      const seen = new Set<string>();
      for (const [index, member] of members.entries()) {
        const kind = text(member.member_type) || "Item";
        const value = kind === "Item Group" ? text(member.item_group) : text(member.item_code);
        if (!value) return `Dòng ${index + 1}: chưa chọn ${kind === "Item Group" ? "Nhóm hàng" : "Mặt hàng"}.`;
        const key = `${kind}:${value}`;
        if (seen.has(key)) return `Dòng ${index + 1}: ${value} bị khai trùng trong cùng phạm vi.`;
        seen.add(key);
      }
      return null;
    }
    if (doctype === "Item Price") {
      if (!text(price.price_list)) return "Cần chọn Bảng giá.";
      if (!text(price.item_code)) return "Cần nhập Mã hàng.";
      if (!text(price.uom)) return "Cần chọn ĐVT của giá.";
      if (!text(price.price_variant)) return "Cần khai Cách bán / biến thể giá.";
      if (!text(price.area_tier)) return "Cần chọn Bậc diện tích; hàng không chia bậc dùng MOI-DIEN-TICH.";
      if (!text(price.currency)) return "Cần khai Tiền tệ.";
      const rate = numberValue(price.rate);
      if (rate === undefined || rate < 0) return "Đơn giá phải là số không âm.";
      return null;
    }

    if (!text(rule.title)) return "Tên chính sách không được để trống.";
    if (!text(rule.effect_type)) return "Cần chọn Loại áp dụng.";
    if (!yes(rule.disabled) && !ruleHasExplicitTarget && !confirmGlobal) return "Chính sách đang bật nhưng không có phạm vi. Nếu thật sự áp cho toàn bộ, hãy xác nhận ‘Áp dụng toàn bộ’ trước khi lưu.";
    if (text(rule.valid_from) && text(rule.valid_upto) && text(rule.valid_from) > text(rule.valid_upto)) return "Ngày hiệu lực đến phải sau hoặc bằng ngày hiệu lực từ.";
    try { parseConditions(conditionsText); } catch (error) { return error instanceof Error ? error.message : "Điều kiện bổ sung không hợp lệ."; }
    const effect = text(rule.effect_type);
    if (effect === "RATE_OVERRIDE" && numberValue(rule.rate) === undefined) return "Chính sách Giá riêng phải khai Giá riêng.";
    if (effect === "DISCOUNT_PERCENT") {
      const value = numberValue(rule.discount_percentage);
      if (value === undefined || value < 0 || value > 100) return "Tỷ lệ giảm phải nằm trong khoảng 0–100%.";
    }
    if (effect === "DISCOUNT_AMOUNT" && numberValue(rule.discount_amount) === undefined) return "Chính sách Giảm số tiền phải khai Số tiền giảm.";
    if (effect === "ADJUSTMENT") {
      if (!text(rule.adjustment_basis)) return "Phụ thu phải chọn Cơ sở tính.";
      if (numberValue(rule.adjustment_rate) === undefined) return "Phụ thu phải khai Đơn giá điều chỉnh.";
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      let payload: Json = { ...doc };
      if (doctype === "Pricing Scope") {
        payload = { ...scope, scope_name: text(scope.scope_name), members: rows(scope.members).map((member) => ({ ...member, member_type: text(member.member_type) || "Item", item_code: text(member.member_type) === "Item Group" ? "" : text(member.item_code), item_group: text(member.member_type) === "Item Group" ? text(member.item_group) : "" })) };
      } else if (doctype === "Pricing Rule") {
        payload = { ...rule, title: text(rule.title), effect_type: text(rule.effect_type), conditions: parseConditions(conditionsText), priority: numberValue(rule.priority) ?? 0 };
      } else {
        payload = { ...price, price_list: text(price.price_list), item_code: text(price.item_code), uom: text(price.uom), price_variant: text(price.price_variant).toUpperCase(), area_tier: text(price.area_tier), currency: text(price.currency), rate: numberValue(price.rate) ?? 0 };
      }
      const saved = name ? await adapter.updateDoc(doctype, name, payload, text((doc as Json).modified)) : await adapter.createDoc(doctype, payload);
      const savedName = text((saved as Json).name) || (doctype === "Pricing Scope" ? text(scope.scope_name) : text(name));
      toast.success(doctype === "Pricing Scope" ? "Đã lưu phạm vi giá." : doctype === "Pricing Rule" ? "Đã lưu chính sách giá." : "Đã lưu đơn giá.");
      if (savedName) onSaved?.(savedName);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  const runPreview = async () => {
    const itemCode = text(previewInput.item_code);
    const priceList = text(previewInput.price_list);
    const uom = text(previewInput.uom);
    const qty = numberValue(previewInput.qty);
    if (!itemCode || !priceList || !uom || qty === undefined || qty <= 0) { toast.error("Xem trước cần Mã hàng, Bảng giá, ĐVT và SL lớn hơn 0."); return; }
    setPreviewBusy(true); setPreviewError(""); setPreview(null);
    try {
      const item = (await adapter.getDoc("Item", itemCode)).doc as Json;
      let customerGroup = "";
      if (text(previewInput.customer)) {
        try { const customer = (await adapter.getDoc("Customer", text(previewInput.customer))).doc as Json; customerGroup = text(customer.price_group) || text(customer.customer_group); } catch { /* preview server will still validate party */ }
      }
      const areaPerSet = numberValue(previewInput.area_per_set_sqm);
      const setCount = numberValue(previewInput.set_count) ?? 1;
      const line: Json = { item_code: itemCode, uom, qty, set_count: setCount };
      if (areaPerSet !== undefined) { line.area_per_set_sqm = areaPerSet; line.billable_area_sqm = areaPerSet * setCount; }
      const result = await adapter.callPost<Json>("metaforge.api.preview_sales_commercial_line", {
        line,
        price_list: priceList,
        currency: text((doc as Json).currency) || "VND",
        posting_date: today(),
        customer: text(previewInput.customer),
        customer_group: customerGroup,
        facts: { item_code: itemCode, item_group: text(item.item_group), door_type: text(item.door_type), inventory_mode: text(item.inventory_mode), set_count: setCount, ...(areaPerSet !== undefined ? { billable_area_sqm: areaPerSet * setCount } : {}) },
      });
      setPreview(result);
    } catch (error) { setPreviewError(adapter.mapError(error).message); }
    finally { setPreviewBusy(false); }
  };

  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  const openGeneric = () => onNavigate(`${currentPath}?master_ui=generic`);
  const openDoc = (dt: string, target?: string) => onNavigate(target ? `${base}/${encodeURIComponent(dt)}/${encodeURIComponent(target)}` : `${base}/${encodeURIComponent(dt)}`);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải danh mục giá…</div>;

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-pricing-master-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" /><h2 className="text-lg font-semibold">{doctype === "Pricing Scope" ? "Phạm vi chính sách giá" : doctype === "Pricing Rule" ? "Chính sách giá" : "Đơn giá"}{name ? ` · ${name}` : " · Mới"}</h2></div><p className="mt-1 text-sm text-muted-foreground">{doctype === "Pricing Scope" ? "Khai đối tượng một lần rồi tái sử dụng cho nhiều chính sách." : doctype === "Pricing Rule" ? "Tách rõ phạm vi → tác động → hiệu lực; engine giá vẫn ở server." : "Khai giá gốc theo bảng giá, ĐVT, cách bán và bậc diện tích."}</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={openGeneric}>Form đầy đủ</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div></div></header>
    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"><div className="mx-auto max-w-6xl space-y-4">
      {doctype === "Pricing Scope" ? <ScopeEditor doc={scope} itemGroups={options.itemGroups} patch={patch} /> : null}
      {doctype === "Pricing Rule" ? <RuleEditor doc={rule} options={options} conditionsText={conditionsText} setConditionsText={setConditionsText} confirmGlobal={confirmGlobal} setConfirmGlobal={setConfirmGlobal} hasExplicitTarget={ruleHasExplicitTarget} patch={patch} openDoc={openDoc} /> : null}
      {doctype === "Item Price" ? <PriceEditor doc={price} options={options} patch={patch} openDoc={openDoc} /> : null}
      {doctype !== "Pricing Scope" ? <PreviewPanel input={previewInput} setInput={setPreviewInput} options={options} preview={preview} error={previewError} busy={previewBusy} onRun={() => void runPreview()} currentRuleName={doctype === "Pricing Rule" ? name : undefined} /> : null}
    </div></main>
  </div>;
}

function ScopeEditor({ doc, itemGroups, patch }: { doc: PricingScopeDoc; itemGroups: Doc[]; patch: (next: Json) => void }) {
  const members = rows(doc.members);
  const patchRow = (index: number, next: Json) => patch({ members: members.map((row, i) => i === index ? { ...row, ...next } : row) });
  return <><section className="rounded-xl border bg-card p-4"><div className="grid gap-3 md:grid-cols-3"><Field label="Tên phạm vi" className="md:col-span-2"><input className={fieldClass} value={text(doc.scope_name)} onChange={(e) => patch({ scope_name: e.target.value })} placeholder="CỬA VÂN GỖ" /></Field><Check label="Ngừng dùng" checked={yes(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /></div></section><section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-medium">Mặt hàng / nhóm hàng được áp dụng</h3><p className="text-xs text-muted-foreground">Phạm vi rỗng sẽ không match bất kỳ dòng bán nào, nên workbench không cho lưu rỗng.</p></div><Button size="sm" variant="outline" onClick={() => patch({ members: [...members, { member_type: "Item", item_code: "", item_group: "" }] })}><Plus className="size-4" /> Thêm</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3 w-40">Áp dụng theo</th><th className="p-3">Đối tượng</th><th className="w-14" /></tr></thead><tbody>{members.length ? members.map((member, index) => { const kind = text(member.member_type) || "Item"; return <tr key={text(member.name) || index} className="border-b"><td className="p-2"><select className={fieldClass} value={kind} onChange={(e) => patchRow(index, { member_type: e.target.value, item_code: "", item_group: "" })}><option>Item</option><option>Item Group</option></select></td><td className="p-2">{kind === "Item Group" ? <SelectDocs value={text(member.item_group)} rows={itemGroups} onChange={(value) => patchRow(index, { item_group: value })} /> : <input className={fieldClass} value={text(member.item_code)} onChange={(e) => patchRow(index, { item_code: e.target.value.toUpperCase() })} placeholder="Gõ đúng mã mặt hàng" />}</td><td className="p-2"><Button size="sm" variant="ghost" onClick={() => patch({ members: members.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></td></tr>; }) : <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Chưa có đối tượng nào. Thêm ít nhất một dòng để phạm vi có ý nghĩa.</td></tr>}</tbody></table></div></section></>;
}

function RuleEditor({ doc, options, conditionsText, setConditionsText, confirmGlobal, setConfirmGlobal, hasExplicitTarget, patch, openDoc }: { doc: PricingRuleDoc; options: Options; conditionsText: string; setConditionsText: (value: string) => void; confirmGlobal: boolean; setConfirmGlobal: (value: boolean) => void; hasExplicitTarget: boolean; patch: (next: Json) => void; openDoc: (dt: string, target?: string) => void }) {
  const effect = text(doc.effect_type) || "RATE_OVERRIDE";
  return <><section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">1 · Chính sách áp cho đâu?</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Tên chính sách" className="md:col-span-2"><input className={fieldClass} value={text(doc.title)} onChange={(e) => patch({ title: e.target.value })} /></Field><Field label="Bảng giá"><SelectDocs value={text(doc.price_list)} rows={options.priceLists} onChange={(value) => patch({ price_list: value })} /></Field><Field label="Phạm vi"><SelectDocs value={text(doc.pricing_scope)} rows={options.scopes} onChange={(value) => patch({ pricing_scope: value })} /></Field><Field label="Khách hàng"><SelectDocs value={text(doc.party_type) === "Customer" ? text(doc.party) : ""} rows={options.customers} onChange={(value) => patch({ party_type: value ? "Customer" : "", party: value })} /></Field><Field label="Nhóm khách"><SelectDocs value={text(doc.customer_group)} rows={options.customerGroups} onChange={(value) => patch({ customer_group: value })} /></Field><Field label="Tiền tệ"><input className={fieldClass} value={text(doc.currency) || "VND"} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} /></Field><div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => openDoc("Pricing Scope", text(doc.pricing_scope) || undefined)}><ExternalLink className="size-4" /> Mở phạm vi</Button></div></div>{!hasExplicitTarget ? <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><div className="font-medium">Không có bộ lọc nào — luật này sẽ có thể áp toàn cục.</div><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={confirmGlobal} onChange={(e) => setConfirmGlobal(e.target.checked)} /> Tôi chủ đích áp dụng toàn bộ.</label></div></div></div> : null}</section>
    <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">2 · Tác động lên giá</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Loại áp dụng"><select className={fieldClass} value={effect} onChange={(e) => patch({ effect_type: e.target.value })}>{EFFECTS.map((value) => <option key={value} value={value}>{EFFECT_LABEL[value]}</option>)}</select></Field>{effect === "RATE_OVERRIDE" ? <Field label="Giá riêng"><input className={fieldClass} type="number" step="1" value={text(doc.rate)} onChange={(e) => patch({ rate: e.target.value })} /></Field> : null}{effect === "DISCOUNT_PERCENT" ? <Field label="Tỷ lệ giảm (%)"><input className={fieldClass} type="number" min="0" max="100" step="0.01" value={text(doc.discount_percentage)} onChange={(e) => patch({ discount_percentage: e.target.value })} /></Field> : null}{effect === "DISCOUNT_AMOUNT" ? <Field label="Số tiền giảm"><input className={fieldClass} type="number" min="0" step="1" value={text(doc.discount_amount)} onChange={(e) => patch({ discount_amount: e.target.value })} /></Field> : null}{effect === "ADJUSTMENT" ? <><Field label="Cơ sở tính"><select className={fieldClass} value={text(doc.adjustment_basis) || "FIXED"} onChange={(e) => patch({ adjustment_basis: e.target.value })}>{BASES.map((value) => <option key={value} value={value}>{BASIS_LABEL[value]}</option>)}</select></Field><Field label="Đơn giá điều chỉnh"><input className={fieldClass} type="number" step="1" value={text(doc.adjustment_rate)} onChange={(e) => patch({ adjustment_rate: e.target.value })} /></Field><Field label="Nhóm loại trừ"><input className={fieldClass} value={text(doc.exclusive_group)} onChange={(e) => patch({ exclusive_group: e.target.value })} /></Field></> : null}<Field label="Độ ưu tiên"><input className={fieldClass} type="number" step="1" value={text(doc.priority)} onChange={(e) => patch({ priority: e.target.value })} /></Field></div></section>
    <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">3 · Hiệu lực & điều kiện</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Hiệu lực từ"><input className={fieldClass} type="date" value={text(doc.valid_from)} onChange={(e) => patch({ valid_from: e.target.value })} /></Field><Field label="Hiệu lực đến"><input className={fieldClass} type="date" value={text(doc.valid_upto)} onChange={(e) => patch({ valid_upto: e.target.value })} /></Field><Check label="Tính thuế" checked={doc.taxable === undefined ? true : yes(doc.taxable)} onChange={(checked) => patch({ taxable: checked ? 1 : 0 })} /><Check label="Cho chiết khấu tiếp" checked={yes(doc.discountable)} onChange={(checked) => patch({ discountable: checked ? 1 : 0 })} /><Check label="Ngừng áp dụng" checked={yes(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /><Field label="Điều kiện bổ sung (JSON)" className="md:col-span-4" hint='Ví dụ [{"field":"color","operator":"eq","value":"VAN_GO"}]'><textarea className={textAreaClass} value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} /></Field></div></section></>;
}

function PriceEditor({ doc, options, patch, openDoc }: { doc: ItemPriceDoc; options: Options; patch: (next: Json) => void; openDoc: (dt: string, target?: string) => void }) {
  return <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Giá gốc</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Bảng giá"><SelectDocs value={text(doc.price_list)} rows={options.priceLists} onChange={(value) => patch({ price_list: value })} /></Field><Field label="Mã hàng"><input className={fieldClass} value={text(doc.item_code)} onChange={(e) => patch({ item_code: e.target.value.toUpperCase() })} placeholder="Mã Item" /></Field><Field label="ĐVT"><SelectDocs value={text(doc.uom)} rows={options.uoms} onChange={(value) => patch({ uom: value })} /></Field><Field label="Tiền tệ"><input className={fieldClass} value={text(doc.currency) || "VND"} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} /></Field><Field label="Cách bán / biến thể"><input className={fieldClass} value={text(doc.price_variant) || "STANDARD"} onChange={(e) => patch({ price_variant: e.target.value.toUpperCase() })} /></Field><Field label="Bậc diện tích" hint="Không chia bậc dùng MOI-DIEN-TICH"><SelectDocs value={text(doc.area_tier)} rows={[{ name: "MOI-DIEN-TICH" } as Doc, ...options.areaTiers.filter((row) => docName(row) !== "MOI-DIEN-TICH")]} onChange={(value) => patch({ area_tier: value })} /></Field><Field label="Đơn giá"><input className={fieldClass} type="number" min="0" step="1" value={text(doc.rate)} onChange={(e) => patch({ rate: e.target.value })} /></Field><Check label="Ngừng dùng" checked={yes(doc.disabled)} onChange={(checked) => patch({ disabled: checked ? 1 : 0 })} /><div className="md:col-span-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => openDoc("Item", text(doc.item_code) || undefined)}><ExternalLink className="size-4" /> Mở mặt hàng</Button><Button variant="outline" onClick={() => openDoc("Bậc diện tích", text(doc.area_tier) === "MOI-DIEN-TICH" ? undefined : text(doc.area_tier) || undefined)}><ExternalLink className="size-4" /> Mở bậc diện tích</Button></div></div></section>;
}

function PreviewPanel({ input, setInput, options, preview, error, busy, onRun, currentRuleName }: { input: PreviewInput; setInput: (value: PreviewInput) => void; options: Options; preview: Json | null; error: string; busy: boolean; onRun: () => void; currentRuleName?: string }) {
  const update = (next: Partial<PreviewInput>) => setInput({ ...input, ...next });
  const snapshots = Array.isArray(preview?.pricing_rule_snapshots) ? preview!.pricing_rule_snapshots as Json[] : [];
  const adjustments = Array.isArray(preview?.applied_adjustments) ? preview!.applied_adjustments as Json[] : [];
  const matched = currentRuleName ? snapshots.some((row) => text(row.rule_name) === currentRuleName) || adjustments.some((row) => text(row.rule_name) === currentRuleName) : false;
  return <section className="rounded-xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><h3 className="font-medium">4 · Xem trước bằng engine giá thật</h3><p className="text-xs text-muted-foreground">Preview đọc dữ liệu đã lưu trên server. Với chính sách đang sửa, hãy Lưu trước rồi chạy lại để kiểm tra nó có match.</p></div><Button variant="outline" onClick={onRun} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Xem trước</Button></div><div className="grid gap-3 p-4 md:grid-cols-4"><Field label="Mã hàng"><input className={fieldClass} value={input.item_code} onChange={(e) => update({ item_code: e.target.value.toUpperCase() })} /></Field><Field label="Bảng giá"><SelectDocs value={input.price_list} rows={options.priceLists} onChange={(value) => update({ price_list: value })} /></Field><Field label="ĐVT"><SelectDocs value={input.uom} rows={options.uoms} onChange={(value) => update({ uom: value })} /></Field><Field label="Khách hàng"><SelectDocs value={input.customer} rows={options.customers} onChange={(value) => update({ customer: value })} /></Field><Field label="SL tính giá"><input className={fieldClass} type="number" min="0.000001" step="0.001" value={input.qty} onChange={(e) => update({ qty: e.target.value })} /></Field><Field label="Số bộ"><input className={fieldClass} type="number" min="1" step="1" value={input.set_count} onChange={(e) => update({ set_count: e.target.value })} /></Field><Field label="Diện tích mỗi bộ (m²)"><input className={fieldClass} type="number" min="0" step="0.01" value={input.area_per_set_sqm} onChange={(e) => update({ area_per_set_sqm: e.target.value })} /></Field></div>{error ? <div className="mx-4 mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}{preview ? <div className="border-t p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Đơn giá bán" value={text(preview.selling_rate ?? preview.rate)} /><Metric label="Tiền trước giảm" value={text(preview.gross_amount)} /><Metric label="Giảm giá" value={text(preview.discount_amount)} /><Metric label="Điều chỉnh" value={text(preview.adjustment_amount)} /><Metric label="Thành tiền" value={text(preview.net_before_tax ?? preview.net_amount ?? preview.amount)} /></div>{currentRuleName ? <div className={`mt-3 rounded-lg border p-3 text-sm ${matched ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>{matched ? `✓ Chính sách ${currentRuleName} có tham gia phép tính này.` : `Chính sách ${currentRuleName} không match tình huống đang thử.`}</div> : null}{snapshots.length || adjustments.length ? <div className="mt-3 flex flex-wrap gap-2">{[...new Map([...snapshots, ...adjustments].map((row) => [text(row.rule_name), row])).values()].filter((row) => text(row.rule_name)).map((row) => <Badge key={text(row.rule_name)} variant="outline">{text(row.rule_name)} · {text(row.effect_type || row.basis)}</Badge>)}</div> : null}</div> : null}</section>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value || "—"}</div></div>; }
