export interface BankTransactionCandidateSource {
  name: string;
  bank_account: string;
  company: string;
  posting_at: string;
  transaction_type: "Deposit" | "Withdrawal";
  amount_minor: number;
  currency: string;
  gl_account: string;
  reference_number?: string;
  description?: string;
}

export interface PaymentEntryCandidateSource {
  name: string;
  docstatus: number;
  company: string;
  posting_at: string;
  payment_type: "Receive" | "Pay";
  paid_from: string;
  paid_to: string;
  received_amount_minor: number;
  company_currency?: string;
  currency?: string;
  party?: string;
  reference_no?: string;
  reference_number?: string;
  remarks?: string;
}

export interface BankMatchCandidate {
  payment_entry: string;
  posting_at: string;
  amount_minor: number;
  score: number;
  date_distance_days: number;
  reasons: string[];
  party?: string;
}

export function rankBankMatchCandidates(
  transaction: BankTransactionCandidateSource,
  payments: PaymentEntryCandidateSource[],
  maxDays = 7,
  limit = 20,
): BankMatchCandidate[] {
  if (!Number.isSafeInteger(transaction.amount_minor) || transaction.amount_minor <= 0) {
    throw new Error("Bank Transaction amount_minor must be a positive safe integer");
  }
  if (!transaction.company || !transaction.currency || !transaction.gl_account) {
    throw new Error("Bank Transaction requires company, currency and gl_account for matching");
  }
  if (!Number.isInteger(maxDays) || maxDays < 0 || maxDays > 30) throw new Error("max_days must be 0-30");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be 1-100");

  const transactionDay = utcDay(transaction.posting_at, "bank transaction posting_at");
  const transactionReference = normalizeReference(transaction.reference_number);
  const descriptionTokens = tokens(transaction.description);
  const candidates: BankMatchCandidate[] = [];

  for (const payment of payments) {
    if (payment.docstatus !== 1) continue;
    if (payment.company !== transaction.company) continue;
    const expectedType = transaction.transaction_type === "Deposit" ? "Receive" : "Pay";
    if (payment.payment_type !== expectedType) continue;
    const bankSideAccount = payment.payment_type === "Receive" ? payment.paid_to : payment.paid_from;
    if (bankSideAccount !== transaction.gl_account) continue;
    const currency = payment.company_currency ?? payment.currency;
    if (currency !== transaction.currency) continue;
    if (!Number.isSafeInteger(payment.received_amount_minor) || payment.received_amount_minor !== transaction.amount_minor) continue;

    const paymentDay = utcDay(payment.posting_at, `Payment Entry ${payment.name} posting_at`);
    const distance = Math.abs(paymentDay - transactionDay);
    if (distance > maxDays) continue;

    const reasons = ["EXACT_AMOUNT", "EXACT_BANK_ACCOUNT", "EXACT_COMPANY", "EXACT_CURRENCY"];
    let score = 50;
    if (distance === 0) { score += 30; reasons.push("SAME_DAY"); }
    else if (distance === 1) { score += 20; reasons.push("DATE_WITHIN_1_DAY"); }
    else if (distance <= 3) { score += 10; reasons.push("DATE_WITHIN_3_DAYS"); }

    const paymentReference = normalizeReference(payment.reference_no ?? payment.reference_number);
    if (transactionReference && paymentReference) {
      if (transactionReference === paymentReference) {
        score += 40;
        reasons.push("REFERENCE_EXACT");
      } else if (transactionReference.includes(paymentReference) || paymentReference.includes(transactionReference)) {
        score += 20;
        reasons.push("REFERENCE_CONTAINS");
      }
    }

    if (descriptionTokens.size && payment.party) {
      const partyTokens = tokens(payment.party);
      if ([...partyTokens].some((token) => descriptionTokens.has(token))) {
        score += 5;
        reasons.push("PARTY_TOKEN_IN_DESCRIPTION");
      }
    }

    candidates.push({
      payment_entry: payment.name,
      posting_at: payment.posting_at,
      amount_minor: payment.received_amount_minor,
      score,
      date_distance_days: distance,
      reasons,
      ...(payment.party ? { party: payment.party } : {}),
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.date_distance_days - b.date_distance_days || a.payment_entry.localeCompare(b.payment_entry))
    .slice(0, limit);
}

function utcDay(value: string, label: string): number {
  const raw = String(value ?? "").trim();
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid`);
  return Math.floor(date.getTime() / 86_400_000);
}

function normalizeReference(value: unknown): string {
  return String(value ?? "").trim().toLocaleUpperCase("vi").replace(/[^A-Z0-9]/g, "");
}

function tokens(value: unknown): Set<string> {
  return new Set(String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("vi")
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 3));
}
