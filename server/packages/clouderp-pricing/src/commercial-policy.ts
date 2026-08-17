import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";

export type PricingRuleEffect = "RATE_OVERRIDE" | "DISCOUNT_PERCENT" | "DISCOUNT_AMOUNT" | "ADJUSTMENT";
export type PricingRuleOperator = "eq" | "neq" | "in" | "not_in" | "lt" | "lte" | "gt" | "gte";
export type PricingAdjustmentBasis = "FIXED" | "PRICED_QTY" | "AREA_SQM" | "LENGTH_M" | "SET_COUNT";

export interface PricingRuleCondition extends JsonObject {
  field: string;
  operator: PricingRuleOperator;
  value?: string | number | boolean;
  values?: Array<string | number | boolean>;
}

export interface PricingRuleSnapshot extends JsonObject {
  rule_name: string;
  rule_version?: number;
  effect_type: PricingRuleEffect;
  priority: number;
  exclusive_group?: string;
  discount_percentage?: string;
  amount_minor?: number;
  basis?: PricingAdjustmentBasis;
  basis_qty?: string;
  basis_qty_micros?: number;
  rate_minor?: number;
  taxable?: boolean;
  discountable?: boolean;
}

export interface AppliedPricingAdjustment extends JsonObject {
  rule_name: string;
  rule_version?: number;
  basis: PricingAdjustmentBasis;
  basis_qty: string;
  basis_qty_micros: number;
  rate_minor: number;
  amount_minor: number;
  exclusive_group?: string;
  taxable: boolean;
  discountable: boolean;
}

export interface CommercialPricingPolicyInput {
  itemCode: string;
  priceList: string;
  postingDate: string;
  currency: string;
  currencyScale: number;
  qtyMicros: number;
  partyType?: "Customer" | "Supplier";
  party?: string;
  customerGroup?: string;
  supplierGroup?: string;
  facts: Record<string, unknown>;
  pricedQtyMicros: number;
  areaSqm?: number;
  lengthM?: number;
  setCount?: number;
}

export interface ResolvedCommercialPolicy {
  rate_override_minor?: number;
  discount_percentage?: string;
  discount_percentage_micros?: number;
  discount_amount_minor?: number;
  adjustments: AppliedPricingAdjustment[];
  snapshots: PricingRuleSnapshot[];
}

interface Candidate {
  name: string;
  data: JsonObject;
  effect: PricingRuleEffect;
  priority: number;
  specificity: number;
  exclusiveGroup: string;
}

const ONE = 1_000_000;

export async function resolveCommercialPricingPolicy(
  context: ControllerContext<JsonObject>,
  input: CommercialPricingPolicyInput,
): Promise<ResolvedCommercialPolicy> {
  const records = await context.reader.listMasterRecordData(context.command.tenant_id, "Pricing Rule");
  const scopes = new Map<string, JsonObject | null>();
  const candidates: Candidate[] = [];
  for (const record of records) {
    if (!await matchesBuiltIn(context, record.data, input, scopes)) continue;
    const conditions = parseConditions(record.data.conditions);
    if (!conditions.every((condition) => conditionMatches(input.facts, condition))) continue;
    const effect = inferEffect(record.data);
    if (!effect) continue;
    candidates.push({
      name: record.name,
      data: record.data,
      effect,
      priority: integer(record.data.priority, 0),
      specificity: specificity(record.data, conditions),
      exclusiveGroup: text(record.data.exclusive_group),
    });
  }

  const selectedRate = selectOne(candidates.filter((candidate) => candidate.effect === "RATE_OVERRIDE"), "rate override");
  const selectedDiscount = selectOne(
    candidates.filter((candidate) => candidate.effect === "DISCOUNT_PERCENT" || candidate.effect === "DISCOUNT_AMOUNT"),
    "discount",
  );
  const selectedAdjustments = selectAdjustments(candidates.filter((candidate) => candidate.effect === "ADJUSTMENT"));

  const snapshots: PricingRuleSnapshot[] = [];
  const result: ResolvedCommercialPolicy = { adjustments: [], snapshots };

  if (selectedRate) {
    const rateMinor = moneyMinor(selectedRate.data.rate ?? selectedRate.data.effect_value, input.currencyScale, `${selectedRate.name}.rate`);
    result.rate_override_minor = rateMinor;
    snapshots.push(await snapshot(context, selectedRate, { rate_minor: rateMinor }));
  }

  if (selectedDiscount) {
    if (selectedDiscount.effect === "DISCOUNT_PERCENT") {
      const raw = selectedDiscount.data.discount_percentage ?? selectedDiscount.data.effect_value;
      const pctMicros = toScaledInt(numeric(raw, `${selectedDiscount.name}.discount_percentage`), 6, `${selectedDiscount.name}.discount_percentage`);
      if (pctMicros < 0 || pctMicros > 100_000_000) throw errors.validation(`${selectedDiscount.name}: discount percentage must be from 0 to 100`);
      result.discount_percentage_micros = pctMicros;
      result.discount_percentage = fromScaledInt(pctMicros, 6);
      snapshots.push(await snapshot(context, selectedDiscount, { discount_percentage: result.discount_percentage }));
    } else {
      const amountMinor = moneyMinor(
        selectedDiscount.data.discount_amount ?? selectedDiscount.data.effect_value,
        input.currencyScale,
        `${selectedDiscount.name}.discount_amount`,
      );
      result.discount_amount_minor = amountMinor;
      snapshots.push(await snapshot(context, selectedDiscount, { amount_minor: amountMinor }));
    }
  }

  for (const candidate of selectedAdjustments) {
    const basis = adjustmentBasis(candidate.data.adjustment_basis ?? candidate.data.basis);
    const rateMinor = signedMoneyMinor(
      candidate.data.adjustment_rate ?? candidate.data.effect_value ?? candidate.data.rate,
      input.currencyScale,
      `${candidate.name}.adjustment_rate`,
    );
    const basisQtyMicros = adjustmentQtyMicros(input, basis);
    if (basisQtyMicros <= 0) continue;
    const amountMinor = multiplyMinorByQuantity(rateMinor, basisQtyMicros, candidate.name);
    const applied: AppliedPricingAdjustment = {
      rule_name: candidate.name,
      basis,
      basis_qty: fromScaledInt(basisQtyMicros, 6),
      basis_qty_micros: basisQtyMicros,
      rate_minor: rateMinor,
      amount_minor: amountMinor,
      ...(candidate.exclusiveGroup ? { exclusive_group: candidate.exclusiveGroup } : {}),
      taxable: candidate.data.taxable !== false && candidate.data.taxable !== 0,
      discountable: candidate.data.discountable === true || candidate.data.discountable === 1,
    };
    const canonical = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Pricing Rule", candidate.name);
    if (canonical) applied.rule_version = canonical.version;
    result.adjustments.push(applied);
    snapshots.push({
      rule_name: candidate.name,
      ...(canonical ? { rule_version: canonical.version } : {}),
      effect_type: "ADJUSTMENT",
      priority: candidate.priority,
      ...(candidate.exclusiveGroup ? { exclusive_group: candidate.exclusiveGroup } : {}),
      basis,
      basis_qty: applied.basis_qty,
      basis_qty_micros: basisQtyMicros,
      rate_minor: rateMinor,
      amount_minor: amountMinor,
      taxable: applied.taxable,
      discountable: applied.discountable,
    });
  }

  return result;
}

async function matchesBuiltIn(
  context: ControllerContext<JsonObject>,
  rule: JsonObject,
  input: CommercialPricingPolicyInput,
  scopes: Map<string, JsonObject | null>,
): Promise<boolean> {
  if (disabled(rule.disabled)) return false;
  if (text(rule.currency) && text(rule.currency) !== input.currency) return false;
  if (text(rule.price_list) && text(rule.price_list) !== input.priceList) return false;
  const scopeName = text(rule.pricing_scope);
  if (scopeName) {
    let scope = scopes.get(scopeName);
    if (scope === undefined) {
      scope = await context.reader.getMasterRecordData(context.command.tenant_id, "Pricing Scope", scopeName);
      scopes.set(scopeName, scope);
    }
    if (!scope || disabled(scope.disabled) || !scopeIncludes(scope, input)) return false;
  }
  if (text(rule.item_code) && text(rule.item_code) !== input.itemCode) return false;
  if (text(rule.item_group) && normalized(rule.item_group) !== normalized(input.facts.item_group)) return false;
  if (text(rule.party_type) && text(rule.party_type) !== text(input.partyType)) return false;
  if (text(rule.party) && text(rule.party) !== text(input.party)) return false;
  if (text(rule.customer_group) && text(rule.customer_group) !== text(input.customerGroup)) return false;
  if (text(rule.supplier_group) && text(rule.supplier_group) !== text(input.supplierGroup)) return false;
  const day = input.postingDate.slice(0, 10);
  if (text(rule.valid_from) && day < text(rule.valid_from).slice(0, 10)) return false;
  if (text(rule.valid_upto) && day > text(rule.valid_upto).slice(0, 10)) return false;
  const min = rule.min_qty === undefined || rule.min_qty === null || rule.min_qty === ""
    ? 0 : toScaledInt(numeric(rule.min_qty, "Pricing Rule.min_qty"), 6);
  const max = rule.max_qty === undefined || rule.max_qty === null || rule.max_qty === ""
    ? Number.MAX_SAFE_INTEGER : toScaledInt(numeric(rule.max_qty, "Pricing Rule.max_qty"), 6);
  return input.qtyMicros >= min && input.qtyMicros <= max;
}

function scopeIncludes(scope: JsonObject, input: CommercialPricingPolicyInput): boolean {
  return tableRows(scope.members).some((row) => {
    const memberType = text(row.member_type) || (text(row.item_code) ? "Item" : "Item Group");
    if (memberType === "Item") return text(row.item_code) === input.itemCode;
    if (memberType === "Item Group") return normalized(row.item_group) === normalized(input.facts.item_group);
    return false;
  });
}

function tableRows(value: unknown): JsonObject[] {
  let rows = value;
  if (typeof rows === "string" && rows.trim()) {
    try { rows = JSON.parse(rows); } catch { return []; }
  }
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function parseConditions(value: unknown): PricingRuleCondition[] {
  let rows: unknown = value;
  if (typeof value === "string" && value.trim()) {
    try { rows = JSON.parse(value); } catch { throw errors.validation("Pricing Rule.conditions must be valid JSON when stored as text"); }
  }
  if (rows === undefined || rows === null || rows === "") return [];
  if (!Array.isArray(rows)) throw errors.validation("Pricing Rule.conditions must be an array");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.validation(`Pricing Rule condition ${index + 1} must be an object`);
    const data = row as JsonObject;
    const field = text(data.field ?? data.fieldname);
    const operator = text(data.operator ?? data.op) as PricingRuleOperator;
    if (!field) throw errors.validation(`Pricing Rule condition ${index + 1} requires field`);
    if (!["eq", "neq", "in", "not_in", "lt", "lte", "gt", "gte"].includes(operator)) {
      throw errors.validation(`Pricing Rule condition ${index + 1} has invalid operator`);
    }
    const condition: PricingRuleCondition = { field, operator };
    if (data.value !== undefined) condition.value = scalar(data.value, `Pricing Rule condition ${index + 1}.value`);
    if (data.values !== undefined) {
      if (!Array.isArray(data.values)) throw errors.validation(`Pricing Rule condition ${index + 1}.values must be an array`);
      condition.values = data.values.map((entry) => scalar(entry, `Pricing Rule condition ${index + 1}.values`));
    }
    return condition;
  });
}

function conditionMatches(facts: Record<string, unknown>, condition: PricingRuleCondition): boolean {
  const actual = comparable(facts[condition.field]);
  if (condition.operator === "in" || condition.operator === "not_in") {
    const values = (condition.values ?? []).map(comparable);
    const matched = values.some((value) => value === actual);
    return condition.operator === "in" ? matched : !matched;
  }
  const expected = comparable(condition.value);
  if (condition.operator === "eq") return actual === expected;
  if (condition.operator === "neq") return actual !== expected;
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (condition.operator === "lt") return left < right;
  if (condition.operator === "lte") return left <= right;
  if (condition.operator === "gt") return left > right;
  return left >= right;
}

function inferEffect(rule: JsonObject): PricingRuleEffect | null {
  const explicit = text(rule.effect_type).toUpperCase();
  if (["RATE_OVERRIDE", "DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "ADJUSTMENT"].includes(explicit)) return explicit as PricingRuleEffect;
  if (rule.rate !== undefined && rule.rate !== null && rule.rate !== "") return "RATE_OVERRIDE";
  if (rule.discount_percentage !== undefined && rule.discount_percentage !== null && rule.discount_percentage !== "") return "DISCOUNT_PERCENT";
  if (rule.discount_amount !== undefined && rule.discount_amount !== null && rule.discount_amount !== "") return "DISCOUNT_AMOUNT";
  if (rule.adjustment_rate !== undefined && rule.adjustment_rate !== null && rule.adjustment_rate !== "") return "ADJUSTMENT";
  return null;
}

function specificity(rule: JsonObject, conditions: PricingRuleCondition[]): number {
  return (text(rule.party) ? 32 : 0)
    + (text(rule.pricing_scope) ? 24 : 0)
    + (text(rule.item_code) ? 16 : 0)
    + (text(rule.item_group) ? 8 : 0)
    + (text(rule.customer_group) || text(rule.supplier_group) ? 4 : 0)
    + (text(rule.price_list) ? 2 : 0)
    + Math.min(conditions.length, 15);
}

function selectOne(candidates: Candidate[], label: string): Candidate | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort(compareCandidates);
  const first = sorted[0]!;
  const tied = sorted.filter((candidate) => candidate.priority === first.priority && candidate.specificity === first.specificity);
  if (tied.length > 1) throw errors.validation(`Multiple Pricing Rules tie for ${label}: ${tied.map((candidate) => candidate.name).join(", ")}`);
  return first;
}

function selectAdjustments(candidates: Candidate[]): Candidate[] {
  const plain = candidates.filter((candidate) => !candidate.exclusiveGroup);
  const grouped = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    if (!candidate.exclusiveGroup) continue;
    const bucket = grouped.get(candidate.exclusiveGroup) ?? [];
    bucket.push(candidate);
    grouped.set(candidate.exclusiveGroup, bucket);
  }
  const selected = [...plain];
  for (const [group, rows] of grouped) {
    const first = selectOne(rows, `adjustment group ${group}`);
    if (first) selected.push(first);
  }
  return selected.sort((left, right) => left.name.localeCompare(right.name));
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return (right.priority - left.priority)
    || (right.specificity - left.specificity)
    || left.name.localeCompare(right.name);
}

async function snapshot(
  context: ControllerContext<JsonObject>,
  candidate: Candidate,
  extra: Partial<PricingRuleSnapshot>,
): Promise<PricingRuleSnapshot> {
  const canonical = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Pricing Rule", candidate.name);
  return {
    rule_name: candidate.name,
    ...(canonical ? { rule_version: canonical.version } : {}),
    effect_type: candidate.effect,
    priority: candidate.priority,
    ...(candidate.exclusiveGroup ? { exclusive_group: candidate.exclusiveGroup } : {}),
    ...extra,
  };
}

function adjustmentBasis(value: unknown): PricingAdjustmentBasis {
  const basis = text(value).toUpperCase() || "FIXED";
  if (!["FIXED", "PRICED_QTY", "AREA_SQM", "LENGTH_M", "SET_COUNT"].includes(basis)) {
    throw errors.validation(`Unsupported Pricing Rule adjustment basis ${basis}`);
  }
  return basis as PricingAdjustmentBasis;
}

function adjustmentQtyMicros(input: CommercialPricingPolicyInput, basis: PricingAdjustmentBasis): number {
  if (basis === "FIXED") return ONE;
  if (basis === "PRICED_QTY") return input.pricedQtyMicros;
  const raw = basis === "AREA_SQM" ? input.areaSqm : basis === "LENGTH_M" ? input.lengthM : input.setCount;
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return 0;
  const micros = Math.round(raw * ONE);
  if (!Number.isSafeInteger(micros)) throw errors.validation(`Pricing Rule ${basis} quantity exceeds safe integer range`);
  return micros;
}

function multiplyMinorByQuantity(rateMinor: number, qtyMicros: number, field: string): number {
  if (!Number.isSafeInteger(rateMinor)) throw errors.validation(`${field}: rate must be a safe integer`);
  if (!Number.isSafeInteger(qtyMicros) || qtyMicros < 0) throw errors.validation(`${field}: quantity must be a non-negative safe integer`);
  const product = BigInt(rateMinor) * BigInt(qtyMicros);
  const roundedAbs = ((product < 0n ? -product : product) + 500_000n) / 1_000_000n;
  const value = Number(product < 0n ? -roundedAbs : roundedAbs);
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field}: amount exceeds safe integer range`);
  return value;
}

function moneyMinor(value: unknown, scale: number, label: string): number {
  const minor = toScaledInt(numeric(value, label), scale, label);
  if (minor < 0) throw errors.validation(`${label} cannot be negative`);
  return minor;
}

function signedMoneyMinor(value: unknown, scale: number, label: string): number {
  const minor = toScaledInt(numeric(value, label), scale, label);
  if (!Number.isSafeInteger(minor)) throw errors.validation(`${label} must be a safe monetary integer`);
  return minor;
}

function numeric(value: unknown, label: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${label} must be numeric`);
  return value;
}

function integer(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw errors.validation("Pricing Rule.priority must be an integer");
  return parsed;
}

function disabled(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(normalized(value));
}

function normalized(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function comparable(value: unknown): string | number | boolean | null {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return normalized(value);
  return value == null ? null : normalized(value);
}

function scalar(value: unknown, label: string): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw errors.validation(`${label} must be a string, number or boolean`);
}
