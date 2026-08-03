import {
  parseVatAccountMapping,
  reconcileVatInvoice,
  summarizeVatDataset,
  type VatInvoiceReconciliation,
} from "./vat-dataset.js";

interface Env {
  PLATFORM?: Fetcher;
}

type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});
const refuse = (message: string) => json({ message }, 422);

export async function handleVatMethod(
  method: string,
  request: Request,
  env: Env,
  args: Record<string, unknown>,
): Promise<Response | null> {
  if (method === "vn-accounting.vat.invoice_reconcile") return invoiceReconcile(request, env, args);
  if (method === "vn-accounting.vat.dataset") return vatDataset(request, env, args);
  return null;
}

async function invoiceReconcile(request: Request, env: Env, args: Record<string, unknown>): Promise<Response> {
  try {
    const rulesetName = requiredText(args.ruleset, "ruleset");
    const sourceDoctype = sourceType(args.source_doctype);
    const sourceName = requiredText(args.source_name, "source_name");
    const call = platformCaller(request, env);
    const ruleset = await readVatRuleset(call, rulesetName);
    const invoice = await readDocument(call, sourceDoctype, sourceName);
    assertInvoiceScope(invoice, ruleset.company, ruleset.effective_from, ruleset.effective_to, sourceDoctype);
    const row = reconcileVatInvoice(sourceDoctype, invoice, ruleset.mapping);
    return json({
      message: {
        ruleset: rulesetName,
        company: ruleset.company,
        legal_rule: ruleset.legal_rule,
        source_hash: ruleset.source_hash,
        row,
        ready_for_filing_dataset: row.reconciliation_ok && row.unmapped_tax_accounts.length === 0,
      },
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "VAT invoice reconciliation failed");
  }
}

async function vatDataset(request: Request, env: Env, args: Record<string, unknown>): Promise<Response> {
  try {
    const rulesetName = requiredText(args.ruleset, "ruleset");
    const fromDate = isoDate(args.from_date, "from_date");
    const toDate = isoDate(args.to_date, "to_date");
    if (fromDate > toDate) throw new Error("from_date must be on or before to_date");
    const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
    const toMs = Date.parse(`${toDate}T00:00:00Z`);
    if ((toMs - fromMs) / 86_400_000 > 370) throw new Error("VAT dataset date range must not exceed 370 days");
    const limitPerType = integerInRange(args.limit_per_type ?? 100, 1, 200, "limit_per_type");
    const call = platformCaller(request, env);
    const ruleset = await readVatRuleset(call, rulesetName);
    if (fromDate < ruleset.effective_from || toDate > ruleset.effective_to) {
      throw new Error(`VAT ruleset ${rulesetName} is not effective for the entire requested dataset period`);
    }

    const sourceLists = await Promise.all((["Sales Invoice", "Purchase Invoice"] as const).map(async (doctype) => ({
      doctype,
      rows: await readList(
        call,
        doctype,
        ["name", "posting_at", "docstatus", "company"],
        [
          ["company", "=", ruleset.company],
          ["docstatus", "=", 1],
          ["posting_at", ">=", `${fromDate}T00:00:00Z`],
          ["posting_at", "<=", `${toDate}T23:59:59Z`],
        ],
        limitPerType,
      ),
    })));

    const rows: VatInvoiceReconciliation[] = [];
    const errors: Array<{ source_doctype: string; source_name: string; error: string }> = [];
    for (const source of sourceLists) {
      for (let offset = 0; offset < source.rows.length; offset += 20) {
        const batch = source.rows.slice(offset, offset + 20);
        const documents = await Promise.all(batch.map(async (summary) => {
          const name = requiredText(summary.name, `${source.doctype} list name`);
          try {
            const invoice = await readDocument(call, source.doctype, name);
            assertInvoiceScope(invoice, ruleset.company, ruleset.effective_from, ruleset.effective_to, source.doctype);
            return { ok: true as const, row: reconcileVatInvoice(source.doctype, invoice, ruleset.mapping) };
          } catch (error) {
            return {
              ok: false as const,
              error: {
                source_doctype: source.doctype,
                source_name: name,
                error: error instanceof Error ? error.message : "VAT invoice reconciliation failed",
              },
            };
          }
        }));
        for (const result of documents) {
          if (result.ok) rows.push(result.row);
          else errors.push(result.error);
        }
      }
    }

    rows.sort((a, b) => a.posting_at.localeCompare(b.posting_at) || a.source_doctype.localeCompare(b.source_doctype) || a.source_name.localeCompare(b.source_name));
    const truncated = sourceLists.some((source) => source.rows.length >= limitPerType);
    const summary = summarizeVatDataset(rows, errors.length + (truncated ? 1 : 0));
    return json({
      message: {
        ruleset: rulesetName,
        company: ruleset.company,
        legal_rule: ruleset.legal_rule,
        source_hash: ruleset.source_hash,
        from_date: fromDate,
        to_date: toDate,
        limit_per_type: limitPerType,
        source_counts: Object.fromEntries(sourceLists.map((source) => [source.doctype, source.rows.length])),
        truncated,
        errors,
        summary,
        rows,
        write_path: "Read-only VAT filing dataset preview; no tax ledger or filing is written.",
      },
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "VAT dataset generation failed");
  }
}

function platformCaller(request: Request, env: Env): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("platform callback origin is required");
  const base = declared.replace(/\/$/, "");
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

async function readVatRuleset(call: PlatformCall, name: string): Promise<{
  company: string;
  legal_rule: string;
  source_hash: string;
  effective_from: string;
  effective_to: string;
  mapping: ReturnType<typeof parseVatAccountMapping>;
}> {
  const ruleset = await readDocument(call, "VN Tax Ruleset", name);
  if (Number(ruleset.docstatus) !== 1) throw new Error(`VN Tax Ruleset ${name} must be submitted`);
  if (String(ruleset.rule_type ?? "") !== "VAT") throw new Error(`VN Tax Ruleset ${name} must have rule_type VAT`);
  const company = requiredText(ruleset.company, `VN Tax Ruleset ${name} company`);
  const effectiveFrom = isoDate(ruleset.effective_from, `VN Tax Ruleset ${name} effective_from`);
  const effectiveTo = ruleset.effective_to ? isoDate(ruleset.effective_to, `VN Tax Ruleset ${name} effective_to`) : "9999-12-31";
  return {
    company,
    legal_rule: requiredText(ruleset.legal_rule, `VN Tax Ruleset ${name} legal_rule`),
    source_hash: requiredText(ruleset.source_hash, `VN Tax Ruleset ${name} source_hash`),
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    mapping: parseVatAccountMapping(ruleset.tax_accounts_json),
  };
}

function assertInvoiceScope(
  invoice: Record<string, unknown>,
  company: string,
  effectiveFrom: string,
  effectiveTo: string,
  sourceDoctype: string,
): void {
  if (Number(invoice.docstatus) !== 1) throw new Error(`${sourceDoctype} ${String(invoice.name ?? "")} must be submitted`);
  if (String(invoice.company ?? "") !== company) throw new Error(`${sourceDoctype} ${String(invoice.name ?? "")} belongs to another company`);
  const postingDate = requiredText(invoice.posting_at, `${sourceDoctype} posting_at`).slice(0, 10);
  if (postingDate < effectiveFrom || postingDate > effectiveTo) {
    throw new Error(`${sourceDoctype} ${String(invoice.name ?? "")} is outside VAT ruleset effective dates`);
  }
}

async function readDocument(call: PlatformCall, doctype: string, name: string): Promise<Record<string, unknown>> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`${doctype} ${name} could not be read (HTTP ${response.status})`);
  const body = object(await response.json(), `${doctype} response`);
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${doctype} ${name} was not returned by the platform`);
  return data as Record<string, unknown>;
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
  const body = object(await response.json(), `${doctype} list response`);
  if (body.data === undefined) return [];
  if (!Array.isArray(body.data)) throw new Error(`${doctype} list data must be an array`);
  return body.data.map((row, index) => object(row, `${doctype} list row ${index + 1}`));
}

function sourceType(value: unknown): "Sales Invoice" | "Purchase Invoice" {
  const type = requiredText(value, "source_doctype");
  if (type !== "Sales Invoice" && type !== "Purchase Invoice") throw new Error("source_doctype must be Sales Invoice or Purchase Invoice");
  return type;
}

function isoDate(value: unknown, label: string): string {
  const text = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw new Error(`${label} must use YYYY-MM-DD`);
  return text;
}

function integerInRange(value: unknown, min: number, max: number, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label} must be ${min}-${max}`);
  return result;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
