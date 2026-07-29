import type { GeneralLedgerEntry, PaymentLedgerEntry, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export function assertBalancedGl(lines: GeneralLedgerEntry[]): void {
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    assertSafeMinor(line.debit_minor, "GL debit");
    assertSafeMinor(line.credit_minor, "GL credit");
    if (line.debit_minor < 0 || line.credit_minor < 0) throw errors.ledger("GL debit and credit must be non-negative");
    if (line.debit_minor > 0 && line.credit_minor > 0) throw errors.ledger("A GL line cannot contain both debit and credit");
    if (!Number.isInteger(line.currency_scale) || line.currency_scale < 0 || line.currency_scale > 6) {
      throw errors.ledger("GL currency scale is invalid");
    }
    debit += BigInt(line.debit_minor);
    credit += BigInt(line.credit_minor);
  }
  if (debit !== credit) throw errors.ledger(`GL is not balanced: debit_minor=${debit}, credit_minor=${credit}`);
}

export function reverseGl(lines: GeneralLedgerEntry[]): GeneralLedgerEntry[] {
  return lines.map((line) => ({
    ...line,
    line_key: `REV-${line.line_key}`,
    debit_minor: line.credit_minor,
    credit_minor: line.debit_minor,
  }));
}

export function reverseStock(lines: StockLedgerEntry[]): StockLedgerEntry[] {
  return lines.map((line) => ({
    ...line,
    line_key: `REV-${line.line_key}`,
    actual_qty_micros: -line.actual_qty_micros,
    ...(line.actual_weight_micros === undefined
      ? {}
      : { actual_weight_micros: -line.actual_weight_micros }),
    stock_value_difference_minor: -line.stock_value_difference_minor,
  }));
}

export function reversePayment(lines: PaymentLedgerEntry[]): PaymentLedgerEntry[] {
  return lines.map((line) => ({
    ...line,
    line_key: `REV-${line.line_key}`,
    amount_minor: -line.amount_minor,
    base_amount_minor: -line.base_amount_minor,
  }));
}

function assertSafeMinor(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) throw errors.ledger(`${field} must use a safe integer minor amount`);
}
