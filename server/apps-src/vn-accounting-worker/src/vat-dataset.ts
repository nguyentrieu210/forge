export interface VatAccountMapping {
  input_vat: string[];
  output_vat: string[];
}

export interface VatTaxRowEvidence {
  row_id: string;
  account: string;
  tax_amount_minor: number;
  base_tax_amount_minor: number;
  classification: "input_vat" | "output_vat" | "unmapped";
}

export interface VatInvoiceReconciliation {
  source_doctype: "Sales Invoice" | "Purchase Invoice";
  source_name: string;
  company: string;
  posting_at: string;
  currency: string;
  currency_scale: number;
  company_currency: string;
  company_currency_scale: number;
  conversion_rate_micros: number;
  base_net_total_minor: number;
  base_tax_total_minor: number;
  base_grand_total_minor: number;
  mapped_vat_minor: number;
  input_vat_minor: number;
  output_vat_minor: number;
  tax_rows_base_total_minor: number;
  reconciliation_difference_minor: number;
  reconciliation_ok: boolean;
  unmapped_tax_accounts: string[];
  tax_rows: VatTaxRowEvidence[];
}

export interface VatDatasetSummary {
  invoice_count: number;
  sales_invoice_count: number;
  purchase_invoice_count: number;
  output_vat_minor: number;
  input_vat_minor: number;
  net_vat_minor: number;
  invoice_tax_difference_minor: number;
  exception_count: number;
  ready_for_filing_dataset: boolean;
}

export function parseVatAccountMapping(value: unknown): VatAccountMapping {
  const raw = typeof value === "string" ? parseJson(value, "tax_accounts_json") : value;
  const mapping = object(raw, "tax_accounts_json");
  const inputVat = stringArray(mapping.input_vat, "tax_accounts_json.input_vat");
  const outputVat = stringArray(mapping.output_vat, "tax_accounts_json.output_vat");
  if (!inputVat.length && !outputVat.length) throw new Error("VAT account mapping cannot be empty");
  const inputSet = new Set(inputVat);
  for (const account of outputVat) {
    if (inputSet.has(account)) throw new Error(`VAT account ${account} cannot be both input and output VAT`);
  }
  return { input_vat: inputVat, output_vat: outputVat };
}

export function reconcileVatInvoice(
  sourceDoctype: "Sales Invoice" | "Purchase Invoice",
  invoice: Record<string, unknown>,
  mapping: VatAccountMapping,
): VatInvoiceReconciliation {
  if (Number(invoice.docstatus) !== 1) throw new Error(`${sourceDoctype} must be submitted`);
  const sourceName = requiredText(invoice.name, `${sourceDoctype} name`);
  const company = requiredText(invoice.company, `${sourceDoctype} company`);
  const postingAt = requiredText(invoice.posting_at, `${sourceDoctype} posting_at`);
  const currency = requiredText(invoice.currency, `${sourceDoctype} currency`);
  const sourceScale = scale(invoice.currency_scale, `${sourceDoctype} currency_scale`);
  const companyCurrency = requiredText(invoice.company_currency ?? invoice.currency, `${sourceDoctype} company_currency`);
  const companyScale = scale(invoice.company_currency_scale ?? invoice.currency_scale, `${sourceDoctype} company_currency_scale`);
  const rateMicros = companyCurrency === currency
    ? 1_000_000
    : positiveInteger(invoice.conversion_rate_micros, `${sourceDoctype} conversion_rate_micros`);

  const rowsRaw = Array.isArray(invoice.taxes) ? invoice.taxes : [];
  const inputAccounts = new Set(mapping.input_vat);
  const outputAccounts = new Set(mapping.output_vat);
  const taxRows: VatTaxRowEvidence[] = [];
  const unmapped = new Set<string>();
  let rowBaseTotal = 0;
  let inputVat = 0;
  let outputVat = 0;

  rowsRaw.forEach((entry, index) => {
    const row = object(entry, `${sourceDoctype}.taxes[${index}]`);
    const account = requiredText(row.account ?? row.account_head, `${sourceDoctype}.taxes[${index}].account`);
    const taxMinor = integer(row.tax_amount_minor, `${sourceDoctype}.taxes[${index}].tax_amount_minor`);
    const baseTaxMinor = row.base_tax_amount_minor === undefined
      ? convertMinor(taxMinor, sourceScale, rateMicros, companyScale, `${sourceDoctype}.taxes[${index}]`)
      : integer(row.base_tax_amount_minor, `${sourceDoctype}.taxes[${index}].base_tax_amount_minor`);
    rowBaseTotal = add(rowBaseTotal, baseTaxMinor, "invoice tax row total");
    let classification: VatTaxRowEvidence["classification"] = "unmapped";
    if (inputAccounts.has(account)) {
      classification = "input_vat";
      inputVat = add(inputVat, baseTaxMinor, "input VAT");
    } else if (outputAccounts.has(account)) {
      classification = "output_vat";
      outputVat = add(outputVat, baseTaxMinor, "output VAT");
    } else if (baseTaxMinor !== 0) {
      unmapped.add(account);
    }
    taxRows.push({
      row_id: typeof row.row_id === "string" && row.row_id ? row.row_id : `ROW-${index + 1}`,
      account,
      tax_amount_minor: taxMinor,
      base_tax_amount_minor: baseTaxMinor,
      classification,
    });
  });

  const baseNet = baseMinor(invoice, "net_total_minor", "base_net_total_minor", sourceScale, rateMicros, companyScale, sourceDoctype);
  const baseTax = baseMinor(invoice, "total_taxes_and_charges_minor", "base_total_taxes_and_charges_minor", sourceScale, rateMicros, companyScale, sourceDoctype);
  const baseGrand = baseMinor(invoice, "grand_total_minor", "base_grand_total_minor", sourceScale, rateMicros, companyScale, sourceDoctype);
  const difference = add(rowBaseTotal, -baseTax, "invoice tax reconciliation difference");
  const mappedVat = sourceDoctype === "Sales Invoice" ? outputVat : inputVat;

  return {
    source_doctype: sourceDoctype,
    source_name: sourceName,
    company,
    posting_at: postingAt,
    currency,
    currency_scale: sourceScale,
    company_currency: companyCurrency,
    company_currency_scale: companyScale,
    conversion_rate_micros: rateMicros,
    base_net_total_minor: baseNet,
    base_tax_total_minor: baseTax,
    base_grand_total_minor: baseGrand,
    mapped_vat_minor: mappedVat,
    input_vat_minor: sourceDoctype === "Purchase Invoice" ? inputVat : 0,
    output_vat_minor: sourceDoctype === "Sales Invoice" ? outputVat : 0,
    tax_rows_base_total_minor: rowBaseTotal,
    reconciliation_difference_minor: difference,
    reconciliation_ok: difference === 0,
    unmapped_tax_accounts: [...unmapped].sort(),
    tax_rows: taxRows,
  };
}

export function summarizeVatDataset(rows: VatInvoiceReconciliation[], extraExceptionCount = 0): VatDatasetSummary {
  let outputVat = 0;
  let inputVat = 0;
  let difference = 0;
  let exceptions = extraExceptionCount;
  for (const row of rows) {
    outputVat = add(outputVat, row.output_vat_minor, "VAT dataset output");
    inputVat = add(inputVat, row.input_vat_minor, "VAT dataset input");
    difference = add(difference, row.reconciliation_difference_minor, "VAT dataset reconciliation difference");
    if (!row.reconciliation_ok || row.unmapped_tax_accounts.length) exceptions += 1;
  }
  return {
    invoice_count: rows.length,
    sales_invoice_count: rows.filter((row) => row.source_doctype === "Sales Invoice").length,
    purchase_invoice_count: rows.filter((row) => row.source_doctype === "Purchase Invoice").length,
    output_vat_minor: outputVat,
    input_vat_minor: inputVat,
    net_vat_minor: add(outputVat, -inputVat, "VAT dataset net"),
    invoice_tax_difference_minor: difference,
    exception_count: exceptions,
    ready_for_filing_dataset: exceptions === 0,
  };
}

function baseMinor(
  invoice: Record<string, unknown>,
  transactionField: string,
  baseField: string,
  sourceScale: number,
  rateMicros: number,
  companyScale: number,
  label: string,
): number {
  if (invoice[baseField] !== undefined) return integer(invoice[baseField], `${label} ${baseField}`);
  const transaction = integer(invoice[transactionField], `${label} ${transactionField}`);
  return convertMinor(transaction, sourceScale, rateMicros, companyScale, `${label} ${baseField}`);
}

function convertMinor(amountMinor: number, sourceScale: number, rateMicros: number, targetScale: number, label: string): number {
  const numerator = BigInt(amountMinor) * BigInt(rateMicros) * pow10(targetScale);
  const denominator = pow10(sourceScale) * 1_000_000n;
  return roundedDivide(numerator, denominator, label);
}

function roundedDivide(numerator: bigint, denominator: bigint, label: string): number {
  if (denominator <= 0n) throw new Error(`${label}: invalid conversion denominator`);
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return safeNumber(negative ? -rounded : rounded, label);
}

function pow10(scaleValue: number): bigint {
  return 10n ** BigInt(scaleValue);
}

function add(left: number, right: number, label: string): number {
  return safeNumber(BigInt(left) + BigInt(right), label);
}

function safeNumber(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe integer bounds`);
  return result;
}

function scale(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result < 0 || result > 6) throw new Error(`${label} must be 0-6`);
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result <= 0) throw new Error(`${label} must be positive`);
  return result;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => requiredText(entry, `${label}[${index}]`));
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}
