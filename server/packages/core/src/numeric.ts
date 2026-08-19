import { errors } from "./errors.js";

// Một luật làm tròn, một nơi giữ.
//
// Trước đây `round`, `divideRounded` và `safeAdd` được chép lại ở hàng chục file: 13 bản
// `round`, 13 bản `divideRounded`, 26 bản `safeAdd`. Chúng đã bắt đầu trôi dạt — bản `round`
// trong storefront làm tròn 2 chữ số và bỏ `EPSILON`, trong khi 12 bản còn lại làm tròn 6 chữ
// số có `EPSILON`. Mỗi bản đều đúng với test của riêng nó, nên không cổng nào đỏ.

/**
 * Làm tròn nửa-lên trên số dấu phẩy động, cộng `EPSILON` để bù sai số nhị phân
 * (0.1 + 0.2 = 0.30000000000000004 làm `round(0.145, 2)` ra 0.14 nếu không bù).
 * Dùng cho đại lượng đo đạc — số tiền chính xác thì dùng `@cloudforge/money`.
 */
export function roundTo(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Chia nửa-lên (làm tròn ra xa số 0) trên số nguyên an toàn.
 * `message` là văn bản lỗi của từng miền nghiệp vụ — luật thì chung, câu chữ thì riêng.
 */
export function divideRoundedInt(numerator: number, denominator: number, message = "Arithmetic exceeds safe integer bounds"): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw errors.validation(message);
  }
  const sign = numerator < 0 ? -1 : 1;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2 >= denominator ? 1 : 0));
}

/** Bản `bigint` của cùng luật chia nửa-lên, cũng làm tròn ra xa số 0. */
export function divideRoundedBig(numerator: bigint, denominator: bigint, message = "Decimal divisor must be positive"): bigint {
  if (denominator <= 0n) throw errors.validation(message);
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Cộng có chặn tràn khỏi vùng số nguyên an toàn. */
export function safeAddInt(left: number, right: number, message = "Amount exceeds safe integer bounds"): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(message);
  return result;
}
