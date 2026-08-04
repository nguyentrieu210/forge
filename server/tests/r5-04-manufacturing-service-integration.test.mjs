import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGoldenOrderEvidence } from "../scripts/lib/alumdoor-golden-order-readonly.mjs";
import worker from "../dist/apps-src/ws07-worker/src/entry.js";

function identity() {
  return Buffer.from(JSON.stringify({
    actor: { user_id: "manager@example.com", roles: ["Maintenance Manager"] },
  }), "utf8").toString("base64url");
}

function goldenOrderFixture() {
  return {
    salesOrder: { name: "SO-R5-04", docstatus: 1, customer: "CUST-R5" },
    productionRequests: [{
      name: "PRQ-R5-04",
      sales_order: "SO-R5-04",
      docstatus: 0,
      request_state: "Đã tạo",
      items: [{ request_line_key: "ROW-R5-SET-1", sales_order_row_id: "ROW-R5" }],
    }],
    workOrders: [{
      name: "WO-R5-04",
      production_request: "PRQ-R5-04",
      production_request_line_key: "ROW-R5-SET-1",
      sales_order_row_id: "ROW-R5",
      against_sales_order: "SO-R5-04",
      docstatus: 1,
    }],
    deliveryNotes: [{
      name: "DN-R5-04",
      against_sales_order: "SO-R5-04",
      docstatus: 1,
      customer: "CUST-R5",
      company: "ACME",
      branch: "HCM",
      items: [{
        item_code: "ITEM-R5",
        sales_order: "SO-R5-04",
        sales_order_row_id: "ROW-R5",
        serial_nos: ["SN-R5-04"],
      }],
    }],
    stockLedgerRows: [{ voucher_no: "DN-R5-04", actual_qty: -1 }],
    invoices: [{ name: "SI-R5-04", against_sales_order: "SO-R5-04", docstatus: 1 }],
    paymentEntries: [{
      name: "PE-R5-04",
      docstatus: 1,
      references: [{
        reference_doctype: "Sales Invoice",
        reference_name: "SI-R5-04",
        allocated_amount: 1_000_000,
      }],
    }],
    receivableRows: [{ voucher_no: "SI-R5-04", outstanding_amount: 500_000 }],
    warrantyClaims: [{ name: "WC-R5-04", sales_order: "", delivery_note: "DN-R5-04" }],
    requireWarranty: true,
  };
}

function platform(records) {
  const data = new Map(Object.entries(records));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      if (parts[0] !== "resource" || parts.length < 2) {
        return Response.json({ message: "not found" }, { status: 404 });
      }
      const doctype = decodeURIComponent(parts[1]);
      if (parts.length === 2) return Response.json({ data: [] });
      const name = decodeURIComponent(parts.slice(2).join("/"));
      const record = data.get(`${doctype}:${name}`);
      return record
        ? Response.json({ data: record })
        : Response.json({ message: "not found" }, { status: 404 });
    },
  };
}

async function validateWarrantyClaim({ maintenanceDelivery = "DN-R5-04", serviceClaim = "WC-R5-04" } = {}) {
  const records = {
    "Maintenance Request:MR-R5-04": {
      customer: "CUST-R5",
      company: "ACME",
      branch: "HCM",
      source_delivery_note: maintenanceDelivery,
      item: "ITEM-R5",
      serial_no: "SN-R5-04",
    },
    "Delivery Note:DN-R5-04": {
      docstatus: 1,
      customer: "CUST-R5",
      company: "ACME",
      branch: "HCM",
      items: [{ item_code: "ITEM-R5", serial_nos: ["SN-R5-04"] }],
    },
    "Serial No:SN-R5-04": {
      item_code: "ITEM-R5",
      customer: "CUST-R5",
      company: "ACME",
      warranty_expiry_date: "2026-12-31",
      reference_doctype: "Delivery Note",
      reference_name: "DN-R5-04",
    },
    "Service Order:SVC-R5-04": {
      warranty_claim: serviceClaim,
      maintenance_request: "MR-R5-04",
      customer: "CUST-R5",
      company: "ACME",
      branch: "HCM",
      item: "ITEM-R5",
      serial_no: "SN-R5-04",
      workflow_state: "Chờ xác nhận",
    },
  };

  const request = new Request("https://ws07.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-app": "maintenance",
      "x-cloudforge-callback": "https://platform.test/",
      "x-cloudforge-identity": identity(),
    },
    body: JSON.stringify({
      doctype: "Warranty Claim",
      name: "WC-R5-04",
      action: "create",
      payload: {
        claim_date: "2026-08-04",
        customer: "CUST-R5",
        company: "ACME",
        branch: "HCM",
        maintenance_request: "MR-R5-04",
        source_delivery_note: "DN-R5-04",
        item: "ITEM-R5",
        serial_no: "SN-R5-04",
        complaint: "Không hoạt động",
        eligibility_result: "Đủ điều kiện",
        eligibility_reason: "Còn hạn bảo hành",
        service_order: "SVC-R5-04",
        resolution_date: "2026-08-04 10:00:00",
        resolution: "Đã xử lý",
        workflow_state: "Chờ xác nhận",
      },
    }),
  });

  return worker.fetch(
    request,
    { PLATFORM: platform(records) },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function responseMessage(response) {
  return String((await response.clone().json()).message ?? "");
}

test("R5-04 preserves exact Sales -> Manufacturing -> Delivery -> Warranty -> Service lineage", async () => {
  const golden = evaluateGoldenOrderEvidence(goldenOrderFixture());
  assert.equal(golden.sales_order, "SO-R5-04");
  assert.deepEqual(golden.work_orders, ["WO-R5-04"]);
  assert.deepEqual(golden.production_row_ids, ["ROW-R5"]);
  assert.deepEqual(golden.delivered_production_row_ids, ["ROW-R5"]);
  assert.deepEqual(golden.delivery_notes, ["DN-R5-04"]);
  assert.deepEqual(golden.warranty_claims, ["WC-R5-04"]);
  assert.equal(golden.authority.stock, "Stock Ledger");

  const response = await validateWarrantyClaim();
  assert.equal(response.status, 200, await responseMessage(response));
});

test("R5-04 fails closed when Warranty/Service provenance switches away from the delivered source", async () => {
  const response = await validateWarrantyClaim({ maintenanceDelivery: "DN-OTHER" });
  assert.equal(response.status, 422);
  assert.match(await responseMessage(response), /Delivery Note|giao hàng|nguồn/i);
});

test("R5-04 fails closed when reciprocal Service Order points at another Warranty Claim", async () => {
  const response = await validateWarrantyClaim({ serviceClaim: "WC-OTHER" });
  assert.equal(response.status, 422);
  assert.match(await responseMessage(response), /liên kết ngược đúng Warranty Claim/i);
});
