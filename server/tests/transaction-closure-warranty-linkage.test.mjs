import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/apps-src/ws07-worker/src/entry.js";

function identity() {
  return Buffer.from(JSON.stringify({ actor: { user_id: "manager@example.com", roles: ["Maintenance Manager"] } }), "utf8").toString("base64url");
}

function platform(records) {
  const data = new Map(Object.entries(records));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      if (parts[0] !== "resource" || parts.length < 2) return Response.json({ message: "not found" }, { status: 404 });
      const doctype = decodeURIComponent(parts[1]);
      if (parts.length === 2) return Response.json({ data: [] });
      const name = decodeURIComponent(parts.slice(2).join("/"));
      const record = data.get(`${doctype}:${name}`);
      return record ? Response.json({ data: record }) : Response.json({ message: "not found" }, { status: 404 });
    },
  };
}

async function validate(serviceOrder) {
  const records = {
    "Maintenance Request:MR-1": {
      customer: "CUST-1", company: "ACME", branch: "HCM", source_delivery_note: "DN-1", item: "ITEM-1", serial_no: "SN-1",
    },
    "Delivery Note:DN-1": {
      docstatus: 1, customer: "CUST-1", company: "ACME", branch: "HCM",
      items: [{ item_code: "ITEM-1", serial_nos: ["SN-1"] }],
    },
    "Serial No:SN-1": {
      item_code: "ITEM-1", customer: "CUST-1", company: "ACME", warranty_expiry_date: "2026-12-31",
      reference_doctype: "Delivery Note", reference_name: "DN-1",
    },
    "Service Order:SO-1": serviceOrder,
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
      name: "WC-FINAL",
      action: "create",
      payload: {
        claim_date: "2026-08-04",
        customer: "CUST-1",
        company: "ACME",
        branch: "HCM",
        maintenance_request: "MR-1",
        source_delivery_note: "DN-1",
        item: "ITEM-1",
        serial_no: "SN-1",
        complaint: "Không hoạt động",
        eligibility_result: "Đủ điều kiện",
        eligibility_reason: "Còn hạn bảo hành",
        service_order: "SO-1",
        resolution_date: "2026-08-04 10:00:00",
        resolution: "Đã xử lý",
        workflow_state: "Chờ xác nhận",
      },
    }),
  });
  return worker.fetch(request, { PLATFORM: platform(records) }, { waitUntil() {}, passThroughOnException() {} });
}

async function message(response) {
  return String((await response.clone().json()).message ?? "");
}

test("warranty close rejects a service order linked to another claim", async () => {
  const response = await validate({
    warranty_claim: "WC-OTHER",
    maintenance_request: "MR-1",
    customer: "CUST-1",
    company: "ACME",
    branch: "HCM",
    item: "ITEM-1",
    serial_no: "SN-1",
    workflow_state: "Chờ xác nhận",
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /liên kết ngược đúng Warranty Claim/i);
});

test("warranty close accepts a reciprocal completed service-order lineage", async () => {
  const response = await validate({
    warranty_claim: "WC-FINAL",
    maintenance_request: "MR-1",
    customer: "CUST-1",
    company: "ACME",
    branch: "HCM",
    item: "ITEM-1",
    serial_no: "SN-1",
    workflow_state: "Chờ xác nhận",
  });
  assert.equal(response.status, 200, await message(response));
});
