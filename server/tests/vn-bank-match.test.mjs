import assert from "node:assert/strict";
import test from "node:test";
import { rankBankMatchCandidates } from "../dist/apps-src/vn-accounting-worker/src/bank-match.js";

const transaction = {
  name: "BT-001",
  bank_account: "VCB-001",
  company: "Kairo",
  posting_at: "2026-08-03T08:00:00Z",
  transaction_type: "Deposit",
  amount_minor: 1_000_000,
  currency: "VND",
  gl_account: "1121-KAIRO",
  reference_number: "FT-12345",
  description: "THANH TOAN KHACH HANG ACME",
};

const payment = (overrides = {}) => ({
  name: "PE-001",
  docstatus: 1,
  company: "Kairo",
  posting_at: "2026-08-03T09:00:00Z",
  payment_type: "Receive",
  paid_from: "131-KAIRO",
  paid_to: "1121-KAIRO",
  received_amount_minor: 1_000_000,
  company_currency: "VND",
  party: "ACME",
  reference_no: "FT12345",
  ...overrides,
});

test("bank match ranks exact reference and same-day payment first", () => {
  const ranked = rankBankMatchCandidates(transaction, [
    payment({ name: "PE-LATER", posting_at: "2026-08-05T09:00:00Z", reference_no: "OTHER" }),
    payment({ name: "PE-EXACT" }),
    payment({ name: "PE-NEXT", posting_at: "2026-08-04T09:00:00Z", reference_no: "FT12345" }),
  ]);
  assert.deepEqual(ranked.map((row) => row.payment_entry), ["PE-EXACT", "PE-NEXT", "PE-LATER"]);
  assert.ok(ranked[0].reasons.includes("REFERENCE_EXACT"));
  assert.ok(ranked[0].reasons.includes("SAME_DAY"));
  assert.ok(ranked[0].reasons.includes("PARTY_TOKEN_IN_DESCRIPTION"));
});

test("bank match fails closed on amount, account, currency, company and direction mismatches", () => {
  const ranked = rankBankMatchCandidates(transaction, [
    payment({ name: "AMOUNT", received_amount_minor: 999_999 }),
    payment({ name: "ACCOUNT", paid_to: "1111-KAIRO" }),
    payment({ name: "CURRENCY", company_currency: "USD" }),
    payment({ name: "COMPANY", company: "Other" }),
    payment({ name: "DIRECTION", payment_type: "Pay", paid_from: "1121-KAIRO", paid_to: "331-KAIRO" }),
    payment({ name: "DRAFT", docstatus: 0 }),
  ]);
  assert.deepEqual(ranked, []);
});

test("withdrawal matches Pay bank-side account and result ordering is deterministic", () => {
  const withdrawal = { ...transaction, transaction_type: "Withdrawal", reference_number: "" };
  const rows = rankBankMatchCandidates(withdrawal, [
    payment({ name: "PE-B", payment_type: "Pay", paid_from: "1121-KAIRO", paid_to: "331-KAIRO", reference_no: "", party: "" }),
    payment({ name: "PE-A", payment_type: "Pay", paid_from: "1121-KAIRO", paid_to: "331-KAIRO", reference_no: "", party: "" }),
  ]);
  assert.deepEqual(rows.map((row) => row.payment_entry), ["PE-A", "PE-B"]);
});

test("bank match enforces bounded date window and candidate limit", () => {
  assert.equal(rankBankMatchCandidates(transaction, [payment({ posting_at: "2026-08-11T09:00:00Z" })], 7).length, 0);
  assert.throws(() => rankBankMatchCandidates(transaction, [], 31), /max_days/);
  const many = Array.from({ length: 5 }, (_, index) => payment({ name: `PE-${index}` }));
  assert.equal(rankBankMatchCandidates(transaction, many, 7, 2).length, 2);
});
