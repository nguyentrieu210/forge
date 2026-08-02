import {
  evaluateTaxRuleset,
  parseTaxRuleset,
  parseTaxTestVectors,
  validateTaxTestVectors,
} from "./evaluator.js";
import {
  rankBankMatchCandidates,
  type BankTransactionCandidateSource,
  type PaymentEntryCandidateSource,
} from "./bank-match.js";

interface Env {
  PLATFORM?: Fetcher;
}

interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

interface MethodBody {
  method?: string;
  args?: Record<string, unknown>;
}

type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});
const accept = () => json({ ok: true });
const refuse = (message: string) => json({ message }, 422);

function callbackBase(request: Request): string {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("platform callback origin is required");
  return declared.replace(/\/$/, "");
}

function platformCaller(request: Request, env: Env): PlatformCall {
  const base = callbackBase(request);
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...forwarded,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

function isoDate(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  return text;
}

function validateRulesetPayload(payload: Record<string, unknown>): void {
  const schemaVersion = Number(payload.schema_version ?? 1);
  if (schemaVersion !== 1) throw new Error("VN Tax Ruleset schema_version must be 1");
  const schema = parseTaxRuleset(payload.expression_json);
  const vectors = parseTaxTestVectors(payload.test_vectors_json);
  validateTaxTestVectors(schema, vectors);
}

async function handleValidation(request: Request): Promise<Response> {
  const subject = await request.json<ValidatorSubject>();
  if (subject.doctype !== "VN Tax Ruleset" || subject.action !== "submit") return accept();
  try {
    validateRulesetPayload(subject.payload ?? {});
    return accept();
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Tax ruleset validation failed");
  }
}

async function readDocument(call: PlatformCall, doctype: string, name: string): Promise<Record<string, unknown>> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`${doctype} ${name} could not be read (HTTP ${response.status})`);
  const body = await response.json<{ data?: Record<string, unknown> }>();
  if (!body.data) throw new Error(`${doctype} ${name} was not returned by the platform`);
  return body.data;
}

async function readList(
  call: PlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw new Error(`${doctype} list could not be read (HTTP ${response.status})`);
  const body = await response.json<{ data?: Record<string, unknown>[] }>();
  return body.data ?? [];
}

async function evaluateMethod(request: Request, env: Env, args: Record<string, unknown>): Promise<Response> {
  const rulesetName = String(args.ruleset ?? "").trim();
  if (!rulesetName) return refuse("ruleset is required");
  const effectiveAt = isoDate(args.effective_at, "effective_at");
  const company = String(args.company ?? "").trim();
  if (!company) return refuse("company is required");
  const call = platformCaller(request, env);
  const ruleset = await readDocument(call, "VN Tax Ruleset", rulesetName);
  if (Number(ruleset.docstatus) !== 1) return refuse(`VN Tax Ruleset ${rulesetName} must be submitted`);
  if (String(ruleset.company ?? "") !== company) return refuse(`VN Tax Ruleset ${rulesetName} belongs to another company`);
  const from = isoDate(ruleset.effective_from, "ruleset effective_from");
  const to = ruleset.effective_to ? isoDate(ruleset.effective_to, "ruleset effective_to") : "9999-12-31";
  if (effectiveAt < from || effectiveAt > to) return refuse(`VN Tax Ruleset ${rulesetName} is not effective on ${effectiveAt}`);
  try {
    validateRulesetPayload(ruleset);
    const schema = parseTaxRuleset(ruleset.expression_json);
    const inputs = args.inputs ?? args.input_json ?? {};
    const result = evaluateTaxRuleset(schema, inputs);
    return json({
      message: {
        ruleset: rulesetName,
        company,
        rule_type: ruleset.rule_type,
        legal_rule: ruleset.legal_rule,
        source_hash: ruleset.source_hash,
        effective_at: effectiveAt,
        outputs: result.outputs,
        trace: result.trace,
      },
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Tax ruleset evaluation failed");
  }
}

function dateWindow(postingAt: unknown, maxDays: number): { from: string; to: string } {
  const raw = String(postingAt ?? "").trim();
  const center = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(center.getTime())) throw new Error("Bank Transaction posting_at is invalid");
  const delta = maxDays * 86_400_000;
  return {
    from: new Date(center.getTime() - delta).toISOString().slice(0, 10),
    to: new Date(center.getTime() + delta).toISOString().slice(0, 10),
  };
}

async function bankMatchMethod(request: Request, env: Env, args: Record<string, unknown>): Promise<Response> {
  const transactionName = String(args.bank_transaction ?? "").trim();
  if (!transactionName) return refuse("bank_transaction is required");
  const maxDays = Number(args.max_days ?? 7);
  const resultLimit = Number(args.limit ?? 20);
  if (!Number.isInteger(maxDays) || maxDays < 0 || maxDays > 30) return refuse("max_days must be 0-30");
  if (!Number.isInteger(resultLimit) || resultLimit < 1 || resultLimit > 100) return refuse("limit must be 1-100");

  const call = platformCaller(request, env);
  const source = await readDocument(call, "Bank Transaction", transactionName);
  if (Number(source.docstatus) !== 1) return refuse(`Bank Transaction ${transactionName} must be submitted`);
  const transaction: BankTransactionCandidateSource = {
    name: transactionName,
    bank_account: String(source.bank_account ?? ""),
    company: String(source.company ?? ""),
    posting_at: String(source.posting_at ?? ""),
    transaction_type: source.transaction_type === "Withdrawal" ? "Withdrawal" : "Deposit",
    amount_minor: Number(source.amount_minor),
    currency: String(source.currency ?? ""),
    gl_account: String(source.gl_account ?? ""),
    ...(source.reference_number ? { reference_number: String(source.reference_number) } : {}),
    ...(source.description ? { description: String(source.description) } : {}),
  };
  if (!source.transaction_type || !["Deposit", "Withdrawal"].includes(String(source.transaction_type))) {
    return refuse(`Bank Transaction ${transactionName} has invalid transaction_type`);
  }
  const window = dateWindow(transaction.posting_at, maxDays);
  const paymentType = transaction.transaction_type === "Deposit" ? "Receive" : "Pay";
  const rows = await readList(
    call,
    "Payment Entry",
    [
      "name", "docstatus", "company", "posting_at", "payment_type", "paid_from", "paid_to",
      "received_amount_minor", "company_currency", "currency", "party", "reference_no", "reference_number", "remarks",
    ],
    [
      ["company", "=", transaction.company],
      ["payment_type", "=", paymentType],
      ["posting_at", ">=", window.from],
      ["posting_at", "<=", `${window.to}T23:59:59Z`],
    ],
    200,
  );
  const payments: PaymentEntryCandidateSource[] = rows.map((row) => ({
    name: String(row.name ?? ""),
    docstatus: Number(row.docstatus),
    company: String(row.company ?? ""),
    posting_at: String(row.posting_at ?? ""),
    payment_type: row.payment_type === "Pay" ? "Pay" : "Receive",
    paid_from: String(row.paid_from ?? ""),
    paid_to: String(row.paid_to ?? ""),
    received_amount_minor: Number(row.received_amount_minor),
    ...(row.company_currency ? { company_currency: String(row.company_currency) } : {}),
    ...(row.currency ? { currency: String(row.currency) } : {}),
    ...(row.party ? { party: String(row.party) } : {}),
    ...(row.reference_no ? { reference_no: String(row.reference_no) } : {}),
    ...(row.reference_number ? { reference_number: String(row.reference_number) } : {}),
    ...(row.remarks ? { remarks: String(row.remarks) } : {}),
  }));
  try {
    const candidates = rankBankMatchCandidates(transaction, payments, maxDays, resultLimit);
    return json({
      message: {
        bank_transaction: transactionName,
        transaction_type: transaction.transaction_type,
        company: transaction.company,
        currency: transaction.currency,
        amount_minor: transaction.amount_minor,
        window,
        scanned_payment_entries: rows.length,
        truncated_source_scan: rows.length >= 200,
        candidates,
        write_path: "Submit Bank Reconciliation to apply a match; this method never writes.",
      },
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Bank matching failed");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/hooks/validate") return handleValidation(request);
    if (request.method === "POST" && url.pathname.startsWith("/api/method/")) {
      const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
      const body = await request.json<MethodBody>().catch(() => ({}));
      if (method === "vn-accounting.tax.evaluate") return evaluateMethod(request, env, body.args ?? {});
      if (method === "vn-accounting.bank.match_candidates") return bankMatchMethod(request, env, body.args ?? {});
      return json({ message: `Unknown vn-accounting method: ${method}` }, 404);
    }
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, app: "vn-accounting" });
    return json({ message: "Not found" }, 404);
  },
};
