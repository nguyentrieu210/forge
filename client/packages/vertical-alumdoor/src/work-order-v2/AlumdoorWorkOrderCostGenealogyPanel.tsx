/** @jsxImportSource react */
/**
 * Panel GIÁ VỐN & TRUY VẾT của phiếu sản xuất.
 *
 * Nối hai route server đã viết xong nhưng trước 21/08/2026 không màn nào gọi tới — cùng một
 * cụm "luật đang ngủ" được hai tài liệu khác nhau chỉ ra:
 *
 *  - `metaforge.manufacturing.get_work_order_cost_evidence` — giá vốn tiêu chuẩn (từ BOM đã ghi
 *    sổ) đối chiếu thực tế (từ Stock Ledger qua genealogy) + biến động. Cùng router với
 *    `get_work_order_lifecycle` (đã có 3 nơi gọi), chỉ khác đúng path — nhưng route giá vốn có
 *    0 nơi gọi (docs/audits/ALUMDOOR-SAN-XUAT-KE-TOAN-DANH-MUC-GAP-20260821.md §S4).
 *  - `metaforge.manufacturing.get_work_order_genealogy` — truy vết lô/mẻ nguyên liệu đã tiêu hao
 *    cho lệnh, route riêng, cũng 0 nơi gọi (docs/audits/ALUMDOOR-SAN-XUAT-SAU-VONG2-20260821.md
 *    §S4).
 *
 * ── Thẩm quyền ────────────────────────────────────────────────────────────────────────────
 * Panel CHỈ đọc. Không con số giá vốn nào được cộng/trừ lại ở đây — mọi field hiện nguyên bản
 * server trả, kể cả khi âm/lệch (đó chính là điều `warnings[]` tồn tại để nói ra).
 *
 * ── Vì sao lệnh chưa ghi sổ không gọi ─────────────────────────────────────────────────────
 * `buildManufacturingCostEvidence` đòi BOM đã ghi sổ khớp checksum trên lệnh; lệnh nháp không
 * có Stock Entry nào để dựng bằng chứng, gọi sớm chỉ tạo ra một thông báo lỗi vô nghĩa. Panel
 * đợi `props.submitted` trước khi gọi cả hai route.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Route, Wallet } from "lucide-react";
import { mapError } from "@metaforge/core";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";
import {
  moneyMinor,
  quantity,
  text,
  type WorkOrderCostEvidence,
  type WorkOrderGenealogy,
  type WorkOrderGenealogyMovement,
} from "./model.js";

export interface AlumdoorWorkOrderCostGenealogyPanelProps {
  workOrder: string;
  /** `docstatus === 1`. Chưa ghi sổ thì cả hai route đều chưa có gì để dựng. */
  submitted: boolean;
}

const MOVEMENT_LABEL: Record<string, string> = {
  "Material Transfer Out": "Chuyển kho ra",
  "WIP Transfer In": "Nhập kho dở dang",
  Consumption: "Tiêu hao",
  "Finished Good": "Thành phẩm nhập kho",
  Scrap: "Phế liệu",
  Offcut: "Đầu thừa",
  Recovery: "Thu hồi",
};

export function AlumdoorWorkOrderCostGenealogyPanel(props: AlumdoorWorkOrderCostGenealogyPanelProps) {
  const { adapter } = useMetaForge();
  const [evidence, setEvidence] = useState<WorkOrderCostEvidence | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [genealogy, setGenealogy] = useState<WorkOrderGenealogy | null>(null);
  const [genealogyError, setGenealogyError] = useState("");
  const [pending, setPending] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    if (!props.workOrder || !props.submitted) return;
    setPending(true);
    const [evidenceResult, genealogyResult] = await Promise.allSettled([
      adapter.callPost<WorkOrderCostEvidence>("metaforge.manufacturing.get_work_order_cost_evidence", {
        work_order: props.workOrder,
      }),
      adapter.callPost<WorkOrderGenealogy>("metaforge.manufacturing.get_work_order_genealogy", {
        work_order: props.workOrder,
      }),
    ]);
    if (evidenceResult.status === "fulfilled") {
      setEvidence(evidenceResult.value);
      setEvidenceError("");
    } else {
      setEvidence(null);
      setEvidenceError(mapError(evidenceResult.reason).message);
    }
    if (genealogyResult.status === "fulfilled") {
      setGenealogy(genealogyResult.value);
      setGenealogyError("");
    } else {
      setGenealogy(null);
      setGenealogyError(mapError(genealogyResult.reason).message);
    }
    setPending(false);
    setLoadedOnce(true);
  }, [adapter, props.submitted, props.workOrder]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workOrder, props.submitted]);

  if (!props.submitted) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        <Wallet className="mx-auto mb-1.5 size-5" />
        Lệnh chưa ghi sổ — chưa có Stock Entry nào để dựng bằng chứng giá vốn hay truy vết lô/mẻ.
        Ghi sổ lệnh rồi quay lại tab này.
      </section>
    );
  }

  const movementRows: Array<{ group: string; rows: WorkOrderGenealogyMovement[] }> = genealogy
    ? [
        { group: "Chuyển kho", rows: genealogy.material_transfers ?? [] },
        { group: "Tiêu hao", rows: genealogy.consumptions ?? [] },
        { group: "Thành phẩm", rows: genealogy.finished_goods ?? [] },
        { group: "Thu hồi / phế liệu", rows: genealogy.recoveries ?? [] },
      ]
    : [];
  const allWarnings = [...(evidence?.warnings ?? []), ...(evidence?.genealogy_warnings ?? []), ...(genealogy?.warnings ?? [])];
  const uniqueWarnings = [...new Set(allWarnings)];

  return (
    <div className="space-y-3" data-section="work-order-v2-cost-genealogy">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Giá vốn: <code className="font-mono">get_work_order_cost_evidence</code>. Truy vết lô/mẻ:{" "}
          <code className="font-mono">get_work_order_genealogy</code>. Cả hai đọc thẳng Stock Ledger đã ghi sổ,
          không dựng số nào ở màn.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void load()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Làm mới
        </Button>
      </div>

      {uniqueWarnings.length ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5" /> Cảnh báo bằng chứng giá vốn / truy vết
          </div>
          <ul className="mt-1 space-y-0.5 font-mono">
            {uniqueWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      {/* ── Giá vốn ──────────────────────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Wallet className="size-4 text-primary" />
          <h3 className="font-medium">Giá vốn — chuẩn vs thực tế</h3>
        </div>
        {evidenceError ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
            {evidenceError}
          </div>
        ) : null}
        {!evidence && !evidenceError && loadedOnce ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu.</div>
        ) : null}
        {evidence ? (
          <div className="space-y-3 px-4 py-3">
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <div>Sản lượng đã nhập kho: <span className="font-medium text-foreground">{quantity(numberOr(evidence.produced_qty))} / {quantity(numberOr(evidence.target_qty))}</span> ({numberOr(evidence.completion_pct) !== undefined ? `${Math.round(Number(evidence.completion_pct) * 100) / 100}%` : "—"})</div>
              <div>BOM: <span className="font-mono text-foreground">{text(evidence.bom_no)}</span> rev {evidence.bom_revision ?? "—"}</div>
              <div>Nguồn chi phí gia công thực tế: <span className="font-medium text-foreground">{evidence.actual_operation_cost_source === "IMPLIED_FROM_CANONICAL_FG_VALUATION" ? "Suy từ giá trị nhập kho thành phẩm" : "Chưa có (chưa nhập kho)"}</span></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <CostCard
                title="Tiêu chuẩn (từ BOM)"
                rows={[
                  ["Vật tư", moneyMinor(evidence.standard_material_cost_minor, evidence.currency_scale)],
                  ["Gia công", moneyMinor(evidence.standard_operating_cost_minor, evidence.currency_scale)],
                  ["Tổng", moneyMinor(evidence.standard_total_cost_minor, evidence.currency_scale)],
                ]}
              />
              <CostCard
                title="Thực tế (từ Stock Ledger)"
                rows={[
                  ["Tiêu hao vật tư", moneyMinor(evidence.actual_consumption_value_minor, evidence.currency_scale)],
                  ["Thu hồi (giảm trừ)", moneyMinor(evidence.actual_recovery_value_minor, evidence.currency_scale)],
                  ["Vật tư ròng", moneyMinor(evidence.actual_net_material_cost_minor, evidence.currency_scale)],
                  ["Gia công (suy ra)", moneyMinor(evidence.implied_operating_cost_minor, evidence.currency_scale)],
                  ["Giá trị thành phẩm nhập kho", moneyMinor(evidence.actual_finished_good_value_minor, evidence.currency_scale)],
                ]}
              />
              <CostCard
                title="Biến động (thực tế − tiêu chuẩn)"
                rows={[
                  ["Vật tư", moneyMinor(evidence.material_variance_minor, evidence.currency_scale)],
                  ["Gia công", moneyMinor(evidence.operation_variance_minor, evidence.currency_scale)],
                  ["Tổng", moneyMinor(evidence.total_variance_minor, evidence.currency_scale)],
                ]}
                tone={numberOr(evidence.total_variance_minor) !== undefined && Number(evidence.total_variance_minor) > 0 ? "danger" : "default"}
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Truy vết lô/mẻ ───────────────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Route className="size-4 text-primary" />
          <h3 className="font-medium">Truy vết lô/mẻ nguyên liệu</h3>
          {genealogy ? (
            <Badge variant="outline" className="ml-auto">
              {genealogy.effective_stock_entry_count ?? 0} phiếu kho đã ghi sổ
            </Badge>
          ) : null}
        </div>
        {genealogyError ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
            {genealogyError}
          </div>
        ) : null}
        {genealogy && (genealogy.cancelled_stock_entries ?? []).length ? (
          <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            {(genealogy.cancelled_stock_entries ?? []).length} phiếu kho đã huỷ không tính vào truy vết:{" "}
            {(genealogy.cancelled_stock_entries ?? []).join(", ")}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhóm</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Mã hàng</TableHead>
                <TableHead>Kho</TableHead>
                <TableHead className="text-right">SL</TableHead>
                <TableHead>Lô / Serial</TableHead>
                <TableHead className="text-right">Giá trị</TableHead>
                <TableHead>Phiếu kho</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movementRows.flatMap(({ group, rows }) => rows.map((row, index) => (
                <TableRow key={`${group}-${row.stock_entry}-${index}`}>
                  <TableCell className="text-xs text-muted-foreground">{group}</TableCell>
                  <TableCell className="text-xs">{MOVEMENT_LABEL[text(row.role)] ?? text(row.role) ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{text(row.item_code)}</TableCell>
                  <TableCell className="text-xs">{text(row.warehouse)}</TableCell>
                  <TableCell className="text-right tabular-nums">{text(row.qty)}</TableCell>
                  <TableCell className="text-xs">{text(row.batch_no) || text(row.serial_no) || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{moneyMinor(row.stock_value_difference_minor, evidence?.currency_scale)}</TableCell>
                  <TableCell className="font-mono text-xs">{text(row.stock_entry)}</TableCell>
                </TableRow>
              )))}
              {genealogy && movementRows.every(({ rows }) => !rows.length) ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-16 text-center text-xs text-muted-foreground">
                    Chưa có chuyển động kho nào gắn với lệnh này.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function CostCard(props: { title: string; rows: Array<[string, string]>; tone?: "default" | "danger" }) {
  return (
    <div className={`rounded-lg border p-3 ${props.tone === "danger" ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{props.title}</div>
      <dl className="space-y-1">
        {props.rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2 text-xs">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function numberOr(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
