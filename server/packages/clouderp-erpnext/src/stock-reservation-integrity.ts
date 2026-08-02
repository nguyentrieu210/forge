import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import { StockReservationController } from "./alumdoor-inventory.js";

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

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function stateOf(value: unknown): string {
  return text(value) || "Đang giữ";
}

function timestamp(value: unknown, field: string): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} không phải thời điểm hợp lệ`);
  return parsed;
}

function assertReservationIdentityImmutable(current: ReservationData, previous: ReservationData): void {
  for (const field of FROZEN_IDENTITY_FIELDS) {
    if (text(current[field]) !== text(previous[field])) {
      throw errors.validation(`Giữ chỗ đã tạo: không được đổi ${field}; hãy nhả phiếu cũ và tạo giữ chỗ mới để giữ audit`);
    }
  }

  const currentLength = toScaledInt(current.min_length_m, 6, "min_length_m");
  const previousLength = toScaledInt(previous.min_length_m, 6, "min_length_m");
  if (currentLength !== previousLength) {
    throw errors.validation("Giữ chỗ đã tạo: không được đổi min_length_m; hãy nhả phiếu cũ và tạo giữ chỗ mới để giữ audit");
  }
}

function assertActiveReservationNotZombie(context: ReservationContext, previous: ReservationData, desiredState: string): void {
  if (stateOf(previous.state) !== "Đang giữ") return;
  const expiresAt = timestamp(previous.expires_at, "expires_at");
  const now = timestamp(context.now, "now");
  if (expiresAt != null && now != null && expiresAt <= now && desiredState !== "Hết hạn") {
    throw errors.lifecycle("Giữ chỗ đã quá hạn; phải chuyển Hết hạn trước khi sửa, không được hồi sinh âm thầm");
  }
}

/**
 * Hardens the reservation lifecycle without creating another stock ledger.
 *
 * Reservation identity is the promise key described by the Alumdoor BRD:
 * item/color/condition/min-length/(optional warehouse) plus its source document.
 * Once created, changing that key would silently move an existing promise to a
 * different stock pool/source while preserving the same audit record. Corrections
 * therefore release the old reservation and create a new one.
 */
export class StockReservationIntegrityController extends StockReservationController {
  override async normalize(context: ReservationContext): Promise<ReservationData> {
    const input = context.command.document;
    const previous = context.existing?.data;
    const desiredState = stateOf(input.state ?? previous?.state);

    if (!previous) {
      if (desiredState !== "Đang giữ") {
        throw errors.lifecycle("Giữ chỗ mới phải bắt đầu ở trạng thái Đang giữ");
      }
      return super.normalize(context);
    }

    assertReservationIdentityImmutable(input, previous);
    assertActiveReservationNotZombie(context, previous, desiredState);
    return super.normalize(context);
  }
}
