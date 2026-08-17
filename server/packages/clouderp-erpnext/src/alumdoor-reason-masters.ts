import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";

type ReasonContext = ControllerContext<JsonObject>;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

async function activeReason(
  context: ReasonContext,
  doctype: "Lý do huỷ" | "Nguyên nhân chênh lệch",
  code: unknown,
): Promise<JsonObject> {
  const reasonCode = text(code);
  if (!reasonCode) throw errors.validation(`Phải chọn ${doctype.toLowerCase()}`);
  const reason = await context.reader.getMasterRecordData(
    context.command.tenant_id,
    doctype,
    reasonCode,
  );
  if (!reason) throw errors.reference(`${doctype} ${reasonCode} không tồn tại hoặc đã ngừng dùng`);
  return reason;
}

export async function assertCancellationReason(
  context: ReasonContext,
  code: unknown,
  scope?: "Phiếu nhập" | "Phiếu xuất" | "Phiếu kho" | "Phiếu cắt" | "Kiểm kê",
): Promise<JsonObject> {
  const reason = await activeReason(context, "Lý do huỷ", code);
  const appliesTo = text(reason.applies_to_doctype) || "Tất cả";
  if (scope && appliesTo !== "Tất cả" && appliesTo !== scope) {
    throw errors.validation(`Lý do huỷ ${text(code)} chỉ áp cho ${appliesTo}, không áp cho ${scope}`);
  }
  return reason;
}

function varianceKinds(qty: unknown, weight: unknown): Set<"Thừa" | "Thiếu"> {
  const kinds = new Set<"Thừa" | "Thiếu">();
  for (const value of [qty, weight]) {
    if (typeof value !== "number" || value === 0) continue;
    kinds.add(value > 0 ? "Thừa" : "Thiếu");
  }
  return kinds;
}

export async function assertVarianceReason(
  context: ReasonContext,
  code: unknown,
  varianceQtyMicros: unknown,
  varianceWeightMicros: unknown,
  note?: unknown,
): Promise<JsonObject | null> {
  const kinds = varianceKinds(varianceQtyMicros, varianceWeightMicros);
  if (!kinds.size) return null;

  const reason = await activeReason(context, "Nguyên nhân chênh lệch", code);
  const configured = text(reason.variance_kind) || "Cả hai";
  if (configured !== "Cả hai" && [...kinds].some((kind) => kind !== configured)) {
    throw errors.validation(
      `Nguyên nhân chênh lệch ${text(code)} chỉ áp cho ${configured}, không phù hợp chênh lệch ${[...kinds].join("/")}`,
    );
  }
  const isOther = text(reason.reason_code).toUpperCase() === "KHAC"
    || text(reason.reason_name).toLocaleLowerCase("vi") === "khác";
  if (isOther && !text(note)) {
    throw errors.validation("Chọn nguyên nhân Khác thì phải nhập diễn giải");
  }
  return reason;
}
