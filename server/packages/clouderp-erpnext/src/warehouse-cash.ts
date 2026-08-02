import type {
  CanonicalDocument,
  GeneralLedgerEntry,
  JsonObject,
  MutationPlan,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";

const APPROVER_ROLES = new Set([
  "Warehouse Cash Manager",
  "Chủ xưởng",
  "Chief Accountant",
  "Kế toán trưởng",
  "Accounts Manager",
  "System Manager",
]);
const INCOMING_TYPES = new Set(["Thu", "Nạp quỹ", "Hoàn ứng", "Điều chỉnh tăng"]);
const OUTGOING_TYPES = new Set(["Chi", "Hoàn quỹ", "Tạm ứng", "Điều chỉnh giảm"]);
const ADJUSTMENT_TYPES = new Set(["Điều chỉnh tăng", "Điều chỉnh giảm"]);
type CashFlow = "incoming" | "outgoing";

interface WarehouseCashFundData extends JsonObject {
  fund_code: string;
  fund_name: string;
  company: string;
  warehouse: string;
  cash_account: string;
  currency: string;
  custodian_user: string;
  cost_center?: string;
  daily_limit?: string | number;
  max_balance?: string | number;
  disabled?: boolean | number;
  note?: string;
  currency_scale?: number;
  daily_limit_minor?: number;
  max_balance_minor?: number;
}

interface WarehouseCashVoucherData extends JsonObject {
  fund: string;
  posting_date: string;
  voucher_type: string;
  amount: string | number;
  purpose: string;
  counter_account: string;
  counterparty_type: string;
  employee?: string;
  supplier?: string;
  customer?: string;
  counterparty_name?: string;
  source_doctype?: string;
  source_name?: string;
  purchase_receipt?: string;
  stock_entry?: string;
  cash_count?: string;
  correction_reason?: string;
  receipt_attachment?: string;
  company?: string;
  warehouse?: string;
  cash_account?: string;
  currency?: string;
  currency_scale?: number;
  amount_minor?: number;
  flow_direction?: CashFlow;
  cost_center?: string;
  approved_by?: string;
  approved_on?: string;
}

interface WarehouseCashTransferData extends JsonObject {
  posting_date: string;
  from_fund: string;
  to_fund: string;
  amount: string | number;
  purpose: string;
  handover_by: string;
  received_by: string;
  attachment?: string;
  company?: string;
  currency?: string;
  currency_scale?: number;
  amount_minor?: number;
  approved_by?: string;
  approved_on?: string;
}

interface WarehouseCashCountData extends JsonObject {
  fund: string;
  count_type: string;
  counted_at: string;
  counted_balance: string | number;
  variance_reason?: string;
  handover_from?: string;
  handover_to?: string;
  attachment?: string;
  company?: string;
  warehouse?: string;
  cash_account?: string;
  currency?: string;
  currency_scale?: number;
  system_balance?: string;
  system_balance_minor?: number;
  counted_balance_minor?: number;
  variance?: string;
  variance_minor?: number;
  approved_by?: string;
  approved_on?: string;
}

export class WarehouseCashFundController implements DocumentController<WarehouseCashFundData> {
  readonly doctype = "Warehouse Cash Fund";

  async buildPlan(context: ControllerContext<WarehouseCashFundData>): Promise<MutationPlan<WarehouseCashFundData>> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle("Warehouse Cash Fund is configuration and cannot be submitted or cancelled");
    }
    const data = await normalizeFund(context);
    return plan(context, document(context, data, 0, data.disabled ? "Disabled" : "Active"), []);
  }
}

export class WarehouseCashVoucherController implements DocumentController<WarehouseCashVoucherData> {
  readonly doctype = "Warehouse Cash Voucher";

  async buildPlan(context: ControllerContext<WarehouseCashVoucherData>): Promise<MutationPlan<WarehouseCashVoucherData>> {
    if (context.command.action === "cancel") {
      const existing = requireExisting(context);
      assertApprover(context, false);
      const data = structuredClone(existing.data);
      await assertUnlocked(context, requiredText(data.company, "company"), requiredText(data.posting_date, "posting_date"));
      const original = await context.reader.getVoucherGlEntries(context.command.tenant_id, this.doctype, existing.name, existing.version);
      if (!original.length) throw errors.lifecycle("Warehouse cash voucher has no submitted GL to reverse");
      const fund = await requireFund(context, requiredText(data.fund, "fund"));
      await assertReverseBalance(context, fund, original);
      return plan(context, document(context, data, 2, "Cancelled"), reverseGl(original));
    }
    const data = await normalizeVoucher(context);
    const docstatus = nextDocStatus(context.command.action);
    return plan(
      context,
      document(context, data, docstatus, docstatus === 1 ? "Approved" : "Draft"),
      context.command.action === "submit" ? voucherGl(data) : [],
    );
  }
}

export class WarehouseCashTransferController implements DocumentController<WarehouseCashTransferData> {
  readonly doctype = "Warehouse Cash Transfer";

  async buildPlan(context: ControllerContext<WarehouseCashTransferData>): Promise<MutationPlan<WarehouseCashTransferData>> {
    if (context.command.action === "cancel") {
      const existing = requireExisting(context);
      assertApprover(context, false);
      const data = structuredClone(existing.data);
      await assertUnlocked(context, requiredText(data.company, "company"), requiredText(data.posting_date, "posting_date"));
      const original = await context.reader.getVoucherGlEntries(context.command.tenant_id, this.doctype, existing.name, existing.version);
      if (!original.length) throw errors.lifecycle("Warehouse cash transfer has no submitted GL to reverse");
      const fromFund = await requireFund(context, requiredText(data.from_fund, "from_fund"));
      const toFund = await requireFund(context, requiredText(data.to_fund, "to_fund"));
      await assertReverseBalance(context, fromFund, original);
      await assertReverseBalance(context, toFund, original);
      return plan(context, document(context, data, 2, "Cancelled"), reverseGl(original));
    }
    const data = await normalizeTransfer(context);
    const docstatus = nextDocStatus(context.command.action);
    const gl = context.command.action === "submit" ? await transferGl(context, data) : [];
    return plan(context, document(context, data, docstatus, docstatus === 1 ? "Approved" : "Draft"), gl);
  }
}

export class WarehouseCashCountController implements DocumentController<WarehouseCashCountData> {
  readonly doctype = "Warehouse Cash Count";

  async buildPlan(context: ControllerContext<WarehouseCashCountData>): Promise<MutationPlan<WarehouseCashCountData>> {
    if (context.command.action === "cancel") {
      const existing = requireExisting(context);
      assertApprover(context, false);
      return plan(context, document(context, structuredClone(existing.data), 2, "Cancelled"), []);
    }
    const data = await normalizeCount(context);
    const docstatus = nextDocStatus(context.command.action);
    return plan(context, document(context, data, docstatus, docstatus === 1 ? "Confirmed" : "Draft"), []);
  }
}

async function normalizeFund(context: ControllerContext<WarehouseCashFundData>): Promise<WarehouseCashFundData> {
  const input = context.command.document;
  const company = requiredText(input.company, "company");
  const warehouse = requiredText(input.warehouse, "warehouse");
  const cashAccount = requiredText(input.cash_account, "cash_account");
  const currency = requiredText(input.currency, "currency");
  const companyData = await requireMaster(context, "Company", company);
  const companyCurrency = typeof companyData.default_currency === "string" ? companyData.default_currency : "";
  if (!companyCurrency) throw errors.reference(`Company ${company} must define default_currency`);
  if (companyCurrency !== currency) throw errors.reference("Warehouse cash fund currency must equal company default currency");
  const currencyData = await requireMaster(context, "Currency", currency);
  const scale = typeof currencyData.currency_scale === "number" ? currencyData.currency_scale : 2;
  const warehouseData = await requireMaster(context, "Warehouse", warehouse);
  if (typeof warehouseData.company === "string" && warehouseData.company && warehouseData.company !== company) {
    throw errors.reference("Warehouse belongs to another company");
  }
  const accountData = await requireMaster(context, "Account", cashAccount);
  assertAccount(accountData, company, currency, true);
  const custodian = requiredText(input.custodian_user, "custodian_user");
  await assertReference(context, "User", custodian);
  const costCenter = optionalText(input.cost_center);
  if (costCenter) {
    const costCenterData = await requireMaster(context, "Cost Center", costCenter);
    if (typeof costCenterData.company === "string" && costCenterData.company && costCenterData.company !== company) {
      throw errors.reference("Cost Center belongs to another company");
    }
  }
  const dailyLimit = nonNegativeMoney(input.daily_limit, scale, "daily_limit");
  const maxBalance = nonNegativeMoney(input.max_balance, scale, "max_balance");
  const disabled = Boolean(input.disabled);
  if (context.existing) {
    const projection = await fundProjection(context, context.command.aggregate.name);
    const mappingChanged = ["company", "warehouse", "cash_account", "currency"].some(
      (field) => context.existing?.data[field] !== input[field],
    );
    if (mappingChanged && projection.hasActivity) {
      throw errors.lifecycle("Warehouse cash fund accounting mapping cannot change after ledger activity exists");
    }
    if (disabled && !Boolean(context.existing.data.disabled) && projection.balanceMinor !== 0) {
      throw errors.lifecycle("Warehouse cash fund with non-zero balance cannot be disabled");
    }
  }
  return {
    fund_code: requiredText(input.fund_code, "fund_code"),
    fund_name: requiredText(input.fund_name, "fund_name"),
    company,
    warehouse,
    cash_account: cashAccount,
    currency,
    custodian_user: custodian,
    ...(costCenter ? { cost_center: costCenter } : {}),
    daily_limit: fromScaledInt(dailyLimit, scale),
    max_balance: fromScaledInt(maxBalance, scale),
    disabled,
    ...(optionalText(input.note) ? { note: optionalText(input.note) } : {}),
    currency_scale: scale,
    daily_limit_minor: dailyLimit,
    max_balance_minor: maxBalance,
  };
}

async function normalizeVoucher(context: ControllerContext<WarehouseCashVoucherData>): Promise<WarehouseCashVoucherData> {
  const input = context.command.document;
  const fundName = requiredText(input.fund, "fund");
  const fund = await requireFund(context, fundName);
  const postingDate = dateText(input.posting_date, "posting_date");
  const voucherType = requiredText(input.voucher_type, "voucher_type");
  const flow = cashFlow(voucherType);
  const scale = fund.data.currency_scale ?? 2;
  const amountMinor = positiveMoney(input.amount, scale, "amount");
  const counterAccount = requiredText(input.counter_account, "counter_account");
  if (counterAccount === fund.data.cash_account) throw errors.validation("counter_account must differ from the fund cash account");
  assertAccount(await requireMaster(context, "Account", counterAccount), fund.data.company, fund.data.currency, false);
  const counterpartyType = requiredText(input.counterparty_type, "counterparty_type");
  const party = await counterparty(context, counterpartyType, input);

  const sourceDoctype = optionalText(input.source_doctype);
  const sourceName = optionalText(input.source_name);
  if (Boolean(sourceDoctype) !== Boolean(sourceName)) throw errors.validation("source_doctype and source_name must be supplied together");
  if (sourceDoctype && sourceName) {
    const source = await context.reader.getDocument<JsonObject>(context.command.tenant_id, sourceDoctype, sourceName);
    if (!source) throw errors.reference(`${sourceDoctype} ${sourceName} does not exist in this tenant`);
  }
  const purchaseReceipt = optionalText(input.purchase_receipt);
  const stockEntry = optionalText(input.stock_entry);
  if (purchaseReceipt) await assertReference(context, "Purchase Receipt", purchaseReceipt);
  if (stockEntry) await assertReference(context, "Stock Entry", stockEntry);

  const cashCount = optionalText(input.cash_count);
  const correctionReason = optionalText(input.correction_reason);
  if (ADJUSTMENT_TYPES.has(voucherType)) {
    if (!cashCount || !correctionReason) throw errors.validation("Cash count and correction reason are required for adjustment vouchers");
    const count = await context.reader.getDocument<WarehouseCashCountData>(context.command.tenant_id, "Warehouse Cash Count", cashCount);
    if (!count || count.docstatus !== 1 || count.data.fund !== fundName) {
      throw errors.reference("Adjustment voucher must reference a confirmed cash count for the same fund");
    }
  }
  if ((voucherType === "Tạm ứng" || voucherType === "Hoàn ứng") && (counterpartyType !== "Nhân viên" || !party.employee)) {
    throw errors.validation(`${voucherType} requires an employee counterparty`);
  }

  let approvedBy = "";
  let approvedOn = "";
  if (context.command.action === "submit") {
    assertApprover(context, true);
    await assertUnlocked(context, fund.data.company, postingDate);
    const projection = await fundProjection(context, fundName);
    const nextBalance = projection.balanceMinor + (flow === "incoming" ? amountMinor : -amountMinor);
    if (nextBalance < 0) throw errors.lifecycle("Warehouse cash fund does not have enough cash for this payment");
    const maxBalance = fund.data.max_balance_minor ?? 0;
    if (maxBalance > 0 && nextBalance > maxBalance) throw errors.lifecycle("Warehouse cash fund maximum balance would be exceeded");
    if (flow === "outgoing" && (fund.data.daily_limit_minor ?? 0) > 0) {
      const spent = await dailyOutgoing(context, fundName, postingDate);
      if (spent + amountMinor > (fund.data.daily_limit_minor ?? 0)) {
        throw errors.lifecycle("Warehouse cash fund daily spending limit would be exceeded");
      }
    }
    approvedBy = context.command.actor.user_id;
    approvedOn = context.now;
  }

  return {
    fund: fundName,
    posting_date: postingDate,
    voucher_type: voucherType,
    amount: fromScaledInt(amountMinor, scale),
    purpose: requiredText(input.purpose, "purpose"),
    counter_account: counterAccount,
    counterparty_type: counterpartyType,
    ...(party.employee ? { employee: party.employee } : {}),
    ...(party.supplier ? { supplier: party.supplier } : {}),
    ...(party.customer ? { customer: party.customer } : {}),
    ...(party.name ? { counterparty_name: party.name } : {}),
    ...(sourceDoctype ? { source_doctype: sourceDoctype, source_name: sourceName } : {}),
    ...(purchaseReceipt ? { purchase_receipt: purchaseReceipt } : {}),
    ...(stockEntry ? { stock_entry: stockEntry } : {}),
    ...(cashCount ? { cash_count: cashCount } : {}),
    ...(correctionReason ? { correction_reason: correctionReason } : {}),
    ...(optionalText(input.receipt_attachment) ? { receipt_attachment: optionalText(input.receipt_attachment) } : {}),
    company: fund.data.company,
    warehouse: fund.data.warehouse,
    cash_account: fund.data.cash_account,
    currency: fund.data.currency,
    currency_scale: scale,
    amount_minor: amountMinor,
    flow_direction: flow,
    ...(fund.data.cost_center ? { cost_center: fund.data.cost_center } : {}),
    ...(approvedBy ? { approved_by: approvedBy, approved_on: approvedOn } : {}),
  };
}

async function normalizeTransfer(context: ControllerContext<WarehouseCashTransferData>): Promise<WarehouseCashTransferData> {
  const input = context.command.document;
  const postingDate = dateText(input.posting_date, "posting_date");
  const fromName = requiredText(input.from_fund, "from_fund");
  const toName = requiredText(input.to_fund, "to_fund");
  if (fromName === toName) throw errors.validation("Source and destination funds must be different");
  const fromFund = await requireFund(context, fromName);
  const toFund = await requireFund(context, toName);
  if (fromFund.data.company !== toFund.data.company) throw errors.reference("Cash transfer funds must belong to the same company");
  if (fromFund.data.currency !== toFund.data.currency) throw errors.reference("Cash transfer funds must use the same currency");
  const scale = fromFund.data.currency_scale ?? 2;
  if ((toFund.data.currency_scale ?? 2) !== scale) throw errors.reference("Cash transfer currency scales do not match");
  const amountMinor = positiveMoney(input.amount, scale, "amount");
  const handoverBy = requiredText(input.handover_by, "handover_by");
  const receivedBy = requiredText(input.received_by, "received_by");
  if (handoverBy === receivedBy) throw errors.validation("Cash handover and receiver must be different users");
  await assertReference(context, "User", handoverBy);
  await assertReference(context, "User", receivedBy);

  let approvedBy = "";
  let approvedOn = "";
  if (context.command.action === "submit") {
    assertApprover(context, true);
    await assertUnlocked(context, fromFund.data.company, postingDate);
    const sourceBalance = (await fundProjection(context, fromName)).balanceMinor;
    if (sourceBalance < amountMinor) throw errors.lifecycle("Source warehouse cash fund does not have enough cash");
    const destinationBalance = (await fundProjection(context, toName)).balanceMinor;
    const maxBalance = toFund.data.max_balance_minor ?? 0;
    if (maxBalance > 0 && destinationBalance + amountMinor > maxBalance) {
      throw errors.lifecycle("Destination warehouse cash fund maximum balance would be exceeded");
    }
    approvedBy = context.command.actor.user_id;
    approvedOn = context.now;
  }
  return {
    posting_date: postingDate,
    from_fund: fromName,
    to_fund: toName,
    amount: fromScaledInt(amountMinor, scale),
    purpose: requiredText(input.purpose, "purpose"),
    handover_by: handoverBy,
    received_by: receivedBy,
    ...(optionalText(input.attachment) ? { attachment: optionalText(input.attachment) } : {}),
    company: fromFund.data.company,
    currency: fromFund.data.currency,
    currency_scale: scale,
    amount_minor: amountMinor,
    ...(approvedBy ? { approved_by: approvedBy, approved_on: approvedOn } : {}),
  };
}

async function normalizeCount(context: ControllerContext<WarehouseCashCountData>): Promise<WarehouseCashCountData> {
  const input = context.command.document;
  const fundName = requiredText(input.fund, "fund");
  const fund = await requireFund(context, fundName);
  const countType = requiredText(input.count_type, "count_type");
  if (!["Chốt ngày", "Bàn giao ca", "Kiểm đột xuất"].includes(countType)) throw errors.validation("count_type is invalid");
  const countedAt = datetimeText(input.counted_at, "counted_at");
  const scale = fund.data.currency_scale ?? 2;
  const countedMinor = nonNegativeMoney(input.counted_balance, scale, "counted_balance");
  const handoverFrom = optionalText(input.handover_from);
  const handoverTo = optionalText(input.handover_to);
  if (countType === "Bàn giao ca") {
    if (!handoverFrom || !handoverTo) throw errors.validation("Shift handover requires both handover users");
    if (handoverFrom === handoverTo) throw errors.validation("Shift handover users must be different");
    await assertReference(context, "User", handoverFrom);
    await assertReference(context, "User", handoverTo);
  }
  let systemMinor = typeof context.existing?.data.system_balance_minor === "number" ? context.existing.data.system_balance_minor : 0;
  let varianceMinor = countedMinor - systemMinor;
  let approvedBy = "";
  let approvedOn = "";
  if (context.command.action === "submit") {
    assertApprover(context, true);
    systemMinor = (await fundProjection(context, fundName)).balanceMinor;
    varianceMinor = countedMinor - systemMinor;
    if (varianceMinor !== 0 && !optionalText(input.variance_reason)) {
      throw errors.validation("variance_reason is required when counted cash differs from the system balance");
    }
    approvedBy = context.command.actor.user_id;
    approvedOn = context.now;
  }
  return {
    fund: fundName,
    count_type: countType,
    counted_at: countedAt,
    counted_balance: fromScaledInt(countedMinor, scale),
    ...(optionalText(input.variance_reason) ? { variance_reason: optionalText(input.variance_reason) } : {}),
    ...(handoverFrom ? { handover_from: handoverFrom } : {}),
    ...(handoverTo ? { handover_to: handoverTo } : {}),
    ...(optionalText(input.attachment) ? { attachment: optionalText(input.attachment) } : {}),
    company: fund.data.company,
    warehouse: fund.data.warehouse,
    cash_account: fund.data.cash_account,
    currency: fund.data.currency,
    currency_scale: scale,
    system_balance: fromScaledInt(systemMinor, scale),
    system_balance_minor: systemMinor,
    counted_balance_minor: countedMinor,
    variance: fromScaledInt(varianceMinor, scale),
    variance_minor: varianceMinor,
    ...(approvedBy ? { approved_by: approvedBy, approved_on: approvedOn } : {}),
  };
}

function voucherGl(data: WarehouseCashVoucherData): GeneralLedgerEntry[] {
  const amount = safeInteger(data.amount_minor, "amount_minor");
  const flow = data.flow_direction;
  if (flow !== "incoming" && flow !== "outgoing") throw errors.lifecycle("Warehouse cash voucher flow is missing");
  const currency = requiredText(data.currency, "currency");
  const scale = safeInteger(data.currency_scale, "currency_scale");
  const postingAt = requiredText(data.posting_date, "posting_date");
  const warehouse = requiredText(data.warehouse, "warehouse");
  const remarks = requiredText(data.purpose, "purpose");
  const cash: GeneralLedgerEntry = {
    line_key: "CASH",
    account: requiredText(data.cash_account, "cash_account"),
    debit_minor: flow === "incoming" ? amount : 0,
    credit_minor: flow === "outgoing" ? amount : 0,
    currency,
    currency_scale: scale,
    ...(optionalText(data.cost_center) ? { cost_center: optionalText(data.cost_center) } : {}),
    accounting_dimensions: cashDimensions(warehouse, requiredText(data.fund, "fund"), flow),
    remarks,
    posting_at: postingAt,
  };
  const party = ledgerParty(data);
  const counter: GeneralLedgerEntry = {
    line_key: "COUNTER",
    account: requiredText(data.counter_account, "counter_account"),
    ...(party.type ? { party_type: party.type, party: party.name } : {}),
    debit_minor: flow === "outgoing" ? amount : 0,
    credit_minor: flow === "incoming" ? amount : 0,
    currency,
    currency_scale: scale,
    ...(optionalText(data.cost_center) ? { cost_center: optionalText(data.cost_center) } : {}),
    accounting_dimensions: { warehouse },
    remarks,
    posting_at: postingAt,
  };
  return [cash, counter];
}

async function transferGl(context: ControllerContext<WarehouseCashTransferData>, data: WarehouseCashTransferData): Promise<GeneralLedgerEntry[]> {
  const fromFund = await requireFund(context, requiredText(data.from_fund, "from_fund"));
  const toFund = await requireFund(context, requiredText(data.to_fund, "to_fund"));
  const amount = safeInteger(data.amount_minor, "amount_minor");
  const currency = requiredText(data.currency, "currency");
  const scale = safeInteger(data.currency_scale, "currency_scale");
  const postingAt = requiredText(data.posting_date, "posting_date");
  const remarks = requiredText(data.purpose, "purpose");
  return [
    {
      line_key: "TRANSFER-IN",
      account: toFund.data.cash_account,
      debit_minor: amount,
      credit_minor: 0,
      currency,
      currency_scale: scale,
      ...(toFund.data.cost_center ? { cost_center: toFund.data.cost_center } : {}),
      accounting_dimensions: cashDimensions(toFund.data.warehouse, toFund.name, "transfer_in"),
      remarks,
      posting_at: postingAt,
    },
    {
      line_key: "TRANSFER-OUT",
      account: fromFund.data.cash_account,
      debit_minor: 0,
      credit_minor: amount,
      currency,
      currency_scale: scale,
      ...(fromFund.data.cost_center ? { cost_center: fromFund.data.cost_center } : {}),
      accounting_dimensions: cashDimensions(fromFund.data.warehouse, fromFund.name, "transfer_out"),
      remarks,
      posting_at: postingAt,
    },
  ];
}

async function fundProjection(context: ControllerContext<JsonObject>, fund: string): Promise<{ balanceMinor: number; hasActivity: boolean }> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Warehouse Cash Balance", fund);
  const balance = typeof data?.current_balance_minor === "number" ? data.current_balance_minor : 0;
  if (!Number.isSafeInteger(balance)) throw errors.database("Warehouse cash balance projection is invalid");
  return { balanceMinor: balance, hasActivity: Boolean(data?.has_activity) };
}

async function dailyOutgoing(context: ControllerContext<JsonObject>, fund: string, postingDate: string): Promise<number> {
  const data = await context.reader.getMasterRecordData(
    context.command.tenant_id,
    "Warehouse Cash Daily Usage",
    `${fund}:${postingDate.slice(0, 10)}`,
  );
  const amount = typeof data?.outgoing_minor === "number" ? data.outgoing_minor : 0;
  if (!Number.isSafeInteger(amount) || amount < 0) throw errors.database("Warehouse cash daily usage projection is invalid");
  return amount;
}

async function assertReverseBalance(
  context: ControllerContext<JsonObject>,
  fund: CanonicalDocument<WarehouseCashFundData>,
  original: GeneralLedgerEntry[],
): Promise<void> {
  const cash = original.find((line) => line.accounting_dimensions?.warehouse_cash_fund === fund.name);
  if (!cash) return;
  const current = (await fundProjection(context, fund.name)).balanceMinor;
  const next = current + cash.credit_minor - cash.debit_minor;
  if (next < 0) throw errors.lifecycle("Cancelling this cash document would make the warehouse cash fund negative");
  const maxBalance = fund.data.max_balance_minor ?? 0;
  if (maxBalance > 0 && next > maxBalance) {
    throw errors.lifecycle("Cancelling this cash document would exceed the warehouse cash fund maximum balance");
  }
}

async function requireFund(context: ControllerContext<JsonObject>, name: string): Promise<CanonicalDocument<WarehouseCashFundData>> {
  const fund = await context.reader.getDocument<WarehouseCashFundData>(context.command.tenant_id, "Warehouse Cash Fund", name);
  if (!fund) throw errors.reference(`Warehouse Cash Fund ${name} does not exist`);
  if (Boolean(fund.data.disabled)) throw errors.lifecycle(`Warehouse Cash Fund ${name} is disabled`);
  if (!fund.data.company || !fund.data.warehouse || !fund.data.cash_account || !fund.data.currency) {
    throw errors.reference(`Warehouse Cash Fund ${name} accounting mapping is incomplete`);
  }
  return fund;
}

async function requireMaster(context: ControllerContext<JsonObject>, type: string, name: string): Promise<JsonObject> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, type, name);
  if (!data || !await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) {
    throw errors.reference(`${type} ${name} does not exist or is disabled`);
  }
  return data;
}

async function assertReference(context: ControllerContext<JsonObject>, type: string, name: string): Promise<void> {
  if (await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) return;
  if (await context.reader.getDocument<JsonObject>(context.command.tenant_id, type, name)) return;
  throw errors.reference(`${type} ${name} does not exist or is unavailable`);
}

function assertAccount(data: JsonObject, company: string, currency: string, requireCash: boolean): void {
  if (typeof data.company === "string" && data.company && data.company !== company) throw errors.reference("Account belongs to another company");
  if (typeof data.account_currency === "string" && data.account_currency && data.account_currency !== currency) {
    throw errors.reference("Account currency does not match the warehouse cash fund currency");
  }
  if (requireCash && typeof data.account_type === "string" && data.account_type && data.account_type !== "Cash") {
    throw errors.reference("Warehouse cash fund must use an Account with account_type=Cash");
  }
}

async function counterparty(
  context: ControllerContext<JsonObject>,
  type: string,
  input: WarehouseCashVoucherData,
): Promise<{ employee?: string; supplier?: string; customer?: string; name?: string }> {
  if (type === "Nhân viên") {
    const employee = requiredText(input.employee, "employee");
    await assertReference(context, "Employee", employee);
    return { employee };
  }
  if (type === "Nhà cung cấp") {
    const supplier = requiredText(input.supplier, "supplier");
    await assertReference(context, "Supplier", supplier);
    return { supplier };
  }
  if (type === "Khách hàng") {
    const customer = requiredText(input.customer, "customer");
    await assertReference(context, "Customer", customer);
    return { customer };
  }
  if (type === "Đơn vị vận chuyển" || type === "Khác") return { name: requiredText(input.counterparty_name, "counterparty_name") };
  throw errors.validation("counterparty_type is invalid");
}

function ledgerParty(data: WarehouseCashVoucherData): { type?: string; name?: string } {
  if (data.counterparty_type === "Nhân viên" && data.employee) return { type: "Employee", name: data.employee };
  if (data.counterparty_type === "Nhà cung cấp" && data.supplier) return { type: "Supplier", name: data.supplier };
  if (data.counterparty_type === "Khách hàng" && data.customer) return { type: "Customer", name: data.customer };
  return {};
}

function cashFlow(type: string): CashFlow {
  if (INCOMING_TYPES.has(type)) return "incoming";
  if (OUTGOING_TYPES.has(type)) return "outgoing";
  throw errors.validation("voucher_type is invalid");
}

function assertApprover(context: ControllerContext<JsonObject>, forbidSelfApproval: boolean): void {
  if (!context.command.actor.roles.some((role) => APPROVER_ROLES.has(role))) {
    throw errors.permission("Warehouse cash approval requires an authorized cash manager or accounting manager");
  }
  if (forbidSelfApproval && context.existing?.owner === context.command.actor.user_id) {
    throw errors.permission("Warehouse cash documents require four-eyes approval; creator cannot approve their own document");
  }
}

async function assertUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && postingAt.slice(0, 10) <= lock) {
    throw errors.validation(`Posting date ${postingAt.slice(0, 10)} is locked for ${company}`, { lock_date: lock });
  }
}

function document<T extends JsonObject>(
  context: ControllerContext<T>,
  data: T,
  docstatus: 0 | 1 | 2,
  status: string,
): CanonicalDocument<T> {
  return {
    tenant_id: context.command.tenant_id,
    doctype: context.command.aggregate.doctype,
    name: context.command.aggregate.name,
    owner: context.existing?.owner ?? context.command.actor.user_id,
    docstatus,
    status,
    version: context.nextVersion,
    created_at: context.existing?.created_at ?? context.now,
    modified_at: context.now,
    data,
    children: [],
  };
}

function plan<T extends JsonObject>(
  context: ControllerContext<T>,
  doc: CanonicalDocument<T>,
  gl: GeneralLedgerEntry[],
): MutationPlan<T> {
  return {
    command: context.command,
    document: doc,
    gl_entries: gl,
    stock_entries: [],
    payment_entries: [],
    fulfillment_entries: [],
    events: [domainEvent({
      type: `${slug(doc.doctype)}.${context.command.action}`,
      tenantId: context.command.tenant_id,
      aggregate: context.command.aggregate,
      aggregateVersion: context.nextVersion,
      actor: context.command.actor.user_id,
      commandId: context.command.command_id,
      occurredAt: context.now,
      payload: { status: doc.status },
    })],
    result: { doctype: doc.doctype, name: doc.name, version: doc.version, docstatus: doc.docstatus, status: doc.status },
  };
}

function cashDimensions(warehouse: string, fund: string, flow: string): JsonObject {
  return { warehouse, warehouse_cash_fund: fund, warehouse_cash_flow: flow };
}

function positiveMoney(value: unknown, scale: number, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const amount = toScaledInt(value, scale, field);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw errors.validation(`${field} must be positive`);
  return amount;
}

function nonNegativeMoney(value: unknown, scale: number, field: string): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const amount = toScaledInt(value, scale, field);
  if (!Number.isSafeInteger(amount) || amount < 0) throw errors.validation(`${field} cannot be negative`);
  return amount;
}

function safeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.lifecycle(`${field} is missing or invalid`);
  return Number(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${field} is required`);
  return value.trim();
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateText(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  return text;
}

function datetimeText(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (Number.isNaN(Date.parse(text))) throw errors.validation(`${field} must be an ISO datetime`);
  return text;
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
