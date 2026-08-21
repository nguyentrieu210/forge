/**
 * LỆCH CÂN KHI NHẬP — so kg thực cân với kg lý thuyết (barem), và đối chiếu NGƯỠNG.
 *
 * Không có luật mới nào ở đây. Cả hai công thức đều chép từ server:
 *
 *  - barem  = chiều dài một cây × `Material Specification.theoretical_kg_per_m` × số cây
 *             (`ui-child-preview.ts:629-637`, trường `theoretical_kg`).
 *  - lệch % = (kg thực − barem) × 100 ÷ barem
 *             (`purchase-supplier-dashboard.ts:369` và `:523`).
 *
 * NGƯỠNG thì có HAI cái khác nhau, đừng trộn:
 *
 *  A. Ngưỡng LỆCH CÂN — `Measurement Profile.weight_tolerance_pct` (mặc định 13, xem
 *     `server/apps/tenant-worker/src/index-core-base.ts:851-852` dùng `COALESCE(..., 13)`).
 *     Đây là ngưỡng dùng cho ô "Lệch cân (%)" trên `Purchase Receipt Item`; brief ghi rõ
 *     "Vượt ngưỡng thì cảnh báo, KHÔNG chặn ghi sổ".
 *
 *  B. Ngưỡng GIAO NHẬN theo số cây — `Supplier.receipt_tolerance_pct`, quyết định bởi
 *     `resolveSupplierReceiptTolerance` (`purchase-fifo-receipt.ts:93-107`), có cả đường
 *     mặc định riêng cho một NCC. Client KHÔNG nhân bản nhánh mặc định đó: nếu NCC chưa
 *     khai thì màn nói "server sẽ quyết", và ưu tiên `tolerance_pct` + `tolerance_source`
 *     mà chính preview FIFO trả về.
 */
import { nonNegativeNumber, numberValue, positiveNumber } from "./model.js";

/** `COALESCE(CAST(... AS REAL), 13)` — index-core-base.ts:852. */
export const PLATFORM_DEFAULT_WEIGHT_TOLERANCE_PCT = 13;

export interface WeightVarianceInput {
  /** Kg lý thuyết nếu server đã trả sẵn (`theoretical_kg`). */
  baremKg?: number | undefined;
  /** Nguyên liệu để dựng barem khi server chưa trả: dài × kg/m × số cây. */
  lengthM?: number | undefined;
  bars?: number | undefined;
  kgPerM?: number | undefined;
  actualKg?: number | undefined;
  /** `Measurement Profile.weight_tolerance_pct` đọc từ danh mục. */
  tolerancePct?: number | undefined;
  /** Đã đọc được bộ theo dõi hay chưa. Chưa đọc được thì KHÔNG coi mặc định 13 là sự thật. */
  toleranceKnown?: boolean;
}

export interface WeightVarianceReading {
  baremKg?: number;
  actualKg?: number;
  /** (thực − barem) × 100 ÷ barem. `undefined` nghĩa là chưa đủ dữ liệu để nói gì. */
  variancePct?: number;
  deltaKg?: number;
  tolerancePct: number;
  toleranceSource: "measurement_profile" | "platform_default";
  /** Đủ dữ liệu để kết luận chưa. */
  measurable: boolean;
  overTolerance: boolean;
  /** Vượt ngưỡng thì BẮT chọn `Nguyên nhân chênh lệch`. Cảnh báo, không chặn ghi sổ. */
  reasonRequired: boolean;
  headline: string;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function readWeightVariance(input: WeightVarianceInput): WeightVarianceReading {
  /*
   * KHÔNG dùng `positiveNumber` ở đây: ngưỡng 0% là lời khai HỢP LỆ ("lệch bao nhiêu cũng phải
   * giải trình"), mà server giữ nguyên vì `COALESCE(...,13)` chỉ thay NULL chứ không thay 0.
   * Lọc 0 đi thì màn tự nới ngưỡng lên 13% trong khi sổ vẫn chấm theo 0%.
   */
  const declaredTolerance = nonNegativeNumber(input.tolerancePct);
  const toleranceKnown = Boolean(input.toleranceKnown) && declaredTolerance !== undefined;
  const tolerancePct = toleranceKnown ? declaredTolerance! : PLATFORM_DEFAULT_WEIGHT_TOLERANCE_PCT;
  const toleranceSource: WeightVarianceReading["toleranceSource"] = toleranceKnown
    ? "measurement_profile"
    : "platform_default";

  const barem = positiveNumber(input.baremKg)
    ?? (() => {
      const length = positiveNumber(input.lengthM);
      const bars = positiveNumber(input.bars);
      const kgPerM = positiveNumber(input.kgPerM);
      return length && bars && kgPerM ? length * bars * kgPerM : undefined;
    })();
  const actual = positiveNumber(input.actualKg);

  if (barem === undefined || actual === undefined) {
    return {
      ...(barem !== undefined ? { baremKg: round(barem, 3) } : {}),
      ...(actual !== undefined ? { actualKg: round(actual, 3) } : {}),
      tolerancePct,
      toleranceSource,
      measurable: false,
      overTolerance: false,
      reasonRequired: false,
      headline: barem === undefined
        ? "Chưa có kg lý thuyết (cần Quy cách kỹ thuật có Kg/m, chiều dài cây và số cây) nên chưa đối chiếu được cân."
        : "Chưa nhập kg thực cân nên chưa đối chiếu được.",
    };
  }

  const deltaKg = actual - barem;
  const variancePct = deltaKg * 100 / barem;
  const overTolerance = Math.abs(variancePct) > tolerancePct;
  return {
    baremKg: round(barem, 3),
    actualKg: round(actual, 3),
    deltaKg: round(deltaKg, 3),
    variancePct: round(variancePct, 2),
    tolerancePct,
    toleranceSource,
    measurable: true,
    overTolerance,
    reasonRequired: overTolerance,
    headline: overTolerance
      ? `Lệch cân ${round(variancePct, 2)}% (${round(deltaKg, 3) >= 0 ? "thừa" : "thiếu"} ${Math.abs(round(deltaKg, 3))} kg) vượt ngưỡng ${tolerancePct}% — phải chọn Nguyên nhân chênh lệch. Cảnh báo, không chặn ghi sổ.`
      : `Lệch cân ${round(variancePct, 2)}% trong ngưỡng ${tolerancePct}%.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Ngưỡng GIAO NHẬN theo số cây (khác hẳn ngưỡng lệch cân ở trên)             */
/* -------------------------------------------------------------------------- */

export interface DeliveryToleranceReading {
  tolerancePct?: number;
  /**
   * "server_fifo": số do chính preview FIFO trả về — đáng tin nhất.
   * "supplier": đọc thẳng `Supplier.receipt_tolerance_pct`.
   * "unknown": NCC chưa khai; client KHÔNG đoán, `resolveSupplierReceiptTolerance` sẽ quyết.
   */
  source: "server_fifo" | "supplier" | "unknown";
  label: string;
  note: string;
}

export function readDeliveryTolerance(input: {
  /** `tolerance_pct` do preview/commit FIFO trả về. */
  serverTolerancePct?: number | undefined;
  /** `tolerance_source` do preview/commit FIFO trả về. */
  serverToleranceSource?: string | undefined;
  /** `Supplier.receipt_tolerance_pct` đọc từ danh mục NCC. */
  supplierTolerancePct?: number | undefined;
}): DeliveryToleranceReading {
  const fromServer = numberValue(input.serverTolerancePct);
  if (fromServer !== undefined) {
    const source = String(input.serverToleranceSource ?? "").trim();
    const explain = source === "supplier"
      ? "khai trên hồ sơ nhà cung cấp"
      : source === "default_zero"
        ? "nhà cung cấp chưa khai nên server áp 0%"
        : source
          ? `server áp mặc định (${source})`
          : "server quyết";
    return {
      tolerancePct: fromServer,
      source: "server_fifo",
      label: `${fromServer}%`,
      note: `Dung sai giao nhận ${fromServer}% — ${explain} (resolveSupplierReceiptTolerance).`,
    };
  }
  const fromSupplier = numberValue(input.supplierTolerancePct);
  if (fromSupplier !== undefined) {
    return {
      tolerancePct: fromSupplier,
      source: "supplier",
      label: `${fromSupplier}%`,
      note: `Dung sai giao nhận ${fromSupplier}% đọc từ hồ sơ nhà cung cấp. Con số cuối cùng vẫn do server chốt khi phân bổ FIFO.`,
    };
  }
  return {
    source: "unknown",
    label: "chưa khai",
    note: "Nhà cung cấp chưa khai Dung sai nhận hàng (%). Màn không đoán hộ — server sẽ quyết bằng resolveSupplierReceiptTolerance khi phân bổ FIFO.",
  };
}
