import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Calculator, FileLock2, Loader2, RefreshCw, Settings2, ShieldAlert } from "lucide-react";
import { mapError } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import {
  Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, toast,
} from "@metaforge/ui";

interface MaterialRow {
  bom_row_id: string;
  item_code: string;
  standard_qty_for_completed_micros: number;
  actual_consumed_qty_micros: number;
  scrap_qty_micros: number;
  offcut_qty_micros: number;
  standard_cost_for_completed_minor: number;
  actual_net_material_cost_minor: number;
  variance_minor: number;
}

interface OperationRow {
  job_card: string;
  operation: string;
  workstation: string;
  employee: string;
  hours_micros: number;
  rate_id: string;
  labor_cost_minor: number;
  machine_cost_minor: number;
  electricity_cost_minor: number;
  consumable_cost_minor: number;
  overhead_cost_minor: number;
  total_cost_minor: number;
  missing_rate: boolean;
}

interface CostAdjustment {
  adjustment_id: string;
  category: string;
  delta_amount_minor: number;
  reason: string;
  actor_user_id: string;
  created_at: string;
}

interface CostSheet {
  snapshot_id?: string;
  work_order: string;
  company: string;
  production_item: string;
  bom_no: string;
  bom_checksum: string;
  currency: string;
  currency_scale: number;
  target_qty_micros: number;
  produced_qty_micros: number;
  completion_micros: number;
  standard_cost_source: "WORK_ORDER_SNAPSHOT" | "LEGACY_BOM_FALLBACK";
  legacy_standard_warning: boolean;
  ready_to_finalize: boolean;
  missing_rate_job_cards: string[];
  standard_material_cost_for_completed_minor: number;
  standard_operating_cost_for_completed_minor: number;
  standard_total_cost_for_completed_minor: number;
  actual_material_cost_to_date_minor: number;
  actual_operation_cost_to_date_minor: number;
  actual_total_cost_to_date_minor: number;
  actual_cost_allocated_to_finished_minor: number;
  estimated_wip_cost_minor: number;
  finished_stock_value_minor: number;
  valuation_adjustment_to_actual_minor: number;
  material_variance_minor: number;
  operation_variance_minor: number;
  total_variance_minor: number;
  actual_unit_cost_minor: number;
  source_fingerprint: string;
  material_rows: MaterialRow[];
  operation_rows: OperationRow[];
  frozen?: boolean;
  frozen_by?: string;
  frozen_at?: string;
  freeze_reason?: string;
  adjustments?: CostAdjustment[];
  adjustment_total_minor?: number;
  adjusted_actual_total_cost_minor?: number;
  adjusted_total_variance_minor?: number;
  adjusted_actual_unit_cost_minor?: number;
}

interface SnapshotResult {
  snapshot_id: string;
  work_order: string;
  source_fingerprint: string;
  existing: boolean;
  frozen: boolean;
}

const ADJUSTMENT_CATEGORIES = [
  ["Material", "Vật tư"],
  ["Labor", "Nhân công"],
  ["Machine", "Máy"],
  ["Energy", "Điện / năng lượng"],
  ["Consumable", "Vật tư phụ"],
  ["Overhead", "Chi phí chung"],
  ["Other", "Khác"],
] as const;

function quantity(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value / 1_000_000);
}

function percent(value: number): string {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 10_000)}%`;
}

function moneyMinor(value: number | undefined, currency: string, scale: number): string {
  const amount = (value ?? 0) / (10 ** scale);
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: currency || "VND",
      maximumFractionDigits: scale,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: scale }).format(amount);
  }
}

function varianceClass(value: number): string {
  return value > 0 ? "text-destructive" : value < 0 ? "text-emerald-700" : "text-muted-foreground";
}

export function ManufacturingCosting() {
  const { adapter } = useMetaForge();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState("");
  const [sheet, setSheet] = useState<CostSheet | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [adjustCategory, setAdjustCategory] = useState("Overhead");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const run = useCallback(async (operation: string, task: () => Promise<void>) => {
    setBusy(operation);
    setError(null);
    try {
      await task();
    } catch (caught) {
      const message = mapError(caught).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }, []);

  const requireWorkOrder = () => {
    const value = workOrder.trim();
    if (!value) throw new Error("Nhập Lệnh sản xuất cần tính giá thành.");
    return value;
  };

  const loadSnapshot = useCallback(async (snapshotId: string) => {
    const value = await adapter.callPost<CostSheet>("metaforge.manufacturing.cost_sheet", { snapshot_id: snapshotId });
    setSheet(value);
  }, [adapter]);

  const preview = () => void run("preview", async () => {
    const value = await adapter.callPost<CostSheet>("metaforge.manufacturing.cost_preview", { work_order: requireWorkOrder() });
    setSheet(value);
    toast.success("Đã tính lại giá thành từ chứng từ nguồn hiện tại.");
  });

  const generate = () => void run("generate", async () => {
    const result = await adapter.callPost<SnapshotResult>("metaforge.manufacturing.cost_generate", { work_order: requireWorkOrder() });
    await loadSnapshot(result.snapshot_id);
    toast.success(result.existing ? "Đã mở Cost Sheet bất biến hiện có." : "Đã tạo Cost Sheet bất biến.");
  });

  const freeze = () => void run("freeze", async () => {
    if (!sheet?.snapshot_id) throw new Error("Tạo Cost Sheet bất biến trước khi khóa giá thành.");
    await adapter.callPost("metaforge.manufacturing.cost_freeze", {
      snapshot_id: sheet.snapshot_id,
      reason: freezeReason.trim(),
    });
    await loadSnapshot(sheet.snapshot_id);
    toast.success("Đã khóa giá thành. Mọi bổ sung sau khóa chỉ được ghi bằng điều chỉnh append-only.");
  });

  const adjust = () => void run("adjust", async () => {
    if (!sheet?.snapshot_id || !sheet.frozen) throw new Error("Chỉ điều chỉnh Cost Sheet đã khóa.");
    const amount = Number(adjustAmount);
    if (!Number.isSafeInteger(amount) || amount === 0) throw new Error("Số tiền điều chỉnh phải là số nguyên khác 0 theo đơn vị tiền nhỏ nhất.");
    if (!adjustReason.trim()) throw new Error("Điều chỉnh bắt buộc phải có lý do.");
    await adapter.callPost("metaforge.manufacturing.cost_adjust", {
      adjustment_id: crypto.randomUUID(),
      snapshot_id: sheet.snapshot_id,
      category: adjustCategory,
      delta_amount_minor: amount,
      reason: adjustReason.trim(),
    });
    setAdjustAmount("");
    setAdjustReason("");
    await loadSnapshot(sheet.snapshot_id);
    toast.success("Đã ghi điều chỉnh vào lịch sử giá thành bất biến.");
  });

  return (
    <div className="h-full overflow-auto bg-background p-3 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><Calculator className="size-5 text-primary" /><h1 className="text-xl font-semibold">Giá thành sản xuất</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">Định mức đã chụp trên Work Order + vật tư thực tế từ Stock Ledger + giờ công đoạn từ Job Card.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/app/Manufacturing%20Cost%20Rate")}><Settings2 className="mr-2 size-4" />Đơn giá sản xuất</Button>
            <Button variant="outline" onClick={preview} disabled={Boolean(busy)}>{busy === "preview" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Tính thử</Button>
            <Button onClick={generate} disabled={Boolean(busy)}>{busy === "generate" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileLock2 className="mr-2 size-4" />}Tạo Cost Sheet</Button>
          </div>
        </header>

        <section className="rounded-xl border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(260px,460px)_1fr] md:items-end">
            <Field label="Lệnh sản xuất"><Input value={workOrder} onChange={(event) => setWorkOrder(event.target.value)} placeholder="Ví dụ: LSX-2026-0001" /></Field>
            <p className="text-xs text-muted-foreground">“Tính thử” luôn đọc lại nguồn hiện tại. “Tạo Cost Sheet” chụp fingerprint bất biến để khóa và kiểm toán.</p>
          </div>
        </section>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><ShieldAlert className="mt-0.5 size-4 shrink-0" />{error}</div> : null}

        {sheet ? <>
          <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <Badge variant={sheet.frozen ? "secondary" : "outline"}>{sheet.frozen ? "Đã khóa" : sheet.snapshot_id ? "Đã chụp" : "Tính thử"}</Badge>
            <Badge variant={sheet.ready_to_finalize ? "secondary" : "outline"}>{sheet.ready_to_finalize ? "Đủ điều kiện khóa" : "Chưa đủ điều kiện khóa"}</Badge>
            <span className="text-sm font-medium">{sheet.work_order}</span>
            <span className="text-sm text-muted-foreground">{sheet.production_item} · BOM {sheet.bom_no}</span>
            <span className="ml-auto text-xs text-muted-foreground">Hoàn thành {percent(sheet.completion_micros)}</span>
          </section>

          {sheet.legacy_standard_warning ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Work Order cũ chưa chụp định mức tiền tại thời điểm phát hành. Hệ thống đang dùng BOM fallback có gắn cờ; không giả đây là định mức lịch sử.</div> : null}
          {sheet.missing_rate_job_cards.length ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Thiếu đơn giá hiệu lực cho Job Card: {sheet.missing_rate_job_cards.join(", ")}. Cost Sheet chưa được phép khóa.</div> : null}

          <Summary sheet={sheet} />
          <MaterialTable sheet={sheet} />
          <OperationTable sheet={sheet} />

          {sheet.snapshot_id ? <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Khóa giá thành</h2><Badge variant={sheet.frozen ? "secondary" : "outline"}>{sheet.frozen ? "Đã khóa" : "Chưa khóa"}</Badge></div>
              <p className="mt-1 text-xs text-muted-foreground">Snapshot: {sheet.snapshot_id}</p>
              <Textarea className="mt-3" value={freezeReason} onChange={(event) => setFreezeReason(event.target.value)} placeholder="Lý do khóa" disabled={sheet.frozen} />
              <Button className="mt-3" variant="outline" onClick={freeze} disabled={Boolean(busy) || Boolean(sheet.frozen) || !sheet.ready_to_finalize}><FileLock2 className="mr-2 size-4" />Khóa giá thành</Button>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <h2 className="font-semibold">Điều chỉnh sau khóa</h2>
              <p className="mt-1 text-xs text-muted-foreground">Ví dụ hóa đơn điện về muộn. Snapshot gốc không bị sửa.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Nhóm chi phí">
                  <Select value={adjustCategory} onValueChange={setAdjustCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ADJUSTMENT_CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label={`Số tiền (${sheet.currency}, minor)`}><Input type="number" step="1" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} /></Field>
              </div>
              <Textarea className="mt-3" value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Lý do điều chỉnh (bắt buộc)" />
              <Button className="mt-3" onClick={adjust} disabled={Boolean(busy) || !sheet.frozen}>Ghi điều chỉnh</Button>
            </div>
          </section> : null}
        </> : <div className="rounded-xl border border-dashed bg-card p-10 text-center"><Calculator className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 font-medium">Chọn một Lệnh sản xuất</h2><p className="mt-1 text-sm text-muted-foreground">Tính thử để xem giá thành sống, hoặc tạo Cost Sheet để khóa số liệu.</p></div>}
      </div>
    </div>
  );
}

function Summary({ sheet }: { sheet: CostSheet }) {
  const actualTotal = sheet.adjusted_actual_total_cost_minor ?? sheet.actual_total_cost_to_date_minor;
  const totalVariance = sheet.adjusted_total_variance_minor ?? sheet.total_variance_minor;
  const unitCost = sheet.adjusted_actual_unit_cost_minor ?? sheet.actual_unit_cost_minor;
  const cards = [
    ["Định mức phần hoàn thành", sheet.standard_total_cost_for_completed_minor],
    ["Thực tế đến hiện tại", actualTotal],
    ["Phân bổ vào thành phẩm", sheet.actual_cost_allocated_to_finished_minor],
    ["WIP ước tính", sheet.estimated_wip_cost_minor],
    ["Giá trị thành phẩm đã ghi kho", sheet.finished_stock_value_minor],
    ["Chênh cần tái định giá", sheet.valuation_adjustment_to_actual_minor],
    ["Chênh lệch tổng", totalVariance],
    ["Giá thành thực tế / đơn vị", unitCost],
  ] as const;
  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${label.includes("Chênh") ? varianceClass(value) : ""}`}>{moneyMinor(value, sheet.currency, sheet.currency_scale)}</p></div>)}</section>;
}

function MaterialTable({ sheet }: { sheet: CostSheet }) {
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="border-b px-4 py-3"><h2 className="font-semibold">Vật tư</h2><p className="text-xs text-muted-foreground">Giá trị thực lấy từ Stock Ledger; đầu thừa/phế thu hồi được trừ khỏi giá thành vật tư.</p></div>
    <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Vật tư</TableHead><TableHead className="text-right">ĐM SL</TableHead><TableHead className="text-right">Thực dùng</TableHead><TableHead className="text-right">Phế</TableHead><TableHead className="text-right">Đầu thừa</TableHead><TableHead className="text-right">ĐM tiền</TableHead><TableHead className="text-right">Thực tế</TableHead><TableHead className="text-right">Chênh</TableHead></TableRow></TableHeader><TableBody>{sheet.material_rows.map((row) => <TableRow key={row.bom_row_id}><TableCell><div className="font-medium">{row.item_code}</div><div className="text-xs text-muted-foreground">{row.bom_row_id}</div></TableCell><TableCell className="text-right tabular-nums">{quantity(row.standard_qty_for_completed_micros)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.actual_consumed_qty_micros)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.scrap_qty_micros)}</TableCell><TableCell className="text-right tabular-nums">{quantity(row.offcut_qty_micros)}</TableCell><TableCell className="text-right tabular-nums">{moneyMinor(row.standard_cost_for_completed_minor, sheet.currency, sheet.currency_scale)}</TableCell><TableCell className="text-right tabular-nums">{moneyMinor(row.actual_net_material_cost_minor, sheet.currency, sheet.currency_scale)}</TableCell><TableCell className={`text-right tabular-nums ${varianceClass(row.variance_minor)}`}>{moneyMinor(row.variance_minor, sheet.currency, sheet.currency_scale)}</TableCell></TableRow>)}</TableBody></Table></div>
  </section>;
}

function OperationTable({ sheet }: { sheet: CostSheet }) {
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="border-b px-4 py-3"><h2 className="font-semibold">Công đoạn thực tế</h2><p className="text-xs text-muted-foreground">Giờ Job Card × đơn giá hiệu lực, tách nhân công, máy, điện, vật tư phụ và chi phí chung.</p></div>
    <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Job Card</TableHead><TableHead>Công đoạn / trạm</TableHead><TableHead className="text-right">Giờ</TableHead><TableHead className="text-right">Nhân công</TableHead><TableHead className="text-right">Máy</TableHead><TableHead className="text-right">Điện</TableHead><TableHead className="text-right">VT phụ</TableHead><TableHead className="text-right">CP chung</TableHead><TableHead className="text-right">Tổng</TableHead></TableRow></TableHeader><TableBody>{sheet.operation_rows.length ? sheet.operation_rows.map((row) => <TableRow key={row.job_card}><TableCell><div className="font-medium">{row.job_card}</div><div className="text-xs text-muted-foreground">{row.employee || "—"}</div></TableCell><TableCell><div>{row.operation}</div><div className="text-xs text-muted-foreground">{row.workstation} · {row.rate_id || "thiếu đơn giá"}</div></TableCell><TableCell className="text-right tabular-nums">{quantity(row.hours_micros)}</TableCell><MoneyCell value={row.labor_cost_minor} sheet={sheet} /><MoneyCell value={row.machine_cost_minor} sheet={sheet} /><MoneyCell value={row.electricity_cost_minor} sheet={sheet} /><MoneyCell value={row.consumable_cost_minor} sheet={sheet} /><MoneyCell value={row.overhead_cost_minor} sheet={sheet} /><MoneyCell value={row.total_cost_minor} sheet={sheet} /></TableRow>) : <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Chưa có Job Card đã ghi thời gian.</TableCell></TableRow>}</TableBody></Table></div>
  </section>;
}

function MoneyCell({ value, sheet }: { value: number; sheet: CostSheet }) {
  return <TableCell className="text-right tabular-nums">{moneyMinor(value, sheet.currency, sheet.currency_scale)}</TableCell>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}