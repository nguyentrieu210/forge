/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, BatteryCharging, Cog, ExternalLink, Loader2, Save } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { Badge, Button, toast } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorMotorSuggestPanel } from "../AlumdoorMotorSuggestPanel.js";

type Json = Record<string, unknown>;
type ThresholdDoc = Json & {
  name?: string; modified?: string; rule_code?: string; item_code?: string; selection_basis?: string;
  max_area_sqm?: number | string; max_motor_kg?: number | string; includes?: string; sort_order?: number | string;
  nguon?: string; disabled?: number | boolean;
};

export interface MotorUpsMasterWorkbenchProps {
  name?: string;
  base: string;
  listPath: string;
  onNavigate: (path: string) => void;
  onSaved?: (name: string) => void;
  onCancel: () => void;
}

const fieldClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const textAreaClass = "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function yes(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function positive(value: unknown): number | undefined { const parsed = Number(value); return text(value) !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; }
function finite(value: unknown): number | undefined { const parsed = Number(value); return text(value) !== "" && Number.isFinite(parsed) ? parsed : undefined; }
function emptyDoc(): ThresholdDoc { return { rule_code: "", item_code: "", selection_basis: "Diện tích cửa", max_area_sqm: "", max_motor_kg: "", includes: "", sort_order: 10, nguon: "", disabled: 0 }; }
function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) { return <label className={className}><span className={labelClass}>{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}</label>; }

export function MotorUpsMasterWorkbench({ name, base, listPath, onNavigate, onSaved, onCancel }: MotorUpsMasterWorkbenchProps) {
  const { adapter } = useMetaForge();
  const [doc, setDoc] = useState<ThresholdDoc>(emptyDoc);
  const [allRows, setAllRows] = useState<Doc[]>([]);
  const [area, setArea] = useState("10");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reloadRows = async () => {
    const rows = await adapter.getList("Ngưỡng chọn Motor", { fields: ["name", "rule_code", "item_code", "selection_basis", "max_area_sqm", "max_motor_kg", "includes", "sort_order", "disabled"], orderBy: "sort_order asc", pageLength: 500 }).catch(() => [] as Doc[]);
    setAllRows(rows);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const [loaded, rows] = await Promise.all([
          name ? adapter.getDoc("Ngưỡng chọn Motor", name).then((result) => result.doc as ThresholdDoc) : Promise.resolve(emptyDoc()),
          adapter.getList("Ngưỡng chọn Motor", { fields: ["name", "rule_code", "item_code", "selection_basis", "max_area_sqm", "max_motor_kg", "includes", "sort_order", "disabled"], orderBy: "sort_order asc", pageLength: 500 }).catch(() => [] as Doc[]),
        ]);
        if (!active) return;
        setDoc({ ...emptyDoc(), ...loaded });
        setAllRows(rows);
      } catch (error) { if (active) toast.error(adapter.mapError(error).message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [adapter, name]);

  const basis = text(doc.selection_basis) || "Diện tích cửa";
  const patch = (next: Partial<ThresholdDoc>) => setDoc((current) => ({ ...current, ...next }));
  const enabledRows = useMemo(() => allRows.filter((row) => !yes((row as Json).disabled)), [allRows]);
  const motorRows = useMemo(() => enabledRows.filter((row) => text((row as Json).selection_basis) === "Diện tích cửa"), [enabledRows]);
  const upsRows = useMemo(() => enabledRows.filter((row) => text((row as Json).selection_basis) === "Tải motor"), [enabledRows]);

  const validate = (): string | null => {
    if (!text(doc.rule_code)) return "Cần khai Mã luật.";
    if (!text(doc.item_code)) return "Cần chọn Mã Item motor / UPS.";
    if (!['Diện tích cửa', 'Tải motor'].includes(basis)) return "Cơ sở chọn không hợp lệ.";
    if (basis === "Diện tích cửa" && positive(doc.max_area_sqm) === undefined) return "Dòng motor phải có ngưỡng diện tích dương.";
    if (basis === "Tải motor" && positive(doc.max_motor_kg) === undefined) return "Dòng UPS phải có ngưỡng tải motor dương.";
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      const payload: ThresholdDoc = {
        ...doc,
        rule_code: text(doc.rule_code), item_code: text(doc.item_code), selection_basis: basis,
        max_area_sqm: basis === "Diện tích cửa" ? positive(doc.max_area_sqm) : "",
        max_motor_kg: basis === "Tải motor" ? positive(doc.max_motor_kg) : "",
        sort_order: finite(doc.sort_order) ?? 0,
      };
      const saved = name ? await adapter.updateDoc("Ngưỡng chọn Motor", name, payload, text(doc.modified)) : await adapter.createDoc("Ngưỡng chọn Motor", payload);
      const savedName = text((saved as Json).name) || name || text(payload.rule_code);
      toast.success("Đã lưu ngưỡng Motor / UPS.");
      await reloadRows();
      if (savedName) onSaved?.(savedName);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  };

  const currentPath = name ? `${listPath}/${encodeURIComponent(name)}` : `${listPath}/new`;
  const openGeneric = () => onNavigate(`${currentPath}?master_ui=generic`);
  const openRow = (row: Doc) => onNavigate(`${listPath}/${encodeURIComponent(text(row.name))}`);
  const openItem = () => onNavigate(text(doc.item_code) ? `${base}/${encodeURIComponent("Item")}/${encodeURIComponent(text(doc.item_code))}` : `${base}/${encodeURIComponent("Item")}`);

  if (loading) return <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Đang tải bảng ngưỡng…</div>;

  return <div className="flex h-full min-h-0 flex-col bg-background" data-surface="alumdoor-motor-ups-master-workbench">
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="size-4" /></Button><div><div className="flex items-center gap-2"><Cog className="size-5 text-primary" /><h2 className="text-lg font-semibold">Ngưỡng Motor / UPS{name ? ` · ${name}` : " · Mới"}</h2></div><p className="mt-1 text-sm text-muted-foreground">Hai luật tách biệt: Motor chọn theo diện tích cửa; UPS chọn theo tải của motor vừa chọn. Mọi cận trên đều là cận MỞ (`giá trị &lt; ngưỡng`).</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={openGeneric}>Form đầy đủ</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button></div></div></header>
    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"><div className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 font-medium">Một dòng ngưỡng</h3><div className="grid gap-3 md:grid-cols-4"><Field label="Mã luật"><input className={fieldClass} value={text(doc.rule_code)} onChange={(e) => patch({ rule_code: e.target.value.toUpperCase() })} placeholder={basis === "Diện tích cửa" ? "MOTO-JG-800" : "PIN-E1000"} /></Field><Field label="Motor / UPS" className="md:col-span-2"><div className="flex gap-2"><input className={fieldClass} value={text(doc.item_code)} onChange={(e) => patch({ item_code: e.target.value.toUpperCase() })} placeholder="Mã Item thật trong danh mục" /><Button variant="outline" onClick={openItem}><ExternalLink className="size-4" /></Button></div></Field><label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={yes(doc.disabled)} onChange={(e) => patch({ disabled: e.target.checked ? 1 : 0 })} /> Ngừng dùng</label><Field label="Chọn theo"><select className={fieldClass} value={basis} onChange={(e) => patch({ selection_basis: e.target.value, max_area_sqm: "", max_motor_kg: "" })}><option>Diện tích cửa</option><option>Tải motor</option></select></Field>{basis === "Diện tích cửa" ? <Field label="Cửa nhỏ hơn (m²)" hint="Ví dụ 15 nghĩa là 14,99 dùng được; đúng 15 thì phải lên bậc tiếp."><input className={fieldClass} type="number" min="0" step="0.01" value={text(doc.max_area_sqm)} onChange={(e) => patch({ max_area_sqm: e.target.value })} /></Field> : <Field label="Motor nhỏ hơn (kg)" hint="UPS chọn theo TẢI MOTOR, không theo diện tích cửa."><input className={fieldClass} type="number" min="0" step="1" value={text(doc.max_motor_kg)} onChange={(e) => patch({ max_motor_kg: e.target.value })} /></Field>}<Field label="Thứ tự"><input className={fieldClass} type="number" step="10" value={text(doc.sort_order)} onChange={(e) => patch({ sort_order: e.target.value })} /></Field><Field label="Gồm / cấu hình" className="md:col-span-2"><input className={fieldClass} value={text(doc.includes)} onChange={(e) => patch({ includes: e.target.value })} placeholder="VD: 9 AH / bộ điều khiển..." /></Field><Field label="Nguồn" className="md:col-span-2"><textarea className={textAreaClass} value={text(doc.nguon)} onChange={(e) => patch({ nguon: e.target.value })} /></Field></div></section>
      <section className="rounded-xl border bg-card"><div className="border-b px-4 py-3"><h3 className="font-medium">Bảng đang có · {motorRows.length} Motor + {upsRows.length} UPS</h3><p className="text-xs text-muted-foreground">Đọc cùng một bảng để thấy ngay khoảng trống hoặc thứ tự ngưỡng; bấm một dòng để mở sửa.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Loại</th><th className="p-3">Mã luật</th><th className="p-3">Item</th><th className="p-3">Ngưỡng mở</th><th className="p-3">Gồm</th><th className="p-3 w-24">Thứ tự</th></tr></thead><tbody>{enabledRows.map((row) => { const data = row as Json; const rowBasis = text(data.selection_basis); return <tr key={text(row.name)} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => openRow(row)}><td className="p-3">{rowBasis === "Diện tích cửa" ? <Badge variant="outline" className="gap-1"><Cog className="size-3" /> Motor</Badge> : <Badge variant="outline" className="gap-1"><BatteryCharging className="size-3" /> UPS</Badge>}</td><td className="p-3 font-mono text-xs">{text(data.rule_code)}</td><td className="p-3 font-mono text-xs">{text(data.item_code)}</td><td className="p-3 font-medium tabular-nums">{rowBasis === "Diện tích cửa" ? `< ${text(data.max_area_sqm)} m²` : `< ${text(data.max_motor_kg)} kg`}</td><td className="p-3 text-muted-foreground">{text(data.includes) || "—"}</td><td className="p-3 tabular-nums">{text(data.sort_order) || "0"}</td></tr>; })}</tbody></table></div></section>
      <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><Field label="Thử diện tích cửa (m²)" className="w-64"><input className={fieldClass} type="number" min="0" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} /></Field><div className="text-xs text-muted-foreground">Panel dưới gọi trực tiếp `alumdoor.motor.suggest`; không có bảng/không phủ ngưỡng thì server trả thiếu, client không đoán.</div></div><AlumdoorMotorSuggestPanel areaSqm={positive(area) ?? null} /></section>
    </div></main>
  </div>;
}
