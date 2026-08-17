import type { JsonObject } from "../../contracts/src/index.js";
import { requireLeafWarehouse } from "../../clouderp-stock/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { StockReservationController } from "./alumdoor-inventory.js";
import { assertCancellationReason } from "./alumdoor-reason-masters.js";
import { withReservationLifecycleReader } from "./reservation-lifecycle-reader.js";

type ReservationContext = Parameters<StockReservationController["normalize"]>[0];
type ReservationData = Awaited<ReturnType<StockReservationController["normalize"]>>;

const FROZEN_IDENTITY_FIELDS = [
  "item_code",
  "color",
  "condition",
  "warehouse",
  "source_doctype",
  "source_name",
  "reserved_at",
] as const;

const TERMINAL_RESERVATION_STATES = new Set(["Đã dùng", "Đã nhả", "Hết hạn"]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}
function stateOf(value: unknown): string { return text(value) || "Đang giữ"; }
function decimalInput(value: unknown, field: string): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  throw errors.validation(`${field} là bắt buộc và phải là số`);
}
function timestamp(value: unknown, field: string): number | null {
  const raw = text(value); if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} không phải thời điểm hợp lệ`);
  return parsed;
}
function assertReservationOpen(previous: ReservationData): void {
  if (TERMINAL_RESERVATION_STATES.has(stateOf(previous.state))) throw errors.lifecycle("Phiếu giữ chỗ đã kết thúc và không thể sửa");
}
function assertReservationIdentityImmutable(current: ReservationData, previous: ReservationData): void {
  for (const field of FROZEN_IDENTITY_FIELDS) {
    if (text(current[field]) !== text(previous[field])) throw errors.validation(`Giữ chỗ đã tạo: không được đổi ${field}; hãy nhả phiếu cũ và tạo giữ chỗ mới để giữ audit`);
  }
  if (toScaledInt(current.min_length_m, 6, "min_length_m") !== toScaledInt(previous.min_length_m, 6, "min_length_m")) {
    throw errors.validation("Giữ chỗ đã tạo: không được đổi min_length_m; hãy nhả phiếu cũ và tạo giữ chỗ mới để giữ audit");
  }
}
function assertActiveReservationNotZombie(context: ReservationContext, previous: ReservationData, desiredState: string): void {
  if (stateOf(previous.state) !== "Đang giữ") return;
  const expiresAt = timestamp(previous.expires_at, "expires_at");
  const now = timestamp(context.now, "now");
  if (expiresAt != null && now != null && expiresAt <= now && desiredState !== "Hết hạn") throw errors.lifecycle("Giữ chỗ đã quá hạn; phải chuyển Hết hạn trước khi sửa, không được hồi sinh âm thầm");
}
interface PartialReleaseSnapshot { releasedMicros: number; releasedReason: string; }
function partialReleaseSnapshot(current: ReservationData, previous: ReservationData, desiredState: string): PartialReleaseSnapshot | null {
  if (desiredState !== "Đang giữ") return null;
  const before = toScaledInt(previous.qty_reserved, 6, "qty_reserved");
  const after = toScaledInt(current.qty_reserved, 6, "qty_reserved");
  if (after >= before) return null;
  return { releasedMicros: before - after, releasedReason: text(current.partial_release_reason ?? current.released_reason) || "Điều chỉnh giảm giữ chỗ" };
}
function assertConsumptionIsNotClientDeclared(desiredState: string): void {
  if (desiredState === "Đã dùng") throw errors.lifecycle("Trạng thái Đã dùng do chứng từ tiêu thụ/cắt xác nhận; không được chuyển tay trên phiếu giữ chỗ");
}
async function assertReservationSourceOpen(context: ReservationContext, input: ReservationData): Promise<void> {
  if (!input.source_doctype || !input.source_name) return;
  const source = await context.reader.getDocument<JsonObject>(context.command.tenant_id, input.source_doctype, input.source_name);
  if (source?.docstatus === 2) throw errors.lifecycle(`${input.source_doctype} ${input.source_name} đã huỷ; không thể tạo hoặc sửa giữ chỗ`);
}
async function assertReservationWarehouseScope(context: ReservationContext, input: ReservationData): Promise<void> {
  if (!input.warehouse) return;
  const source = input.source_doctype && input.source_name ? await context.reader.getDocument<JsonObject>(context.command.tenant_id, input.source_doctype, input.source_name) : null;
  const sourceCompany = text(source?.data.company);
  await requireLeafWarehouse(context as unknown as ControllerContext<JsonObject>, input.warehouse, sourceCompany || undefined);
}
function reservationsCompete(request: ReservationData, other: ReservationData): boolean {
  if (other.item_code !== request.item_code) return false;
  if (request.color && other.color && other.color !== request.color) return false;
  if (request.condition && other.condition && other.condition !== request.condition) return false;
  if (request.warehouse && other.warehouse && other.warehouse !== request.warehouse) return false;
  return true;
}
export async function assertReservationFeasibleAcrossThresholds(context: ReservationContext, request: ReservationData, excludeName: string): Promise<void> {
  if (stateOf(request.state) !== "Đang giữ") return;
  const requestThreshold = toScaledInt(request.min_length_m, 6, "min_length_m");
  const requestQty = toScaledInt(request.qty_reserved, 6, "qty_reserved");
  const positions = await context.reader.listTrackedStockPositions(context.command.tenant_id, request.item_code);
  const eligible: Array<{ qtyMicros: number; lengthMicros: number }> = [];
  for (const position of positions) {
    if (position.qty_micros <= 0 || (request.warehouse && position.warehouse !== request.warehouse)) continue;
    const batch = await context.reader.getMasterRecordData(context.command.tenant_id, "Batch", position.batch_no);
    if (!batch || (batch.item_code && batch.item_code !== request.item_code)) continue;
    if (request.color && batch.color !== request.color) continue;
    if (request.condition && batch.condition !== request.condition) continue;
    const warehouse = await context.reader.getMasterRecordData(context.command.tenant_id, "Warehouse", position.warehouse);
    if (warehouse?.stock_role !== "Kho chính") continue;
    eligible.push({ qtyMicros: position.qty_micros, lengthMicros: toScaledInt(decimalInput(batch.length_m, `Batch ${position.batch_no}.length_m`), 6, `Batch ${position.batch_no}.length_m`) });
  }
  const documents = await context.reader.listDocumentsByDoctype<ReservationData>(context.command.tenant_id, "Stock Reservation");
  const active = documents.filter((document) => document.name !== excludeName && stateOf(document.data.state) === "Đang giữ" && (!document.data.expires_at || document.data.expires_at > context.now) && reservationsCompete(request, document.data));
  const thresholds = new Set<number>([requestThreshold]);
  for (const document of active) thresholds.add(toScaledInt(document.data.min_length_m, 6, "min_length_m"));
  for (const threshold of [...thresholds].sort((a,b)=>a-b)) {
    const stockMicros = eligible.filter((p)=>p.lengthMicros>=threshold).reduce((t,p)=>t+p.qtyMicros,0);
    const alreadyReservedMicros = active.filter((d)=>toScaledInt(d.data.min_length_m,6,"min_length_m")>=threshold).reduce((t,d)=>t+toScaledInt(d.data.qty_reserved,6,"qty_reserved"),0);
    const newDemandMicros = requestThreshold >= threshold ? requestQty : 0;
    const demandMicros = alreadyReservedMicros + newDemandMicros;
    if (demandMicros > stockMicros) throw errors.reference(`Không đủ tồn khả dụng theo cơ cấu khổ: tại ngưỡng ≥ ${fromScaledInt(threshold, 6)} m chỉ có ${fromScaledInt(stockMicros, 6)} lá nhưng tổng giữ sẽ là ${fromScaledInt(demandMicros, 6)} lá`, { min_length_micros: threshold, stock_qty_micros: stockMicros, existing_reserved_qty_micros: alreadyReservedMicros, requested_qty_micros: newDemandMicros, resulting_reserved_qty_micros: demandMicros });
  }
}

export class StockReservationIntegrityController extends StockReservationController {
  override async normalize(context: ReservationContext): Promise<ReservationData> {
    const effectiveContext = withReservationLifecycleReader(context);
    const input = effectiveContext.command.document;
    const previous = effectiveContext.existing?.data;
    const desiredState = stateOf(input.state ?? previous?.state);
    await assertReservationSourceOpen(effectiveContext, input);
    await assertReservationWarehouseScope(effectiveContext, input);
    if (!previous) {
      if (desiredState !== "Đang giữ") throw errors.lifecycle("Giữ chỗ mới phải bắt đầu ở trạng thái Đang giữ");
      const normalized = await super.normalize(effectiveContext);
      const qtyMicros = toScaledInt(normalized.qty_reserved, 6, "qty_reserved");
      const withSnapshot = { ...normalized, initial_qty_reserved: fromScaledInt(qtyMicros, 6), initial_qty_reserved_micros: qtyMicros, cumulative_released_qty: "0.000000", cumulative_released_qty_micros: 0 } as ReservationData;
      await assertReservationFeasibleAcrossThresholds(effectiveContext, withSnapshot, effectiveContext.command.aggregate.name);
      return withSnapshot;
    }
    assertReservationOpen(previous);
    assertReservationIdentityImmutable(input, previous);
    assertActiveReservationNotZombie(effectiveContext, previous, desiredState);
    assertConsumptionIsNotClientDeclared(desiredState);
    const partialRelease = partialReleaseSnapshot(input, previous, desiredState);
    const normalized = await super.normalize(effectiveContext);
    if (stateOf(normalized.state) === "Đã nhả") {
      await assertCancellationReason(
        effectiveContext as unknown as ControllerContext<JsonObject>,
        normalized.released_reason,
        "Phiếu kho",
      );
    }
    const initialMicros = typeof previous.initial_qty_reserved_micros === "number" ? previous.initial_qty_reserved_micros : toScaledInt(decimalInput(previous.initial_qty_reserved ?? previous.qty_reserved, "initial_qty_reserved"), 6, "initial_qty_reserved");
    const priorReleasedMicros = typeof previous.cumulative_released_qty_micros === "number" ? previous.cumulative_released_qty_micros : 0;
    const cumulativeReleasedMicros = priorReleasedMicros + (partialRelease?.releasedMicros ?? 0);
    const withSnapshot = { ...normalized, initial_qty_reserved: fromScaledInt(initialMicros, 6), initial_qty_reserved_micros: initialMicros, cumulative_released_qty: fromScaledInt(cumulativeReleasedMicros, 6), cumulative_released_qty_micros: cumulativeReleasedMicros, ...(partialRelease ? { partial_release_reason: partialRelease.releasedReason, last_partial_release_qty: fromScaledInt(partialRelease.releasedMicros, 6), last_partial_release_qty_micros: partialRelease.releasedMicros, last_partial_released_at: effectiveContext.now, last_partial_released_by: effectiveContext.command.actor.user_id } : {}) } as ReservationData;
    await assertReservationFeasibleAcrossThresholds(effectiveContext, withSnapshot, effectiveContext.command.aggregate.name);
    return withSnapshot;
  }
}
