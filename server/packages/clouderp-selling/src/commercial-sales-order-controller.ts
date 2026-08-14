import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { applyUomConversion, pricedQtyMicros } from "../../clouderp-core/src/uom.js";
import { SalesOrderController, alumdoorOrderTotals } from "./controllers.js";
import { resolveCommercialLine } from "./commercial-line-resolver.js";
import { calculateSalesTotals } from "./totals.js";
import { applySelectablePackageChildPricing } from "./sales-package-split-pricing.js";
import type { SalesItem, SalesOrderData } from "./types.js";
import type { PricingRuleSnapshot } from "../../clouderp-pricing/src/commercial-policy.js";

const ALUMDOOR_COMPANY = "ALUMDOOR";

/**
 * Canonical Sales Order pricing path for AlumDoor while preserving the shared legacy
 * controller for other installed apps. Product-specific values live in master/config data.
 */
export class CommercialSalesOrderController extends SalesOrderController {
  override async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const input = context.command.document;
    if (input.company !== ALUMDOOR_COMPANY) return super.normalize(context);

    if (!input.customer) throw errors.validation("Customer is required");
    if (!input.currency) throw errors.validation("Currency is required");
    if (!input.transaction_date) throw errors.validation("Transaction date is required");
    if (!Array.isArray(input.items) || input.items.length === 0) throw errors.validation("At least one item is required");

    const approver = isPricingApprover(context);
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.transaction_date);
    const customer = await context.reader.getMasterRecordData(context.command.tenant_id, "Customer", input.customer);
    if (!customer) throw errors.reference(`Customer ${input.customer} does not exist`);

    const customerGroup = await authoritativeCustomerGroup(context, input, customer);
    const priceListDecision = await authoritativePriceList(context, input, customer, customerGroup);
    const sellingPriceList = priceListDecision.priceList;
    let requiresApproval = priceListDecision.requiresApproval;

    const converted = await applyUomConversion(
      context as unknown as ControllerContext<JsonObject>,
      input.items,
      { transactionKind: "sales" },
    );
    const quotation = await quotationForFreeze(context, input.against_quotation);

    const pricedItems: SalesItem[] = [];
    for (const [index, item] of converted.entries()) {
      const itemMaster = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", item.item_code);
      if (!itemMaster) throw errors.reference(`Item ${item.item_code} does not exist`);

      const priceUom = text(item.rate_uom) || text(item.uom);
      const qtyMicros = pricedQtyMicros(item);
      const pricedQty = Number(fromScaledInt(qtyMicros, 6));
      const submittedRate = submittedNumber(item.rate);
      const submittedDiscount = submittedNumber(item.discount_percentage);

      const frozenSource = quotation ? sourceQuotationLine(quotation, item, index) : null;
      if (frozenSource && hasCommercialSnapshot(frozenSource)) {
        const frozen = rebuildFrozenQuotationLine(frozenSource, item, currency.transactionScale, qtyMicros);
        const rateChanged = submittedRate !== undefined
          && toScaledInt(submittedRate, currency.transactionScale, `${item.item_code}.rate`) !== frozen.rate_minor;
        const discountChanged = submittedDiscount !== undefined
          && toScaledInt(submittedDiscount, 6, `${item.item_code}.discount_percentage`) !== toScaledInt(frozen.discount_percentage ?? "0", 6);
        if (rateChanged || discountChanged) requiresApproval = true;
        pricedItems.push({
          ...item,
          ...frozen,
          ...(rateChanged && submittedRate !== undefined
            ? recomputeManualFrozenRate(frozen, submittedRate, currency.transactionScale, qtyMicros)
            : {}),
          ...(discountChanged && submittedDiscount !== undefined
            ? recomputeManualFrozenDiscount(frozen, submittedDiscount, currency.transactionScale)
            : {}),
          rate_requires_approval: rateChanged,
        });
        continue;
      }

      const facts = trustedCommercialFacts(itemMaster, item, customerGroup, sellingPriceList);
      const resolved = await resolveCommercialLine(context as unknown as ControllerContext<JsonObject>, {
        itemCode: item.item_code,
        priceList: sellingPriceList,
        documentCurrency: input.currency,
        postingDate: input.transaction_date,
        ...(priceUom ? { uom: priceUom } : {}),
        pricedQty,
        partyType: "Customer",
        party: input.customer,
        customerGroup,
        facts,
        ...optionalPositiveFacts(item),
        ...(submittedRate === undefined ? {} : { sellingRateOverride: submittedRate }),
        ...(submittedDiscount === undefined ? {} : { discountPercentageOverride: submittedDiscount }),
      });

      const canonicalRateMinor = canonicalRateFromSnapshot(resolved.base_rate_minor, resolved.pricing_rule_snapshots);
      const canonicalDiscountMicros = canonicalDiscountFromSnapshot(resolved.pricing_rule_snapshots);
      const rateChanged = submittedRate !== undefined && resolved.selling_rate_minor !== canonicalRateMinor;
      const discountChanged = submittedDiscount !== undefined
        && toScaledInt(submittedDiscount, 6, `${item.item_code}.discount_percentage`) !== canonicalDiscountMicros;
      if (rateChanged || discountChanged) requiresApproval = true;

      pricedItems.push({
        ...item,
        ...(resolved.sales_option ? { sales_option: resolved.sales_option } : {}),
        ...(resolved.sales_option_code ? { sales_option_code: resolved.sales_option_code } : {}),
        ...(resolved.sales_option_label ? { sales_option_label: resolved.sales_option_label } : {}),
        ...(resolved.sales_option_version ? { sales_option_version: resolved.sales_option_version } : {}),
        ...(resolved.sales_mode ? { sales_mode: resolved.sales_mode } : {}),
        ...(resolved.sales_package ? { sales_package: resolved.sales_package } : {}),
        price_variant: resolved.price_variant,
        rate: resolved.selling_rate,
        rate_minor: resolved.selling_rate_minor,
        standard_rate: fromScaledInt(canonicalRateMinor, currency.transactionScale),
        base_rate: resolved.base_rate,
        base_rate_minor: resolved.base_rate_minor,
        rate_requires_approval: rateChanged,
        item_price: resolved.item_price,
        discount_percentage: resolved.discount_percentage,
        discount_basis_item_price: resolved.discount_basis_item_price,
        discount_basis_variant: resolved.discount_basis_variant,
        discount_basis_rate: resolved.discount_basis_rate,
        discount_basis_rate_minor: resolved.discount_basis_rate_minor,
        discount_basis_amount: resolved.discount_basis_amount,
        discount_basis_amount_minor: resolved.discount_basis_amount_minor,
        discount_amount: resolved.discount_amount,
        discount_amount_minor: resolved.discount_amount_minor,
        adjustment_amount: resolved.adjustment_amount,
        adjustment_amount_minor: resolved.adjustment_amount_minor,
        taxable_adjustment_amount: resolved.taxable_adjustment_amount,
        taxable_adjustment_amount_minor: resolved.taxable_adjustment_amount_minor,
        net_amount: resolved.net_before_tax,
        net_amount_minor: resolved.net_before_tax_minor,
        pricing_as_of: resolved.pricing_as_of,
        pricing_rule_snapshots: resolved.pricing_rule_snapshots,
        ...(resolved.pricing_rule_snapshots[0]?.rule_name ? { pricing_rule: resolved.pricing_rule_snapshots[0].rule_name } : {}),
      });
    }

    const packagePricedItems = await applySelectablePackageChildPricing(
      context as unknown as ControllerContext<JsonObject>,
      pricedItems,
      input.transaction_date,
      currency.transactionScale,
    );

    const orderDiscount = input.additional_discount_percentage ?? 0;
    const orderDiscountMicros = toScaledInt(orderDiscount, 6, "additional_discount_percentage");
    if (orderDiscountMicros !== 0) requiresApproval = true;
    if (context.command.action === "submit" && requiresApproval && !approver) {
      throw errors.permission("Đơn hàng có giá/chiết khấu/bảng giá khác chính sách; Sales Manager phải duyệt trước khi bán.");
    }

    const totals = calculateSalesTotals(packagePricedItems, input.taxes ?? [], currency.transactionScale, {
      use_priced_quantity: true,
      use_server_line_money: true,
      apply_discount_on: "Net Total",
      additional_discount_percentage: orderDiscount,
    });

    const lineAdjustmentMinor = totals.items.reduce(
      (sum, row) => safeAdd(sum, row.adjustment_amount_minor ?? 0, "surcharge total"),
      0,
    );
    const { extraMinor, ...vatProjection } = alumdoorOrderTotals({
      netTotalMinor: totals.net_total_minor,
      discountAmountMinor: totals.discount_amount_minor,
      vatRate: input.vat_rate,
      // Adjustments already sit inside line net. Passing them again would double count.
      surchargeMinor: 0,
      currencyScale: currency.transactionScale,
    });
    const hasVatProjection = input.vat_rate !== undefined || input.total_amount !== undefined || input.vat_amount !== undefined;
    const adjustedTotals = extraMinor === 0 ? totals : {
      ...totals,
      grand_total_minor: safeAdd(totals.grand_total_minor, extraMinor, "grand total with VAT"),
      grand_total: fromScaledInt(safeAdd(totals.grand_total_minor, extraMinor, "grand total with VAT"), currency.transactionScale),
      rounded_total_minor: safeAdd(totals.rounded_total_minor, extraMinor, "rounded total with VAT"),
      rounded_total: fromScaledInt(safeAdd(totals.rounded_total_minor, extraMinor, "rounded total with VAT"), currency.transactionScale),
    };

    if (context.command.action === "submit") {
      await assertMasterData(context, [
        ["Company", input.company], ["Customer", input.customer], ["Currency", input.currency],
        ...adjustedTotals.items.map((row): [string, string] => ["Item", row.item_code]),
        ...adjustedTotals.taxes.map((tax): [string, string] => ["Account", tax.account]),
      ]);
    }

    return {
      ...input,
      selling_price_list: sellingPriceList,
      customer_group: customerGroup,
      discount_requires_approval: requiresApproval,
      currency_scale: currency.transactionScale,
      ...adjustedTotals,
      surcharge_amount_minor: lineAdjustmentMinor,
      surcharge_amount: fromScaledInt(lineAdjustmentMinor, currency.transactionScale),
      ...(hasVatProjection ? vatProjection : {}),
      ...baseTotals(adjustedTotals, currency, currency.transactionScale),
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      conversion_rate: fromScaledInt(currency.rateMicros, 6),
      conversion_rate_micros: currency.rateMicros,
      delivered_percentage: "0.00",
      billed_percentage: "0.00",
    };
  }
}

interface ResolvedCurrencyContext {
  transactionScale: number;
  companyCurrency: string;
  companyScale: number;
  rateMicros: number;
}

async function authoritativeCustomerGroup(
  context: ControllerContext<SalesOrderData>,
  input: SalesOrderData,
  customer: JsonObject,
): Promise<string> {
  const existing = context.existing?.data;
  if (existing?.customer === input.customer && text(existing.customer_group)) return text(existing.customer_group);
  const group = text(customer.price_group) || text(customer.customer_group);
  if (!group) throw errors.reference(`Customer ${input.customer} must define a pricing/customer group`);
  if (text(input.customer_group) && text(input.customer_group) !== group) {
    throw errors.validation("Customer group is server-derived from Customer master and cannot be changed on the document");
  }
  return group;
}

async function authoritativePriceList(
  context: ControllerContext<SalesOrderData>,
  input: SalesOrderData,
  customer: JsonObject,
  customerGroup: string,
): Promise<{ priceList: string; requiresApproval: boolean }> {
  let expected = text(customer.default_selling_price_list) || text(customer.selling_price_list);
  if (!expected) {
    const group = await context.reader.getMasterRecordData(context.command.tenant_id, "Customer Group", customerGroup);
    expected = text(group?.default_selling_price_list) || text(group?.selling_price_list);
  }
  const supplied = text(input.selling_price_list);
  const priceList = supplied || expected;
  if (!priceList) throw errors.validation("Bảng giá áp dụng là bắt buộc");
  return { priceList, requiresApproval: Boolean(expected && priceList !== expected) };
}

function trustedCommercialFacts(
  itemMaster: JsonObject,
  line: SalesItem,
  customerGroup: string,
  priceList: string,
): Record<string, unknown> {
  return {
    item_code: line.item_code,
    item_group: itemMaster.item_group,
    door_type: itemMaster.door_type,
    inventory_mode: itemMaster.inventory_mode,
    customer_group: customerGroup,
    price_list: priceList,
    sales_mode: line.sales_mode,
    sales_option: line.sales_option,
    finish_type: line.finish_type,
    finish_class: line.finish_class,
    color: line.color,
    width_m: line.width_m,
    height_m: line.height_m,
    billable_area_sqm: line.billable_area_sqm,
    area_per_set_sqm: line.area_per_set_sqm,
    length_m: line.length_m,
    set_count: line.set_count,
    has_butterfly_bracket: line.has_butterfly_bracket,
  };
}

function optionalPositiveFacts(line: SalesItem): { areaSqm?: number; lengthM?: number; setCount?: number } {
  const area = finitePositive(line.billable_area_sqm);
  const length = finitePositive(line.length_m);
  const sets = finitePositive(line.set_count);
  return {
    ...(area === undefined ? {} : { areaSqm: area }),
    ...(length === undefined ? {} : { lengthM: length }),
    ...(sets === undefined ? {} : { setCount: sets }),
  };
}

function canonicalRateFromSnapshot(baseRateMinor: number, snapshots: PricingRuleSnapshot[]): number {
  const rate = snapshots.find((row) => row.effect_type === "RATE_OVERRIDE" && typeof row.rate_minor === "number");
  return rate?.rate_minor ?? baseRateMinor;
}

function canonicalDiscountFromSnapshot(snapshots: PricingRuleSnapshot[]): number {
  const discount = snapshots.find((row) => row.effect_type === "DISCOUNT_PERCENT" && typeof row.discount_percentage === "string");
  return discount?.discount_percentage ? toScaledInt(discount.discount_percentage, 6) : 0;
}

async function quotationForFreeze(
  context: ControllerContext<SalesOrderData>,
  name: string | undefined,
): Promise<CanonicalDocument<JsonObject> | null> {
  if (!name) return null;
  const quotation = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Quotation", name);
  if (!quotation) throw errors.reference(`Quotation ${name} does not exist`);
  if (quotation.docstatus !== 1) throw errors.reference(`Quotation ${name} must be submitted before creating a Sales Order`);
  return quotation;
}

function sourceQuotationLine(quotation: CanonicalDocument<JsonObject>, item: SalesItem, index: number): SalesItem | null {
  const rows = Array.isArray(quotation.data.items) ? quotation.data.items : [];
  const key = text(item.quotation_item);
  if (!key) return null;
  const row = rows.find((value) => value && typeof value === "object" && !Array.isArray(value) && text((value as JsonObject).row_id) === key);
  if (!row) throw errors.reference(`Quotation item ${key} does not belong to Quotation ${quotation.name}`);
  const source = row as unknown as SalesItem;
  if (source.item_code !== item.item_code) throw errors.reference(`Sales Order item ${index + 1} does not match its Quotation item`);
  return source;
}

function hasCommercialSnapshot(source: SalesItem): boolean {
  return Boolean(source.pricing_as_of && source.item_price && source.rate !== undefined && source.discount_amount_minor !== undefined);
}

function rebuildFrozenQuotationLine(source: SalesItem, target: SalesItem, scale: number, qtyMicros: number): Partial<SalesItem> {
  const rateMinor = toScaledInt(source.rate, scale, `${source.item_code}.quotation_rate`);
  const amountMinor = multiplyMinorByQty(rateMinor, qtyMicros, `${source.item_code}.quotation_amount`);
  const basisRateMinor = source.discount_basis_rate_minor ?? rateMinor;
  const basisAmountMinor = multiplyMinorByQty(basisRateMinor, qtyMicros, `${source.item_code}.quotation_discount_basis`);
  const pctMicros = toScaledInt(source.discount_percentage ?? "0", 6, `${source.item_code}.quotation_discount`);
  const discountMinor = percentMinor(basisAmountMinor, pctMicros);
  const adjustmentMinor = frozenAdjustmentTotal(source, target, qtyMicros);
  const netMinor = safeAdd(safeAdd(amountMinor, -discountMinor, "frozen net"), adjustmentMinor, "frozen net");
  return {
    ...(source.sales_option ? { sales_option: source.sales_option } : {}),
    ...(source.sales_option_code ? { sales_option_code: source.sales_option_code } : {}),
    ...(source.sales_option_label ? { sales_option_label: source.sales_option_label } : {}),
    ...(source.sales_option_version ? { sales_option_version: source.sales_option_version } : {}),
    ...(source.sales_mode ? { sales_mode: source.sales_mode } : {}),
    ...(source.sales_package ? { sales_package: source.sales_package } : {}),
    ...(source.price_variant ? { price_variant: source.price_variant } : {}),
    rate: fromScaledInt(rateMinor, scale),
    rate_minor: rateMinor,
    amount: fromScaledInt(amountMinor, scale),
    amount_minor: amountMinor,
    item_price: source.item_price,
    base_rate: source.base_rate,
    base_rate_minor: source.base_rate_minor,
    standard_rate: source.standard_rate ?? source.rate,
    discount_percentage: fromScaledInt(pctMicros, 6),
    ...(source.discount_basis_item_price ? { discount_basis_item_price: source.discount_basis_item_price } : {}),
    ...(source.discount_basis_variant ? { discount_basis_variant: source.discount_basis_variant } : {}),
    discount_basis_rate: fromScaledInt(basisRateMinor, scale),
    discount_basis_rate_minor: basisRateMinor,
    discount_basis_amount: fromScaledInt(basisAmountMinor, scale),
    discount_basis_amount_minor: basisAmountMinor,
    discount_amount: fromScaledInt(discountMinor, scale),
    discount_amount_minor: discountMinor,
    adjustment_amount: fromScaledInt(adjustmentMinor, scale),
    adjustment_amount_minor: adjustmentMinor,
    net_amount: fromScaledInt(netMinor, scale),
    net_amount_minor: netMinor,
    pricing_as_of: source.pricing_as_of,
    pricing_rule_snapshots: structuredClone(source.pricing_rule_snapshots ?? []),
    ...(source.pricing_rule ? { pricing_rule: source.pricing_rule } : {}),
  };
}

function frozenAdjustmentTotal(source: SalesItem, target: SalesItem, qtyMicros: number): number {
  const snapshots = source.pricing_rule_snapshots ?? [];
  let total = 0;
  for (const row of snapshots) {
    if (row.effect_type !== "ADJUSTMENT" || typeof row.rate_minor !== "number" || !row.basis) continue;
    const basis = String(row.basis);
    const basisMicros = basis === "FIXED" ? 1_000_000
      : basis === "PRICED_QTY" ? qtyMicros
      : basis === "AREA_SQM" ? toPositiveMicros(target.billable_area_sqm)
      : basis === "LENGTH_M" ? toPositiveMicros(target.length_m)
      : basis === "SET_COUNT" ? toPositiveMicros(target.set_count)
      : 0;
    if (basisMicros <= 0) continue;
    total = safeAdd(total, multiplyMinorByQty(row.rate_minor, basisMicros, `${row.rule_name}.frozen_adjustment`), "frozen adjustments");
  }
  if (total === 0 && typeof source.adjustment_amount_minor === "number") return source.adjustment_amount_minor;
  return total;
}

function recomputeManualFrozenRate(frozen: Partial<SalesItem>, rate: number, scale: number, qtyMicros: number): Partial<SalesItem> {
  const rateMinor = toScaledInt(rate, scale, "manual quotation-derived rate");
  const amountMinor = multiplyMinorByQty(rateMinor, qtyMicros, "manual quotation-derived amount");
  const basisAmountMinor = frozen.discount_basis_amount_minor ?? amountMinor;
  const pctMicros = toScaledInt(frozen.discount_percentage ?? "0", 6);
  const discountMinor = percentMinor(basisAmountMinor, pctMicros);
  const adjustmentMinor = frozen.adjustment_amount_minor ?? 0;
  const netMinor = safeAdd(safeAdd(amountMinor, -discountMinor, "manual frozen net"), adjustmentMinor, "manual frozen net");
  return {
    rate: fromScaledInt(rateMinor, scale), rate_minor: rateMinor,
    amount: fromScaledInt(amountMinor, scale), amount_minor: amountMinor,
    discount_amount: fromScaledInt(discountMinor, scale), discount_amount_minor: discountMinor,
    net_amount: fromScaledInt(netMinor, scale), net_amount_minor: netMinor,
  };
}

function recomputeManualFrozenDiscount(frozen: Partial<SalesItem>, discount: number, scale: number): Partial<SalesItem> {
  const pctMicros = toScaledInt(discount, 6, "manual quotation-derived discount");
  if (pctMicros < 0 || pctMicros > 100_000_000) throw errors.validation("Discount percentage must be from 0 to 100");
  const basisAmountMinor = frozen.discount_basis_amount_minor ?? frozen.amount_minor ?? 0;
  const discountMinor = percentMinor(basisAmountMinor, pctMicros);
  const amountMinor = frozen.amount_minor ?? 0;
  const adjustmentMinor = frozen.adjustment_amount_minor ?? 0;
  const netMinor = safeAdd(safeAdd(amountMinor, -discountMinor, "manual frozen discount net"), adjustmentMinor, "manual frozen discount net");
  return {
    discount_percentage: fromScaledInt(pctMicros, 6),
    discount_amount: fromScaledInt(discountMinor, scale), discount_amount_minor: discountMinor,
    net_amount: fromScaledInt(netMinor, scale), net_amount_minor: netMinor,
  };
}

async function resolveCurrencyContext(
  context: ControllerContext<SalesOrderData>,
  company: string,
  documentCurrency: string,
  postingAt: string,
): Promise<ResolvedCurrencyContext> {
  const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", documentCurrency);
  const transactionScale = masterCurrencyScale(currencyData, documentCurrency, context.command.action === "submit");
  const companyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", company);
  const companyCurrency = text(companyData?.default_currency) || documentCurrency;
  const companyCurrencyData = companyCurrency === documentCurrency
    ? currencyData
    : await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", companyCurrency);
  const companyScale = masterCurrencyScale(companyCurrencyData, companyCurrency, context.command.action === "submit");
  if (companyCurrency === documentCurrency) return { transactionScale, companyCurrency, companyScale, rateMicros: 1_000_000 };
  const day = postingAt.slice(0, 10);
  for (const name of [`${documentCurrency}:${companyCurrency}:${day}`, `${documentCurrency}:${companyCurrency}`]) {
    const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Exchange Rate", name);
    if (!data || data.disabled === true || data.disabled === 1) continue;
    const rateMicros = toScaledInt(data.rate as string | number, 6, `Exchange Rate ${name}`);
    if (rateMicros <= 0) throw errors.reference(`Exchange Rate ${name} must be positive`);
    return { transactionScale, companyCurrency, companyScale, rateMicros };
  }
  throw errors.reference(`Exchange Rate ${documentCurrency}:${companyCurrency} does not exist or is disabled`);
}

function masterCurrencyScale(data: JsonObject | null, currency: string, required: boolean): number {
  if (!data) {
    if (required) throw errors.reference(`Currency ${currency} does not exist`);
    return 2;
  }
  const raw = data.currency_scale;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 6) {
    if (required) throw errors.reference(`Currency ${currency} must define currency_scale from 0 to 6`);
    return 2;
  }
  return raw;
}

function baseTotals(
  totals: { net_total_minor: number; total_taxes_and_charges_minor: number; grand_total_minor: number },
  currency: ResolvedCurrencyContext,
  sourceScale: number,
): Pick<SalesOrderData, "base_net_total" | "base_net_total_minor" | "base_total_taxes_and_charges" | "base_total_taxes_and_charges_minor" | "base_grand_total" | "base_grand_total_minor"> {
  const baseNet = convertMinor(totals.net_total_minor, sourceScale, currency.rateMicros, currency.companyScale, "base net total");
  const baseTax = convertMinor(totals.total_taxes_and_charges_minor, sourceScale, currency.rateMicros, currency.companyScale, "base tax total");
  const baseGrand = convertMinor(totals.grand_total_minor, sourceScale, currency.rateMicros, currency.companyScale, "base grand total");
  return {
    base_net_total_minor: baseNet, base_net_total: fromScaledInt(baseNet, currency.companyScale),
    base_total_taxes_and_charges_minor: baseTax, base_total_taxes_and_charges: fromScaledInt(baseTax, currency.companyScale),
    base_grand_total_minor: baseGrand, base_grand_total: fromScaledInt(baseGrand, currency.companyScale),
  };
}

function convertMinor(amountMinor: number, sourceScale: number, rateMicros: number, targetScale: number, field: string): number {
  return multiplyScaled(fromScaledInt(amountMinor, sourceScale), sourceScale, fromScaledInt(rateMicros, 6), 6, targetScale, field);
}

async function assertMasterData(context: ControllerContext<SalesOrderData>, records: Array<[string, string]>): Promise<void> {
  for (const [doctype, name] of records) {
    if (!name) continue;
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) {
      throw errors.reference(`${doctype} ${name} does not exist`);
    }
  }
}

function isPricingApprover(context: ControllerContext<SalesOrderData>): boolean {
  return context.command.actor.user_id === "Administrator"
    || context.command.actor.roles.some((role) => role === "Sales Manager" || role === "System Manager");
}

function submittedNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw errors.validation("Submitted pricing values must be numeric");
  return parsed;
}

function finitePositive(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toPositiveMicros(value: unknown): number {
  const parsed = finitePositive(value);
  if (parsed === undefined) return 0;
  const micros = Math.round(parsed * 1_000_000);
  return Number.isSafeInteger(micros) ? micros : 0;
}

function multiplyMinorByQty(rateMinor: number, qtyMicros: number, field: string): number {
  const result = Number((BigInt(rateMinor) * BigInt(qtyMicros) + 500_000n) / 1_000_000n);
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function percentMinor(amountMinor: number, pctMicros: number): number {
  const result = Number((BigInt(amountMinor) * BigInt(pctMicros) + 50_000_000n) / 100_000_000n);
  if (!Number.isSafeInteger(result)) throw errors.validation("Discount exceeds safe integer range");
  return result;
}

function safeAdd(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} exceeds safe integer range`);
  return value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}
