import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/apps-src/ws07-worker/src/entry.js";

function encodeIdentity(userId, roles) {
  return Buffer.from(JSON.stringify({ actor: { user_id: userId, roles } }), "utf8").toString("base64url");
}

function platformFetcher(records = {}) {
  const data = new Map(Object.entries(records));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      if (parts[0] !== "resource" || parts.length < 2) return Response.json({ message: "not found" }, { status: 404 });
      const doctype = decodeURIComponent(parts[1]);
      if (parts.length === 2) {
        let filters = [];
        try { filters = JSON.parse(url.searchParams.get("filters") ?? "[]"); } catch { filters = []; }
        const result = [];
        for (const [key, record] of data.entries()) {
          if (!key.startsWith(`${doctype}:`)) continue;
          const name = key.slice(doctype.length + 1);
          const matches = filters.every(([field, operator, expected]) => operator === "=" && String(record[field] ?? "") === String(expected ?? ""));
          if (matches) result.push({ name, ...record });
        }
        return Response.json({ data: result });
      }
      const name = decodeURIComponent(parts.slice(2).join("/"));
      const record = data.get(`${doctype}:${name}`);
      return record ? Response.json({ data: record }) : Response.json({ message: "not found" }, { status: 404 });
    },
  };
}

async function validate(doctype, payload, { name = "NEW", action = "create", records = {} } = {}) {
  const request = new Request("https://ws07.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-app": "maintenance",
      "x-cloudforge-callback": "https://platform.test/",
      "x-cloudforge-identity": encodeIdentity("manager@example.com", ["Maintenance Manager"]),
    },
    body: JSON.stringify({ doctype, name, action, payload }),
  });
  return worker.fetch(request, { PLATFORM: platformFetcher(records) }, { waitUntil() {}, passThroughOnException() {} });
}

async function message(response) {
  return String((await response.clone().json()).message ?? "");
}

function warrantyRecords(overrides = {}) {
  return {
    "Maintenance Request:MR-1": {
      customer: "CUST-1", company: "ACME", branch: "HCM", source_delivery_note: "DN-1", item: "ITEM-1", serial_no: "SN-1",
    },
    "Delivery Note:DN-1": {
      docstatus: 1, customer: "CUST-1", company: "ACME", branch: "HCM",
      items: [{ item_code: "ITEM-1", qty: 1, serial_nos: ["SN-1"] }],
    },
    "Serial No:SN-1": {
      item_code: "ITEM-1", customer: "CUST-1", company: "ACME",
      warranty_expiry_date: "2026-12-31", reference_doctype: "Delivery Note", reference_name: "DN-1",
    },
    ...overrides,
  };
}

function eligibleClaim(overrides = {}) {
  return {
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
    eligibility_reason: "Serial còn hạn và đúng giao hàng",
    workflow_state: "Đủ điều kiện",
    ...overrides,
  };
}

function completeServiceOrder(overrides = {}) {
  return {
    maintenance_request: "MR-SVC",
    customer: "CUST-1",
    company: "ACME",
    branch: "HCM",
    item: "ITEM-1",
    serial_no: "SN-1",
    technician: "TECH-1",
    scheduled_start: "2026-08-04 09:00:00",
    scheduled_end: "2026-08-04 10:00:00",
    actual_start: "2026-08-04 09:05:00",
    actual_end: "2026-08-04 09:50:00",
    checklist: [{ check_item: "Kiểm tra nguồn", result: "Đạt" }],
    overall_checklist_result: "Đạt",
    work_performed: "Kiểm tra và xử lý",
    resolution: "Hoàn thành",
    resolution_type: "Sửa chữa",
    billing_mode: "Bao gồm hợp đồng",
    service_contract: "SC-1",
    workflow_state: "Chờ xác nhận",
    ...overrides,
  };
}

function serviceRecords(overrides = {}) {
  return {
    "Maintenance Request:MR-SVC": { customer: "CUST-1", company: "ACME", branch: "HCM", item: "ITEM-1", serial_no: "SN-1" },
    "Service Contract:SC-1": {
      docstatus: 1, workflow_state: "Hiệu lực", customer: "CUST-1", company: "ACME", branch: "HCM",
      effective_from: "2026-01-01", effective_to: "2026-12-31",
      covered_items: [{ item: "ITEM-1", serial_no: "SN-1", coverage_start: "2026-01-01", coverage_end: "2026-12-31" }],
    },
    ...overrides,
  };
}

test("in-warranty claim requires delivered customer item serial provenance", async () => {
  const response = await validate("Warranty Claim", eligibleClaim(), { name: "WC-NEW", records: warrantyRecords() });
  assert.equal(response.status, 200, await message(response));
});

test("invalid ownership or expired serial cannot be marked eligible, while rejection remains auditable", async () => {
  const wrongOwner = await validate("Warranty Claim", eligibleClaim(), {
    name: "WC-WRONG",
    records: warrantyRecords({
      "Delivery Note:DN-1": {
        docstatus: 1, customer: "CUST-OTHER", company: "ACME", branch: "HCM",
        items: [{ item_code: "ITEM-1", qty: 1, serial_nos: ["SN-1"] }],
      },
    }),
  });
  assert.equal(wrongOwner.status, 422);
  assert.match(await message(wrongOwner), /khách hàng|sở hữu/i);

  const expired = await validate("Warranty Claim", eligibleClaim(), {
    name: "WC-EXPIRED",
    records: warrantyRecords({
      "Serial No:SN-1": {
        item_code: "ITEM-1", customer: "CUST-1", company: "ACME",
        warranty_expiry_date: "2026-07-31", reference_doctype: "Delivery Note", reference_name: "DN-1",
      },
    }),
  });
  assert.equal(expired.status, 422);
  assert.match(await message(expired), /hết hạn/i);

  const rejected = await validate("Warranty Claim", eligibleClaim({
    eligibility_result: "Không đủ điều kiện",
    eligibility_reason: "Khách hàng không khớp giao hàng",
    rejection_reason: "Không chứng minh được quyền sở hữu",
    workflow_state: "Từ chối",
  }), {
    name: "WC-REJECT",
    records: warrantyRecords({
      "Delivery Note:DN-1": {
        docstatus: 1, customer: "CUST-OTHER", company: "ACME", branch: "HCM",
        items: [{ item_code: "ITEM-1", qty: 1, serial_nos: ["SN-1"] }],
      },
    }),
  });
  assert.equal(rejected.status, 200, await message(rejected));
});

test("duplicate claim is refused and explicit terminal correction is allowed", async () => {
  const duplicateRecords = warrantyRecords({
    "Warranty Claim:WC-OLD": {
      maintenance_request: "MR-1", workflow_state: "Đang xử lý", eligibility_result: "Đủ điều kiện",
    },
  });
  const duplicate = await validate("Warranty Claim", eligibleClaim(), { name: "WC-NEW", records: duplicateRecords });
  assert.equal(duplicate.status, 422);
  assert.match(await message(duplicate), /retry|đã có/i);

  const correctionRecords = warrantyRecords({
    "Warranty Claim:WC-OLD": {
      maintenance_request: "MR-1", workflow_state: "Hủy", eligibility_result: "Không đủ điều kiện",
    },
  });
  const correction = await validate("Warranty Claim", eligibleClaim({
    correction_of: "WC-OLD",
    correction_reason: "Bổ sung bằng chứng serial chính xác",
  }), { name: "WC-CORR", records: correctionRecords });
  assert.equal(correction.status, 200, await message(correction));
});

test("free service modes require the warranty or contract authority they claim", async () => {
  const warrantyWithoutClaim = await validate("Service Order", completeServiceOrder({
    billing_mode: "Bảo hành",
    warranty_claim: "",
    service_contract: "",
    parts_used: [],
  }), { name: "SO-WARRANTY", records: serviceRecords() });
  assert.equal(warrantyWithoutClaim.status, 422);
  assert.match(await message(warrantyWithoutClaim), /Warranty Claim/i);

  const contractWithoutAuthority = await validate("Service Order", completeServiceOrder({
    billing_mode: "Bao gồm hợp đồng",
    service_contract: "SC-BAD",
    parts_used: [],
  }), {
    name: "SO-CONTRACT",
    records: serviceRecords({
      "Service Contract:SC-BAD": {
        docstatus: 1, workflow_state: "Hiệu lực", customer: "CUST-1", company: "OTHER", branch: "HCM",
        effective_from: "2026-01-01", effective_to: "2026-12-31",
        covered_items: [{ item: "ITEM-1", serial_no: "SN-1", coverage_start: "2026-01-01", coverage_end: "2026-12-31" }],
      },
    }),
  });
  assert.equal(contractWithoutAuthority.status, 422);
  assert.match(await message(contractWithoutAuthority), /công ty khác/i);
});

test("service parts require a submitted matching canonical Stock Entry", async () => {
  const missing = await validate("Service Order", completeServiceOrder({
    parts_used: [{ item: "PART-1", qty: 1, uom: "Cái", serial_no: "PART-SN-1" }],
  }), { name: "SO-1", records: serviceRecords() });
  assert.equal(missing.status, 422);
  assert.match(await message(missing), /Stock Entry/i);

  const linked = await validate("Service Order", completeServiceOrder({
    parts_used: [{ item: "PART-1", qty: 1, uom: "Cái", serial_no: "PART-SN-1", stock_reference: "STE-1" }],
  }), {
    name: "SO-1",
    records: serviceRecords({
      "Stock Entry:STE-1": {
        docstatus: 1, company: "ACME", branch: "HCM",
        items: [{ item_code: "PART-1", qty: 1, serial_nos: ["PART-SN-1"] }],
      },
    }),
  });
  assert.equal(linked.status, 200, await message(linked));
});

test("billable service requires a submitted Sales Invoice for same customer and company", async () => {
  const missing = await validate("Service Order", completeServiceOrder({
    billing_mode: "Tính phí",
    sales_invoice: "",
    parts_used: [],
  }), { name: "SO-BILL", records: serviceRecords() });
  assert.equal(missing.status, 422);
  assert.match(await message(missing), /Sales Invoice/i);

  const wrongCompany = await validate("Service Order", completeServiceOrder({
    billing_mode: "Tính phí",
    sales_invoice: "SI-1",
    parts_used: [],
  }), {
    name: "SO-BILL",
    records: serviceRecords({
      "Sales Invoice:SI-1": { docstatus: 1, customer: "CUST-1", company: "OTHER", branch: "HCM", is_return: false },
    }),
  });
  assert.equal(wrongCompany.status, 422);
  assert.match(await message(wrongCompany), /công ty khác/i);

  const linked = await validate("Service Order", completeServiceOrder({
    billing_mode: "Tính phí",
    sales_invoice: "SI-1",
    parts_used: [],
  }), {
    name: "SO-BILL",
    records: serviceRecords({
      "Sales Invoice:SI-1": { docstatus: 1, customer: "CUST-1", company: "ACME", branch: "HCM", is_return: false },
    }),
  });
  assert.equal(linked.status, 200, await message(linked));
});

test("replacement and return close only with canonical delivery or stock trace", async () => {
  const replacement = await validate("Service Order", completeServiceOrder({
    resolution_type: "Thay thế",
    billing_mode: "Tính phí",
    sales_invoice: "SI-1",
    replacement_delivery_note: "DN-REP",
    replacement_serial_no: "SN-NEW",
    parts_used: [],
  }), {
    name: "SO-REP",
    records: serviceRecords({
      "Sales Invoice:SI-1": { docstatus: 1, customer: "CUST-1", company: "ACME", branch: "HCM", is_return: false },
      "Delivery Note:DN-REP": {
        docstatus: 1, issue_purpose: "Đổi bảo hành", customer: "CUST-1", company: "ACME", branch: "HCM",
        items: [{ item_code: "ITEM-1", qty: 1, serial_nos: ["SN-NEW"] }],
      },
    }),
  });
  assert.equal(replacement.status, 200, await message(replacement));

  const returned = await validate("Service Order", completeServiceOrder({
    resolution_type: "Đổi trả",
    return_stock_entry: "STE-RETURN",
    parts_used: [],
  }), {
    name: "SO-RETURN",
    records: serviceRecords({
      "Stock Entry:STE-RETURN": {
        docstatus: 1, company: "ACME", branch: "HCM",
        items: [{ item_code: "ITEM-1", qty: 1, serial_nos: ["SN-1"] }],
      },
    }),
  });
  assert.equal(returned.status, 200, await message(returned));
});

test("service correction requires terminal source and explicit reason", async () => {
  const blocked = await validate("Service Order", completeServiceOrder({
    correction_of: "SO-OLD",
    correction_reason: "Sửa kết quả nghiệm thu",
    parts_used: [],
  }), {
    name: "SO-CORR",
    records: serviceRecords({
      "Service Order:SO-OLD": { workflow_state: "Đang thực hiện" },
    }),
  });
  assert.equal(blocked.status, 422);
  assert.match(await message(blocked), /kết thúc|hủy/i);

  const allowed = await validate("Service Order", completeServiceOrder({
    correction_of: "SO-OLD",
    correction_reason: "Sửa kết quả nghiệm thu",
    parts_used: [],
  }), {
    name: "SO-CORR",
    records: serviceRecords({
      "Service Order:SO-OLD": { workflow_state: "Hoàn tất" },
    }),
  });
  assert.equal(allowed.status, 200, await message(allowed));
});
