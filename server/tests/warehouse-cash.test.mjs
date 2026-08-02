import test from "node:test";
import assert from "node:assert/strict";
import {
  WarehouseCashCountController,
  WarehouseCashTransferController,
  WarehouseCashVoucherController,
} from "../dist/packages/clouderp-erpnext/src/warehouse-cash.js";

const fund = (name, overrides = {}) => ({
  tenant_id: "tenant-a",
  doctype: "Warehouse Cash Fund",
  name,
  owner: "cash-admin@example.test",
  docstatus: 0,
  status: "Active",
  version: 1,
  created_at: "2026-08-02T00:00:00.000Z",
  modified_at: "2026-08-02T00:00:00.000Z",
  data: {
    fund_code: name,
    fund_name: name,
    company: "ALUMDOOR",
    warehouse: name === "F2" ? "WH-2" : "WH-1",
    cash_account: name === "F2" ? "1112" : "1111",
    currency: "VND",
    currency_scale: 0,
    custodian_user: name === "F2" ? "receiver@example.test" : "keeper@example.test",
    daily_limit: "50000",
    daily_limit_minor: 50_000,
    max_balance: "200000",
    max_balance_minor: 200_000,
    disabled: false,
    ...overrides,
  },
  children: [],
});

function reader({ balances = { F1: 100_000, F2: 20_000 }, daily = 0, originalGl = [] } = {}) {
  const funds = { F1: fund("F1"), F2: fund("F2") };
  return {
    async getDocument(tenantId, doctype, name) {
      assert.equal(tenantId, "tenant-a", "all document reads must remain tenant scoped");
      if (doctype === "Warehouse Cash Fund") return funds[name] ?? null;
      if (doctype === "Warehouse Cash Count" && name === "COUNT-1") {
        return {
          tenant_id: tenantId, doctype, name, owner: "counter@example.test", docstatus: 1,
          status: "Confirmed", version: 1, created_at: "2026-08-02T00:00:00.000Z",
          modified_at: "2026-08-02T00:00:00.000Z", data: { fund: "F1" }, children: [],
        };
      }
      return null;
    },
    async getMasterRecordData(tenantId, type, name) {
      assert.equal(tenantId, "tenant-a", "all master/projection reads must remain tenant scoped");
      if (type === "Warehouse Cash Balance") {
        return { current_balance_minor: balances[name] ?? 0, has_activity: true };
      }
      if (type === "Warehouse Cash Daily Usage") return { outgoing_minor: daily };
      if (type === "Account") return {
        company: "ALUMDOOR", account_currency: "VND", account_type: name.startsWith("111") ? "Cash" : "Expense Account",
      };
      if (type === "Company") return { default_currency: "VND" };
      if (type === "Currency") return { currency_scale: 0 };
      if (type === "Warehouse") return { company: "ALUMDOOR" };
      if (type === "User") return { user_id: name };
      if (type === "Employee") return { employee: name };
      return {};
    },
    async hasMasterRecord(tenantId) {
      assert.equal(tenantId, "tenant-a", "master existence checks must remain tenant scoped");
      return true;
    },
    async getPeriodLockDate(tenantId) {
      assert.equal(tenantId, "tenant-a", "period-lock reads must remain tenant scoped");
      return null;
    },
    async getVoucherGlEntries(tenantId, doctype, name, version) {
      assert.equal(tenantId, "tenant-a", "ledger reversal reads must remain tenant scoped");
      assert.equal(doctype, "Warehouse Cash Voucher");
      assert.equal(name, "QK-1");
      assert.equal(version, 1);
      return structuredClone(originalGl);
    },
  };
}

function commandContext({
  doctype = "Warehouse Cash Voucher",
  name = "QK-1",
  action = "submit",
  document,
  existingOwner = "maker@example.test",
  existingData,
  roles = ["Warehouse Cash Manager"],
  user = "approver@example.test",
  sourceReader = reader(),
} = {}) {
  const existing = action === "create" ? null : {
    tenant_id: "tenant-a", doctype, name, owner: existingOwner, docstatus: action === "cancel" ? 1 : 0,
    status: action === "cancel" ? "Approved" : "Draft", version: 1,
    created_at: "2026-08-02T08:00:00.000Z", modified_at: "2026-08-02T08:00:00.000Z",
    data: existingData ?? document, children: [],
  };
  return {
    command: {
      schema_version: 1,
      command_id: `cmd-${doctype}-${action}`,
      tenant_id: "tenant-a",
      actor: { user_id: user, roles },
      aggregate: { doctype, name },
      action,
      expected_version: existing ? 1 : null,
      payload_hash: "a".repeat(64),
      document: document ?? existingData ?? {},
    },
    existing,
    nextVersion: existing ? 2 : 1,
    now: "2026-08-02T10:00:00.000Z",
    reader: sourceReader,
  };
}

const outgoingVoucher = {
  fund: "F1",
  posting_date: "2026-08-02",
  voucher_type: "Chi",
  amount: "30000",
  purpose: "Mua vật tư lẻ tại kho",
  counter_account: "6421",
  counterparty_type: "Khác",
  counterparty_name: "Cửa hàng lẻ",
};

test("warehouse cash outgoing voucher posts balanced immutable GL with fund dimension", async () => {
  const controller = new WarehouseCashVoucherController();
  const result = await controller.buildPlan(commandContext({ document: outgoingVoucher }));

  assert.equal(result.document.docstatus, 1);
  assert.equal(result.document.status, "Approved");
  assert.equal(result.document.data.amount_minor, 30_000);
  assert.equal(result.document.data.approved_by, "approver@example.test");
  assert.equal(result.gl_entries.length, 2);
  assert.equal(result.gl_entries.reduce((sum, row) => sum + row.debit_minor, 0), 30_000);
  assert.equal(result.gl_entries.reduce((sum, row) => sum + row.credit_minor, 0), 30_000);

  const cash = result.gl_entries.find((row) => row.line_key === "CASH");
  assert.equal(cash.account, "1111");
  assert.equal(cash.credit_minor, 30_000);
  assert.deepEqual(cash.accounting_dimensions, {
    warehouse: "WH-1", warehouse_cash_fund: "F1", warehouse_cash_flow: "outgoing",
  });
  const counter = result.gl_entries.find((row) => row.line_key === "COUNTER");
  assert.equal(counter.account, "6421");
  assert.equal(counter.debit_minor, 30_000);
});

test("creator cannot approve their own warehouse cash voucher", async () => {
  const controller = new WarehouseCashVoucherController();
  await assert.rejects(
    () => controller.buildPlan(commandContext({
      document: outgoingVoucher,
      existingOwner: "approver@example.test",
      user: "approver@example.test",
    })),
    (error) => error?.code === "PERMISSION_DENIED" && /four-eyes approval/.test(error.message),
  );
});

test("daily limit is checked against server projection before posting", async () => {
  const controller = new WarehouseCashVoucherController();
  await assert.rejects(
    () => controller.buildPlan(commandContext({
      document: outgoingVoucher,
      sourceReader: reader({ daily: 25_000 }),
    })),
    (error) => /daily spending limit/.test(error.message),
  );
});

test("warehouse cash transfer debits destination and credits source without consuming expense daily limit", async () => {
  const controller = new WarehouseCashTransferController();
  const data = {
    posting_date: "2026-08-02",
    from_fund: "F1",
    to_fund: "F2",
    amount: "40000",
    purpose: "Bổ sung quỹ kho 2",
    handover_by: "keeper@example.test",
    received_by: "receiver@example.test",
  };
  const result = await controller.buildPlan(commandContext({
    doctype: "Warehouse Cash Transfer", name: "CQ-1", document: data,
  }));
  assert.equal(result.gl_entries.length, 2);
  const incoming = result.gl_entries.find((row) => row.line_key === "TRANSFER-IN");
  const outgoing = result.gl_entries.find((row) => row.line_key === "TRANSFER-OUT");
  assert.equal(incoming.account, "1112");
  assert.equal(incoming.debit_minor, 40_000);
  assert.equal(incoming.accounting_dimensions.warehouse_cash_fund, "F2");
  assert.equal(incoming.accounting_dimensions.warehouse_cash_flow, "transfer_in");
  assert.equal(outgoing.account, "1111");
  assert.equal(outgoing.credit_minor, 40_000);
  assert.equal(outgoing.accounting_dimensions.warehouse_cash_fund, "F1");
  assert.equal(outgoing.accounting_dimensions.warehouse_cash_flow, "transfer_out");
});

test("cash count snapshots authoritative system balance and requires variance reason", async () => {
  const controller = new WarehouseCashCountController();
  const data = {
    fund: "F1", count_type: "Kiểm đột xuất", counted_at: "2026-08-02T09:30:00.000Z",
    counted_balance: "99000",
  };
  await assert.rejects(
    () => controller.buildPlan(commandContext({
      doctype: "Warehouse Cash Count", name: "KKQ-1", document: data,
    })),
    (error) => /variance_reason/.test(error.message),
  );
  const result = await controller.buildPlan(commandContext({
    doctype: "Warehouse Cash Count", name: "KKQ-1",
    document: { ...data, variance_reason: "Thiếu 1.000 khi kiểm thực tế" },
  }));
  assert.equal(result.document.data.system_balance_minor, 100_000);
  assert.equal(result.document.data.counted_balance_minor, 99_000);
  assert.equal(result.document.data.variance_minor, -1_000);
  assert.equal(result.gl_entries.length, 0, "cash count must not silently alter money");
});

test("cancelling cash voucher reverses the exact original GL revision", async () => {
  const original = [
    {
      line_key: "CASH", account: "1111", debit_minor: 100_000, credit_minor: 0,
      currency: "VND", currency_scale: 0, posting_at: "2026-08-02",
      accounting_dimensions: { warehouse: "WH-1", warehouse_cash_fund: "F1", warehouse_cash_flow: "incoming" },
    },
    {
      line_key: "COUNTER", account: "3388", debit_minor: 0, credit_minor: 100_000,
      currency: "VND", currency_scale: 0, posting_at: "2026-08-02", accounting_dimensions: { warehouse: "WH-1" },
    },
  ];
  const existingData = {
    fund: "F1", posting_date: "2026-08-02", voucher_type: "Nạp quỹ", amount: "100000",
    amount_minor: 100_000, purpose: "Nạp quỹ đầu ngày", counter_account: "3388",
    counterparty_type: "Khác", counterparty_name: "Quỹ trung tâm", company: "ALUMDOOR",
    warehouse: "WH-1", cash_account: "1111", currency: "VND", currency_scale: 0, flow_direction: "incoming",
  };
  const controller = new WarehouseCashVoucherController();
  const result = await controller.buildPlan(commandContext({
    action: "cancel",
    existingData,
    sourceReader: reader({ balances: { F1: 150_000, F2: 0 }, originalGl: original }),
  }));
  assert.equal(result.document.docstatus, 2);
  assert.deepEqual(result.gl_entries.map((line) => [line.line_key, line.debit_minor, line.credit_minor]), [
    ["REV-CASH", 0, 100_000],
    ["REV-COUNTER", 100_000, 0],
  ]);
});

test("cancelling an earlier receipt is blocked when later spending would make the fund negative", async () => {
  const original = [{
    line_key: "CASH", account: "1111", debit_minor: 100_000, credit_minor: 0,
    currency: "VND", currency_scale: 0, posting_at: "2026-08-02",
    accounting_dimensions: { warehouse: "WH-1", warehouse_cash_fund: "F1", warehouse_cash_flow: "incoming" },
  }];
  const controller = new WarehouseCashVoucherController();
  await assert.rejects(
    () => controller.buildPlan(commandContext({
      action: "cancel",
      existingData: {
        fund: "F1", posting_date: "2026-08-02", voucher_type: "Nạp quỹ", amount: "100000",
        amount_minor: 100_000, purpose: "Nạp quỹ", counter_account: "3388", counterparty_type: "Khác",
        counterparty_name: "Quỹ trung tâm", company: "ALUMDOOR", warehouse: "WH-1", cash_account: "1111",
        currency: "VND", currency_scale: 0, flow_direction: "incoming",
      },
      sourceReader: reader({ balances: { F1: 50_000, F2: 0 }, originalGl: original }),
    })),
    (error) => /make the warehouse cash fund negative/.test(error.message),
  );
});
