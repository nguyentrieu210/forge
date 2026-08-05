import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { D1RolloutPurchaseAllocationDomainStore } from "../../document-kernel/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, MetadataPermissionService } from "../../frappe-model/src/index.js";
import type { PaymentEntryData, SalesInvoiceData } from "../../clouderp-selling/src/types.js";
import { MARKETPLACE_PROVIDERS, type MarketplaceProvider } from "./marketplace-order.js";

export interface MarketplaceSettlementInput {
  order_id: string;
  provider: MarketplaceProvider;
  external_settlement_id: string;
  currency: string;
  gross_minor: number;
  commission_minor?: number;
  service_fee_minor?: number;
  seller_shipping_fee_minor?: number;
  seller_voucher_minor?: number;
  refund_minor?: number;
  other_deductions_minor?: number;
  platform_subsidy_minor?: number;
  other_credits_minor?: number;
  payout_minor: number;
  occurred_at: string;
  sales_invoice_name?: string;
  payment_entry_name?: string;
}

export interface MarketplaceSettlementResult {
  settlement_id: string;
  order_id: string;
  provider: MarketplaceProvider;
  external_settlement_id: string;
  currency: string;
  expected_payout_minor: number;
  payout_minor: number;
  variance_minor: number;
  status: "reconciled" | "variance";
  cash_evidence_verified: boolean;
  accounting_posted: false;
  accounting_dependency: string;
  idempotent_replay: boolean;
}

interface OperationalOrder {
  order_id: string;
  cart_id: string;
  sales_order_name: string | null;
  currency: string;
}

interface SettlementRow {
  settlement_id: string;
  order_id: string;
  provider: MarketplaceProvider;
  external_settlement_id: string;
  currency: string;
  expected_payout_minor: number;
  payout_minor: number;
  variance_minor: number;
  status: "reconciled" | "variance";
  cash_evidence_verified: number;
}

const ACCOUNTING_DEPENDENCY = "Marketplace fee/voucher/refund accounting remains canonical Finance authority; this record is provider settlement evidence, not a GL or Payment Ledger posting.";

/**
 * Reconciles a provider settlement without inventing a marketplace sub-ledger.
 * Gross/fee/voucher/subsidy components are immutable evidence. Optional canonical
 * Sales Invoice + Payment Entry references prove the cash receipt belongs to this
 * order, but fee accounting still belongs to Finance.
 */
export async function reconcileMarketplaceSettlement(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  raw: MarketplaceSettlementInput,
): Promise<MarketplaceSettlementResult> {
  const input = normalizeSettlementInput(raw);
  const order = await requireMarketplaceOrder(db, tenantId, input.order_id, input.provider, input.currency);
  const settlementId = await settlementIdentity(input.provider, input.external_settlement_id);
  const expectedPayout = calculateExpectedMarketplacePayout(input);
  const variance = input.payout_minor - expectedPayout;
  if (!Number.isSafeInteger(expectedPayout) || !Number.isSafeInteger(variance)) throw errors.validation("Settlement calculation exceeds safe integer range");

  const cashEvidenceVerified = input.sales_invoice_name || input.payment_entry_name
    ? await verifyCanonicalCashEvidence(db, tenantId, actor, order, input)
    : false;

  const status: "reconciled" | "variance" = variance === 0 ? "reconciled" : "variance";
  const existing = await readSettlement(db, tenantId, settlementId);
  if (existing) {
    assertReplay(existing, input, expectedPayout, variance, status, cashEvidenceVerified);
    return settlementResult(existing, true);
  }

  const now = new Date().toISOString();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO marketplace_settlement_evidence(
      tenant_id,settlement_id,order_id,provider,external_settlement_id,currency,
      gross_minor,commission_minor,service_fee_minor,seller_shipping_fee_minor,seller_voucher_minor,
      refund_minor,other_deductions_minor,platform_subsidy_minor,other_credits_minor,
      expected_payout_minor,payout_minor,variance_minor,sales_invoice_name,payment_entry_name,
      cash_evidence_verified,status,occurred_at,created_at,modified_at
    ) VALUES(
      ?1,?2,?3,?4,?5,?6,
      ?7,?8,?9,?10,?11,
      ?12,?13,?14,?15,
      ?16,?17,?18,?19,?20,
      ?21,?22,?23,?24,?24
    )
  `).bind(
    tenantId,
    settlementId,
    input.order_id,
    input.provider,
    input.external_settlement_id,
    input.currency,
    input.gross_minor,
    input.commission_minor,
    input.service_fee_minor,
    input.seller_shipping_fee_minor,
    input.seller_voucher_minor,
    input.refund_minor,
    input.other_deductions_minor,
    input.platform_subsidy_minor,
    input.other_credits_minor,
    expectedPayout,
    input.payout_minor,
    variance,
    input.sales_invoice_name ?? null,
    input.payment_entry_name ?? null,
    cashEvidenceVerified ? 1 : 0,
    status,
    input.occurred_at,
    now,
  ).run();

  if ((result.meta?.changes ?? 0) !== 1) {
    const raced = await readSettlement(db, tenantId, settlementId);
    if (!raced) throw errors.idempotency();
    assertReplay(raced, input, expectedPayout, variance, status, cashEvidenceVerified);
    return settlementResult(raced, true);
  }
  const stored = await readSettlement(db, tenantId, settlementId);
  if (!stored) throw errors.ledger("Marketplace settlement evidence was not persisted");
  return settlementResult(stored, false);
}

export async function listMarketplaceSettlements(
  db: D1Database,
  tenantId: string,
  limit = 100,
): Promise<Array<SettlementRow & { cash_evidence_verified: boolean }>> {
  const bounded = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  const result = await db.prepare(`
    SELECT settlement_id,order_id,provider,external_settlement_id,currency,
      expected_payout_minor,payout_minor,variance_minor,status,cash_evidence_verified
    FROM marketplace_settlement_evidence
    WHERE tenant_id=?1
    ORDER BY occurred_at DESC
    LIMIT ?2
  `).bind(tenantId, bounded).all<SettlementRow>();
  return (result.results ?? []).map((row) => ({ ...row, cash_evidence_verified: Number(row.cash_evidence_verified) === 1 }));
}

export function calculateExpectedMarketplacePayout(input: Pick<MarketplaceSettlementInput,
  "gross_minor" | "commission_minor" | "service_fee_minor" | "seller_shipping_fee_minor" |
  "seller_voucher_minor" | "refund_minor" | "other_deductions_minor" | "platform_subsidy_minor" | "other_credits_minor"
>): number {
  const deductions = safeSum([
    input.commission_minor ?? 0,
    input.service_fee_minor ?? 0,
    input.seller_shipping_fee_minor ?? 0,
    input.seller_voucher_minor ?? 0,
    input.refund_minor ?? 0,
    input.other_deductions_minor ?? 0,
  ], "settlement deductions");
  const credits = safeSum([input.platform_subsidy_minor ?? 0, input.other_credits_minor ?? 0], "settlement credits");
  const expected = input.gross_minor - deductions + credits;
  if (!Number.isSafeInteger(expected)) throw errors.validation("Expected marketplace payout exceeds safe integer range");
  return expected;
}

async function requireMarketplaceOrder(
  db: D1Database,
  tenantId: string,
  orderId: string,
  provider: MarketplaceProvider,
  currency: string,
): Promise<OperationalOrder> {
  const order = await db.prepare(`
    SELECT order_id,cart_id,sales_order_name,currency
    FROM social_orders WHERE tenant_id=?1 AND order_id=?2 LIMIT 1
  `).bind(tenantId, orderId).first<OperationalOrder>();
  if (!order?.sales_order_name || !order.cart_id.startsWith(`marketplace:${provider}-`)) {
    throw errors.reference(`Marketplace order ${orderId} for provider ${provider} not found`);
  }
  if (order.currency !== currency) throw errors.reference("Settlement currency does not match marketplace order currency");
  return order;
}

async function verifyCanonicalCashEvidence(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  order: OperationalOrder,
  input: Required<Pick<MarketplaceSettlementInput, "sales_invoice_name" | "payment_entry_name">> & MarketplaceSettlementInput,
): Promise<boolean> {
  if (!input.sales_invoice_name || !input.payment_entry_name) {
    throw errors.validation("sales_invoice_name and payment_entry_name must be supplied together");
  }
  const metadata = new D1MetadataStore(db);
  const access = new D1DocumentAccessStore(db);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const store = new D1RolloutPurchaseAllocationDomainStore(db);
  const invoice = await store.getDocument<SalesInvoiceData>(tenantId, "Sales Invoice", input.sales_invoice_name);
  const payment = await store.getDocument<PaymentEntryData>(tenantId, "Payment Entry", input.payment_entry_name);
  if (!invoice || invoice.docstatus !== 1) throw errors.reference(`Submitted Sales Invoice ${input.sales_invoice_name} is required`);
  if (!payment || payment.docstatus !== 1) throw errors.reference(`Submitted Payment Entry ${input.payment_entry_name} is required`);
  await permissions.assert({ actor, tenantId, doctype: "Sales Invoice", name: input.sales_invoice_name, owner: invoice.owner, data: invoice.data as unknown as JsonObject, action: "read" });
  await permissions.assert({ actor, tenantId, doctype: "Payment Entry", name: input.payment_entry_name, owner: payment.owner, data: payment.data as unknown as JsonObject, action: "read" });
  if (invoice.data.against_sales_order !== order.sales_order_name) {
    throw errors.reference(`Sales Invoice ${input.sales_invoice_name} does not bill ${order.sales_order_name}`);
  }
  if (invoice.data.currency !== input.currency || payment.data.currency !== input.currency) {
    throw errors.reference("Canonical invoice/payment currency does not match provider settlement currency");
  }
  if (payment.data.payment_type !== "Receive" || payment.data.party_type !== "Customer" || payment.data.party !== invoice.data.customer) {
    throw errors.reference(`Payment Entry ${input.payment_entry_name} is not a customer receipt for the marketplace invoice`);
  }
  const allocated = (payment.data.references ?? [])
    .filter((reference) => reference.reference_doctype === "Sales Invoice" && reference.reference_name === input.sales_invoice_name)
    .reduce((sum, reference) => safeAdd(sum, minor(reference.allocated_amount_minor, "allocated_amount_minor")), 0);
  if (allocated !== input.payout_minor) {
    throw errors.reference("Payment Entry allocation does not equal provider payout evidence", {
      payout_minor: input.payout_minor,
      allocated_minor: allocated,
    });
  }
  return true;
}

function normalizeSettlementInput(input: MarketplaceSettlementInput): Required<Omit<MarketplaceSettlementInput, "sales_invoice_name" | "payment_entry_name">> & Pick<MarketplaceSettlementInput, "sales_invoice_name" | "payment_entry_name"> {
  if (!MARKETPLACE_PROVIDERS.includes(input.provider)) throw errors.validation("Unsupported marketplace provider");
  const normalized = {
    order_id: requiredText(input.order_id, "order_id", 240),
    provider: input.provider,
    external_settlement_id: requiredText(input.external_settlement_id, "external_settlement_id", 240),
    currency: requiredText(input.currency, "currency", 32).toUpperCase(),
    gross_minor: nonNegativeMinor(input.gross_minor, "gross_minor"),
    commission_minor: nonNegativeMinor(input.commission_minor ?? 0, "commission_minor"),
    service_fee_minor: nonNegativeMinor(input.service_fee_minor ?? 0, "service_fee_minor"),
    seller_shipping_fee_minor: nonNegativeMinor(input.seller_shipping_fee_minor ?? 0, "seller_shipping_fee_minor"),
    seller_voucher_minor: nonNegativeMinor(input.seller_voucher_minor ?? 0, "seller_voucher_minor"),
    refund_minor: nonNegativeMinor(input.refund_minor ?? 0, "refund_minor"),
    other_deductions_minor: nonNegativeMinor(input.other_deductions_minor ?? 0, "other_deductions_minor"),
    platform_subsidy_minor: nonNegativeMinor(input.platform_subsidy_minor ?? 0, "platform_subsidy_minor"),
    other_credits_minor: nonNegativeMinor(input.other_credits_minor ?? 0, "other_credits_minor"),
    payout_minor: nonNegativeMinor(input.payout_minor, "payout_minor"),
    occurred_at: isoDateTime(input.occurred_at, "occurred_at"),
    ...(input.sales_invoice_name ? { sales_invoice_name: requiredText(input.sales_invoice_name, "sales_invoice_name", 200) } : {}),
    ...(input.payment_entry_name ? { payment_entry_name: requiredText(input.payment_entry_name, "payment_entry_name", 200) } : {}),
  };
  if (Boolean(normalized.sales_invoice_name) !== Boolean(normalized.payment_entry_name)) {
    throw errors.validation("sales_invoice_name and payment_entry_name must be supplied together");
  }
  return normalized;
}

async function settlementIdentity(provider: MarketplaceProvider, externalSettlementId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([provider, externalSettlementId])));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `mps-${hex.slice(0, 40)}`;
}

async function readSettlement(db: D1Database, tenantId: string, settlementId: string): Promise<SettlementRow | null> {
  return db.prepare(`
    SELECT settlement_id,order_id,provider,external_settlement_id,currency,
      expected_payout_minor,payout_minor,variance_minor,status,cash_evidence_verified
    FROM marketplace_settlement_evidence
    WHERE tenant_id=?1 AND settlement_id=?2 LIMIT 1
  `).bind(tenantId, settlementId).first<SettlementRow>();
}

function assertReplay(
  row: SettlementRow,
  input: ReturnType<typeof normalizeSettlementInput> extends Promise<infer _> ? never : never,
  expectedPayout: number,
  variance: number,
  status: "reconciled" | "variance",
  cashVerified: boolean,
): void {
  const value = input as unknown as MarketplaceSettlementInput;
  if (row.order_id !== value.order_id
    || row.provider !== value.provider
    || row.external_settlement_id !== value.external_settlement_id
    || row.currency !== value.currency
    || Number(row.expected_payout_minor) !== expectedPayout
    || Number(row.payout_minor) !== value.payout_minor
    || Number(row.variance_minor) !== variance
    || row.status !== status
    || Number(row.cash_evidence_verified) !== (cashVerified ? 1 : 0)) throw errors.idempotency();
}

function settlementResult(row: SettlementRow, replay: boolean): MarketplaceSettlementResult {
  return {
    settlement_id: row.settlement_id,
    order_id: row.order_id,
    provider: row.provider,
    external_settlement_id: row.external_settlement_id,
    currency: row.currency,
    expected_payout_minor: Number(row.expected_payout_minor),
    payout_minor: Number(row.payout_minor),
    variance_minor: Number(row.variance_minor),
    status: row.status,
    cash_evidence_verified: Number(row.cash_evidence_verified) === 1,
    accounting_posted: false,
    accounting_dependency: ACCOUNTING_DEPENDENCY,
    idempotent_replay: replay,
  };
}

function nonNegativeMinor(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw errors.validation(`${field} must be a non-negative safe integer`);
  return value;
}
function minor(value: number | undefined, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.reference(`${field} is missing from canonical finance evidence`);
  return value!;
}
function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Settlement arithmetic exceeds safe integer range");
  return value;
}
function safeSum(values: number[], label: string): number {
  return values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw errors.validation(`${label} contains invalid amount`);
    return safeAdd(sum, value);
  }, 0);
}
function requiredText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}
function isoDateTime(value: string, field: string): string {
  const normalized = requiredText(value, field, 64);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be an ISO date-time`);
  return new Date(parsed).toISOString();
}
