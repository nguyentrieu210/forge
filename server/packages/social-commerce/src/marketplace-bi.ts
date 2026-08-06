import { evaluateMarketplaceFulfillmentSla, type MarketplaceSlaObservation } from "./marketplace-sla.js";

export interface MarketplaceBiPeriod {
  days: number | null;
  from: string | null;
  to: string;
}

export interface MarketplaceBiSlaSummary {
  provider: string;
  orders: number;
  policy_covered_orders: number;
  completed_met: number;
  completed_breached: number;
  open_on_track: number;
  open_at_risk: number;
  open_breached: number;
  not_applicable: number;
  policy_invalid: number;
  compliance_bps: number | null;
}

export interface MarketplaceBiProviderSummary {
  provider: string;
  currency: string;
  orders: number;
  canonical_revenue_minor: number;
  settlement_covered_orders: number;
  inventory_cost_covered_orders: number;
  contribution_covered_orders: number;
  contribution_revenue_minor: number;
  provider_deductions_minor: number;
  provider_credits_minor: number;
  inventory_cogs_minor: number;
  contribution_minor: number;
  contribution_margin_bps: number | null;
  payout_minor: number;
  settlement_variance_minor: number;
  settlement_gross_mismatch_orders: number;
  fx_unresolved_orders: number;
  inventory_cost_anomaly_orders: number;
}

export interface MarketplaceBiDailyPoint {
  date: string;
  currency: string;
  orders: number;
  canonical_revenue_minor: number;
  contribution_covered_orders: number;
  contribution_minor: number;
  sla_breaches: number;
}

export interface MarketplaceBiCurrencySummary {
  currency: string;
  orders: number;
  canonical_revenue_minor: number;
  settlement_covered_orders: number;
  inventory_cost_covered_orders: number;
  contribution_covered_orders: number;
  contribution_revenue_minor: number;
  provider_deductions_minor: number;
  provider_credits_minor: number;
  inventory_cogs_minor: number;
  contribution_minor: number;
  contribution_margin_bps: number | null;
  payout_minor: number;
  settlement_variance_minor: number;
  providers: MarketplaceBiProviderSummary[];
}

export interface MarketplaceBiReport {
  observed_at: string;
  period: MarketplaceBiPeriod;
  currencies: MarketplaceBiCurrencySummary[];
  sla_by_provider: MarketplaceBiSlaSummary[];
  daily: MarketplaceBiDailyPoint[];
  quality: {
    orders: number;
    canonical_submitted_orders: number;
    missing_canonical_orders: number;
    settlement_covered_orders: number;
    inventory_cost_covered_orders: number;
    contribution_covered_orders: number;
    fx_unresolved_orders: number;
    settlement_gross_mismatch_orders: number;
    inventory_cost_anomaly_orders: number;
    sla_policy_covered_orders: number;
  };
}

interface MarketplaceBiRow {
  order_id: string;
  cart_id: string;
  provider: string | null;
  channel_profile: string | null;
  sales_order_name: string | null;
  order_status: string;
  order_currency: string;
  created_at: string;
  sales_order_docstatus: number | null;
  canonical_revenue_minor: number | null;
  company_currency: string | null;
  fulfilled_at: string | null;
  sla_payload: string | null;
  settlement_count: number;
  settlement_gross_minor: number;
  commission_minor: number;
  service_fee_minor: number;
  seller_shipping_fee_minor: number;
  seller_voucher_minor: number;
  refund_minor: number;
  other_deductions_minor: number;
  platform_subsidy_minor: number;
  other_credits_minor: number;
  payout_minor: number;
  settlement_variance_minor: number;
  inventory_cost_entry_count: number;
  inventory_cogs_minor: number;
  inventory_cost_currency: string | null;
  inventory_cost_currency_count: number;
}

interface RowObservation {
  provider: string;
  currency: string;
  date: string;
  canonicalSubmitted: boolean;
  canonicalRevenue: number;
  settlementCovered: boolean;
  inventoryCostCovered: boolean;
  contributionCovered: boolean;
  contribution: number;
  contributionRevenue: number;
  deductions: number;
  credits: number;
  inventoryCogs: number;
  payout: number;
  settlementVariance: number;
  grossMismatch: boolean;
  fxUnresolved: boolean;
  inventoryCostAnomaly: boolean;
  sla: MarketplaceSlaObservation | null;
}

const MAX_REPORT_ROWS = 5000;

/**
 * Read-only marketplace BI projection.
 *
 * Authority boundaries:
 * - revenue comes from the current canonical submitted Sales Order document;
 * - inventory cost comes from canonical Stock Ledger entries for the Delivery Note
 *   and linked Sales Stock Return vouchers;
 * - provider fees/refunds/subsidies come from marketplace settlement evidence;
 * - SLA uses the same metadata-driven evaluator as the Order Cockpit;
 * - contribution is withheld when settlement/cost/FX evidence is incomplete.
 */
export async function buildMarketplaceBiReport(
  db: D1Database,
  tenantId: string,
  days: number | null = 30,
  observedAt = new Date(),
): Promise<MarketplaceBiReport> {
  const observedMs = observedAt.getTime();
  if (!Number.isFinite(observedMs)) throw new Error("Invalid marketplace BI observation time");
  const period = reportPeriod(days, observedAt);
  const result = await db.prepare(REPORT_SQL).bind(
    tenantId,
    period.from,
    period.to,
    MAX_REPORT_ROWS + 1,
  ).all<MarketplaceBiRow>();
  const rows = result.results ?? [];
  if (rows.length > MAX_REPORT_ROWS) throw new Error(`Marketplace BI report exceeds ${MAX_REPORT_ROWS} orders`);

  const observations = rows.map((row) => observeRow(row, observedAt));
  return aggregateReport(observations, period, observedAt.toISOString());
}

function observeRow(row: MarketplaceBiRow, observedAt: Date): RowObservation {
  const provider = normalizedProvider(row.provider, row.cart_id);
  const currency = requiredCode(row.order_currency, "order currency");
  const canonicalSubmitted = Number(row.sales_order_docstatus) === 1 && row.order_status !== "cancelled";
  const canonicalRevenue = canonicalSubmitted ? safeInteger(row.canonical_revenue_minor ?? 0, "canonical revenue") : 0;
  const settlementCovered = safeInteger(row.settlement_count, "settlement count") > 0;
  const inventoryCostEntries = safeInteger(row.inventory_cost_entry_count, "inventory cost entry count");
  const inventoryCogs = safeInteger(row.inventory_cogs_minor, "inventory COGS");
  const inventoryCurrencyCount = safeInteger(row.inventory_cost_currency_count, "inventory cost currency count");
  const inventoryCostCurrency = row.inventory_cost_currency ? requiredCode(row.inventory_cost_currency, "inventory cost currency") : null;
  const companyCurrency = row.company_currency ? requiredCode(row.company_currency, "company currency") : null;
  const inventoryCostCovered = Boolean(row.fulfilled_at) && inventoryCostEntries > 0 && inventoryCurrencyCount === 1;
  const inventoryCostAnomaly = inventoryCostCovered && inventoryCogs < 0;
  const fxUnresolved = canonicalSubmitted && (
    !companyCurrency
    || companyCurrency !== currency
    || (inventoryCostCovered && inventoryCostCurrency !== currency)
  );

  const deductions = settlementCovered ? safeSum([
    row.commission_minor,
    row.service_fee_minor,
    row.seller_shipping_fee_minor,
    row.seller_voucher_minor,
    row.refund_minor,
    row.other_deductions_minor,
  ], "provider deductions") : 0;
  const credits = settlementCovered ? safeSum([row.platform_subsidy_minor, row.other_credits_minor], "provider credits") : 0;
  const payout = settlementCovered ? safeInteger(row.payout_minor, "provider payout") : 0;
  const settlementVariance = settlementCovered ? safeInteger(row.settlement_variance_minor, "settlement variance") : 0;
  const settlementGross = settlementCovered ? safeInteger(row.settlement_gross_minor, "settlement gross") : 0;
  const grossMismatch = settlementCovered && canonicalSubmitted && settlementGross !== canonicalRevenue;
  const contributionCovered = canonicalSubmitted
    && settlementCovered
    && inventoryCostCovered
    && !inventoryCostAnomaly
    && !fxUnresolved;
  const contribution = contributionCovered
    ? safeSum([canonicalRevenue, -inventoryCogs, -deductions, credits], "marketplace contribution")
    : 0;

  const sla = evaluateMarketplaceFulfillmentSla(row.sla_payload, {
    order_status: row.order_status,
    order_created_at: row.created_at,
    fulfilled_at: row.fulfilled_at,
    now: observedAt,
  });

  return {
    provider,
    currency,
    date: row.created_at.slice(0, 10),
    canonicalSubmitted,
    canonicalRevenue,
    settlementCovered,
    inventoryCostCovered,
    contributionCovered,
    contribution,
    contributionRevenue: contributionCovered ? canonicalRevenue : 0,
    deductions,
    credits,
    inventoryCogs: inventoryCostCovered && !inventoryCostAnomaly ? inventoryCogs : 0,
    payout,
    settlementVariance,
    grossMismatch,
    fxUnresolved,
    inventoryCostAnomaly,
    sla,
  };
}

function aggregateReport(observations: RowObservation[], period: MarketplaceBiPeriod, observedAt: string): MarketplaceBiReport {
  const currencyMap = new Map<string, MarketplaceBiCurrencySummary>();
  const providerMap = new Map<string, MarketplaceBiProviderSummary>();
  const slaMap = new Map<string, MarketplaceBiSlaSummary>();
  const dailyMap = new Map<string, MarketplaceBiDailyPoint>();
  let canonicalSubmittedOrders = 0;
  let settlementCoveredOrders = 0;
  let inventoryCostCoveredOrders = 0;
  let contributionCoveredOrders = 0;
  let fxUnresolvedOrders = 0;
  let settlementGrossMismatchOrders = 0;
  let inventoryCostAnomalyOrders = 0;
  let slaPolicyCoveredOrders = 0;

  for (const observation of observations) {
    if (observation.canonicalSubmitted) canonicalSubmittedOrders += 1;
    if (observation.settlementCovered) settlementCoveredOrders += 1;
    if (observation.inventoryCostCovered) inventoryCostCoveredOrders += 1;
    if (observation.contributionCovered) contributionCoveredOrders += 1;
    if (observation.fxUnresolved) fxUnresolvedOrders += 1;
    if (observation.grossMismatch) settlementGrossMismatchOrders += 1;
    if (observation.inventoryCostAnomaly) inventoryCostAnomalyOrders += 1;
    if (observation.sla) slaPolicyCoveredOrders += 1;

    const currency = currencyMap.get(observation.currency) ?? emptyCurrency(observation.currency);
    addFinancial(currency, observation);
    currencyMap.set(observation.currency, currency);

    const providerKey = `${observation.currency}\u0000${observation.provider}`;
    const provider = providerMap.get(providerKey) ?? emptyProvider(observation.provider, observation.currency);
    addFinancial(provider, observation);
    providerMap.set(providerKey, provider);

    const sla = slaMap.get(observation.provider) ?? emptySla(observation.provider);
    addSla(sla, observation.sla);
    slaMap.set(observation.provider, sla);

    const dailyKey = `${observation.date}\u0000${observation.currency}`;
    const daily = dailyMap.get(dailyKey) ?? {
      date: observation.date,
      currency: observation.currency,
      orders: 0,
      canonical_revenue_minor: 0,
      contribution_covered_orders: 0,
      contribution_minor: 0,
      sla_breaches: 0,
    };
    daily.orders += 1;
    daily.canonical_revenue_minor = safeAdd(daily.canonical_revenue_minor, observation.canonicalRevenue, "daily revenue");
    if (observation.contributionCovered) {
      daily.contribution_covered_orders += 1;
      daily.contribution_minor = safeAdd(daily.contribution_minor, observation.contribution, "daily contribution");
    }
    if (observation.sla?.state === "breached") daily.sla_breaches += 1;
    dailyMap.set(dailyKey, daily);
  }

  const currencies = [...currencyMap.values()].sort((left, right) => left.currency.localeCompare(right.currency));
  for (const currency of currencies) {
    currency.providers = [...providerMap.values()]
      .filter((provider) => provider.currency === currency.currency)
      .sort((left, right) => right.canonical_revenue_minor - left.canonical_revenue_minor || left.provider.localeCompare(right.provider));
    finalizeMargin(currency);
    for (const provider of currency.providers) finalizeMargin(provider);
  }
  const slaByProvider = [...slaMap.values()].sort((left, right) => left.provider.localeCompare(right.provider));
  for (const summary of slaByProvider) finalizeSla(summary);

  return {
    observed_at: observedAt,
    period,
    currencies,
    sla_by_provider: slaByProvider,
    daily: [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date) || left.currency.localeCompare(right.currency)),
    quality: {
      orders: observations.length,
      canonical_submitted_orders: canonicalSubmittedOrders,
      missing_canonical_orders: observations.length - canonicalSubmittedOrders,
      settlement_covered_orders: settlementCoveredOrders,
      inventory_cost_covered_orders: inventoryCostCoveredOrders,
      contribution_covered_orders: contributionCoveredOrders,
      fx_unresolved_orders: fxUnresolvedOrders,
      settlement_gross_mismatch_orders: settlementGrossMismatchOrders,
      inventory_cost_anomaly_orders: inventoryCostAnomalyOrders,
      sla_policy_covered_orders: slaPolicyCoveredOrders,
    },
  };
}

function emptyCurrency(currency: string): MarketplaceBiCurrencySummary {
  return {
    currency,
    orders: 0,
    canonical_revenue_minor: 0,
    settlement_covered_orders: 0,
    inventory_cost_covered_orders: 0,
    contribution_covered_orders: 0,
    contribution_revenue_minor: 0,
    provider_deductions_minor: 0,
    provider_credits_minor: 0,
    inventory_cogs_minor: 0,
    contribution_minor: 0,
    contribution_margin_bps: null,
    payout_minor: 0,
    settlement_variance_minor: 0,
    providers: [],
  };
}

function emptyProvider(provider: string, currency: string): MarketplaceBiProviderSummary {
  return {
    provider,
    currency,
    orders: 0,
    canonical_revenue_minor: 0,
    settlement_covered_orders: 0,
    inventory_cost_covered_orders: 0,
    contribution_covered_orders: 0,
    contribution_revenue_minor: 0,
    provider_deductions_minor: 0,
    provider_credits_minor: 0,
    inventory_cogs_minor: 0,
    contribution_minor: 0,
    contribution_margin_bps: null,
    payout_minor: 0,
    settlement_variance_minor: 0,
    settlement_gross_mismatch_orders: 0,
    fx_unresolved_orders: 0,
    inventory_cost_anomaly_orders: 0,
  };
}

function addFinancial(
  target: MarketplaceBiCurrencySummary | MarketplaceBiProviderSummary,
  observation: RowObservation,
): void {
  target.orders += 1;
  target.canonical_revenue_minor = safeAdd(target.canonical_revenue_minor, observation.canonicalRevenue, "canonical revenue total");
  if (observation.settlementCovered) {
    target.settlement_covered_orders += 1;
    target.provider_deductions_minor = safeAdd(target.provider_deductions_minor, observation.deductions, "provider deductions total");
    target.provider_credits_minor = safeAdd(target.provider_credits_minor, observation.credits, "provider credits total");
    target.payout_minor = safeAdd(target.payout_minor, observation.payout, "payout total");
    target.settlement_variance_minor = safeAdd(target.settlement_variance_minor, observation.settlementVariance, "settlement variance total");
  }
  if (observation.inventoryCostCovered && !observation.inventoryCostAnomaly) {
    target.inventory_cost_covered_orders += 1;
    target.inventory_cogs_minor = safeAdd(target.inventory_cogs_minor, observation.inventoryCogs, "inventory COGS total");
  }
  if (observation.contributionCovered) {
    target.contribution_covered_orders += 1;
    target.contribution_revenue_minor = safeAdd(target.contribution_revenue_minor, observation.contributionRevenue, "contribution revenue total");
    target.contribution_minor = safeAdd(target.contribution_minor, observation.contribution, "contribution total");
  }
  if ("settlement_gross_mismatch_orders" in target) {
    if (observation.grossMismatch) target.settlement_gross_mismatch_orders += 1;
    if (observation.fxUnresolved) target.fx_unresolved_orders += 1;
    if (observation.inventoryCostAnomaly) target.inventory_cost_anomaly_orders += 1;
  }
}

function finalizeMargin(target: MarketplaceBiCurrencySummary | MarketplaceBiProviderSummary): void {
  target.contribution_margin_bps = target.contribution_revenue_minor > 0
    ? Math.round(target.contribution_minor * 10_000 / target.contribution_revenue_minor)
    : null;
}

function emptySla(provider: string): MarketplaceBiSlaSummary {
  return {
    provider,
    orders: 0,
    policy_covered_orders: 0,
    completed_met: 0,
    completed_breached: 0,
    open_on_track: 0,
    open_at_risk: 0,
    open_breached: 0,
    not_applicable: 0,
    policy_invalid: 0,
    compliance_bps: null,
  };
}

function addSla(target: MarketplaceBiSlaSummary, observation: MarketplaceSlaObservation | null): void {
  target.orders += 1;
  if (!observation) return;
  target.policy_covered_orders += 1;
  if (observation.state === "policy_invalid") { target.policy_invalid += 1; return; }
  if (observation.state === "not_applicable") { target.not_applicable += 1; return; }
  if (observation.fulfilled_at) {
    if (observation.state === "met") target.completed_met += 1;
    else if (observation.state === "breached") target.completed_breached += 1;
    return;
  }
  if (observation.state === "on_track") target.open_on_track += 1;
  else if (observation.state === "at_risk") target.open_at_risk += 1;
  else if (observation.state === "breached") target.open_breached += 1;
}

function finalizeSla(target: MarketplaceBiSlaSummary): void {
  const completed = target.completed_met + target.completed_breached;
  target.compliance_bps = completed > 0 ? Math.round(target.completed_met * 10_000 / completed) : null;
}

function reportPeriod(days: number | null, observedAt: Date): MarketplaceBiPeriod {
  if (days !== null && (!Number.isSafeInteger(days) || days < 1 || days > 3650)) {
    throw new Error("Marketplace BI days must be an integer from 1 to 3650 or null");
  }
  return {
    days,
    from: days === null ? null : new Date(observedAt.getTime() - days * 86_400_000).toISOString(),
    to: observedAt.toISOString(),
  };
}

function normalizedProvider(provider: string | null, cartId: string): string {
  if (provider?.trim()) return provider.trim();
  const prefix = "marketplace:";
  const source = cartId.startsWith(prefix) ? cartId.slice(prefix.length) : cartId;
  const separator = source.indexOf("-");
  return separator > 0 ? source.slice(0, separator) : "unknown";
}

function requiredCode(value: string, field: string): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized || normalized.length > 32) throw new Error(`Invalid ${field}`);
  return normalized;
}

function safeInteger(value: unknown, field: string): number {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number)) throw new Error(`${field} exceeds safe integer range`);
  return number;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${field} exceeds safe integer range`);
  return result;
}

function safeSum(values: readonly unknown[], field: string): number {
  return values.reduce<number>((sum, value) => safeAdd(sum, safeInteger(value, field), field), 0);
}

const REPORT_SQL = `
WITH marketplace_orders AS (
  SELECT
    o.order_id,o.cart_id,o.sales_order_name,o.status AS order_status,o.currency AS order_currency,o.created_at,
    provider_state.provider,provider_state.channel_profile,
    so.docstatus AS sales_order_docstatus,
    CAST(json_extract(so.payload_json,'$.grand_total_minor') AS INTEGER) AS canonical_revenue_minor,
    json_extract(so.payload_json,'$.company_currency') AS company_currency,
    sla_policy.payload_json AS sla_payload
  FROM social_orders o
  LEFT JOIN marketplace_provider_order_state provider_state
    ON provider_state.tenant_id=o.tenant_id
    AND provider_state.source_key=substr(o.cart_id,length('marketplace:')+1)
  LEFT JOIN documents so
    ON so.tenant_id=o.tenant_id AND so.doctype='Sales Order' AND so.name=o.sales_order_name
  LEFT JOIN documents sla_policy
    ON sla_policy.tenant_id=o.tenant_id
    AND sla_policy.doctype='Marketplace SLA Policy'
    AND sla_policy.name=provider_state.channel_profile
    AND sla_policy.docstatus<>2
  WHERE o.tenant_id=?1 AND o.cart_id LIKE 'marketplace:%'
    AND (?2 IS NULL OR o.created_at>=?2)
    AND o.created_at<=?3
), fulfillment AS (
  SELECT shipment.order_id,MIN(shipment.created_at) AS fulfilled_at
  FROM social_shipments shipment
  JOIN marketplace_orders mo ON mo.order_id=shipment.order_id
  WHERE shipment.tenant_id=?1
  GROUP BY shipment.order_id
), delivery_vouchers AS (
  SELECT DISTINCT f.sales_order,f.voucher_no
  FROM sales_order_fulfillment_entries f
  JOIN marketplace_orders mo ON mo.sales_order_name=f.sales_order
  JOIN documents dn
    ON dn.tenant_id=f.tenant_id AND dn.doctype='Delivery Note' AND dn.name=f.voucher_no
    AND json_extract(dn.payload_json,'$.against_sales_order')=f.sales_order
  WHERE f.tenant_id=?1 AND f.kind='Delivery' AND f.voucher_type='Delivery Note'
), inventory_movements AS (
  SELECT dv.sales_order,s.currency,s.stock_value_difference_minor
  FROM delivery_vouchers dv
  JOIN stock_ledger_entries s
    ON s.tenant_id=?1 AND s.voucher_type='Delivery Note' AND s.voucher_no=dv.voucher_no
  UNION ALL
  SELECT dv.sales_order,s.currency,s.stock_value_difference_minor
  FROM delivery_vouchers dv
  JOIN documents stock_return
    ON stock_return.tenant_id=?1
    AND stock_return.doctype='Stock Return'
    AND json_extract(stock_return.payload_json,'$.return_type')='Sales'
    AND json_extract(stock_return.payload_json,'$.return_against')=dv.voucher_no
  JOIN stock_ledger_entries s
    ON s.tenant_id=?1 AND s.voucher_type='Stock Return' AND s.voucher_no=stock_return.name
), inventory_cost AS (
  SELECT sales_order,
    COUNT(*) AS inventory_cost_entry_count,
    -COALESCE(SUM(stock_value_difference_minor),0) AS inventory_cogs_minor,
    MIN(currency) AS inventory_cost_currency,
    COUNT(DISTINCT currency) AS inventory_cost_currency_count
  FROM inventory_movements
  GROUP BY sales_order
), settlement AS (
  SELECT order_id,
    COUNT(*) AS settlement_count,
    COALESCE(SUM(gross_minor),0) AS settlement_gross_minor,
    COALESCE(SUM(commission_minor),0) AS commission_minor,
    COALESCE(SUM(service_fee_minor),0) AS service_fee_minor,
    COALESCE(SUM(seller_shipping_fee_minor),0) AS seller_shipping_fee_minor,
    COALESCE(SUM(seller_voucher_minor),0) AS seller_voucher_minor,
    COALESCE(SUM(refund_minor),0) AS refund_minor,
    COALESCE(SUM(other_deductions_minor),0) AS other_deductions_minor,
    COALESCE(SUM(platform_subsidy_minor),0) AS platform_subsidy_minor,
    COALESCE(SUM(other_credits_minor),0) AS other_credits_minor,
    COALESCE(SUM(payout_minor),0) AS payout_minor,
    COALESCE(SUM(variance_minor),0) AS settlement_variance_minor
  FROM marketplace_settlement_evidence
  WHERE tenant_id=?1
  GROUP BY order_id
)
SELECT
  mo.order_id,mo.cart_id,mo.provider,mo.channel_profile,mo.sales_order_name,mo.order_status,
  mo.order_currency,mo.created_at,mo.sales_order_docstatus,mo.canonical_revenue_minor,mo.company_currency,
  fulfillment.fulfilled_at,mo.sla_payload,
  COALESCE(settlement.settlement_count,0) AS settlement_count,
  COALESCE(settlement.settlement_gross_minor,0) AS settlement_gross_minor,
  COALESCE(settlement.commission_minor,0) AS commission_minor,
  COALESCE(settlement.service_fee_minor,0) AS service_fee_minor,
  COALESCE(settlement.seller_shipping_fee_minor,0) AS seller_shipping_fee_minor,
  COALESCE(settlement.seller_voucher_minor,0) AS seller_voucher_minor,
  COALESCE(settlement.refund_minor,0) AS refund_minor,
  COALESCE(settlement.other_deductions_minor,0) AS other_deductions_minor,
  COALESCE(settlement.platform_subsidy_minor,0) AS platform_subsidy_minor,
  COALESCE(settlement.other_credits_minor,0) AS other_credits_minor,
  COALESCE(settlement.payout_minor,0) AS payout_minor,
  COALESCE(settlement.settlement_variance_minor,0) AS settlement_variance_minor,
  COALESCE(inventory_cost.inventory_cost_entry_count,0) AS inventory_cost_entry_count,
  COALESCE(inventory_cost.inventory_cogs_minor,0) AS inventory_cogs_minor,
  inventory_cost.inventory_cost_currency,
  COALESCE(inventory_cost.inventory_cost_currency_count,0) AS inventory_cost_currency_count
FROM marketplace_orders mo
LEFT JOIN fulfillment ON fulfillment.order_id=mo.order_id
LEFT JOIN settlement ON settlement.order_id=mo.order_id
LEFT JOIN inventory_cost ON inventory_cost.sales_order=mo.sales_order_name
ORDER BY mo.created_at DESC
LIMIT ?4
`;
