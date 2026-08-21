import assert from "node:assert/strict";
import test from "node:test";

import { previewDocument } from "../dist/apps-src/alumdoor-worker/src/ui-document-preview.js";

test("Sales Order document totals include canonical line surcharge before VAT", async () => {
  const result = await previewDocument(async () => new Response(JSON.stringify({ data: null }), {
    headers: { "content-type": "application/json" },
  }), {
    doctype: "Sales Order",
    changed_field: "items",
    doc: {
      vat_rate: 10,
      deposit_amount: 1_000_000,
      items: [{
        item_code: "ITEM-AREA",
        qty: 4.4,
        rate: 580_000,
        amount: 2_552_000,
        discount_amount: 0,
        adjustment_amount: 300_000,
      }],
    },
  });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.patch.total_amount, 2_552_000);
  assert.equal(body.patch.discount_amount, 0);
  assert.equal(body.patch.surcharge_amount, 300_000);
  assert.equal(body.patch.vat_base_amount, 2_852_000);
  assert.equal(body.patch.vat_amount, 285_200);
  assert.equal(body.patch.grand_total, 3_137_200);
  assert.equal(body.patch.deposit_amount, 1_000_000);
  assert.equal(body.patch.outstanding_amount, 2_137_200);
});

test("changing customer defaults price group but changing another header field preserves the selected group", async () => {
  const customerChanged = await previewDocument(async (path) => {
    // Bảng giá bán nay suy từ danh mục thay vì ghim chuỗi, nên preview đọc thêm `Price List`.
    // Ràng buộc thật của bài này là ĐỌC KHÁCH đúng một lần, không phải cấm mọi lượt đọc khác.
    if (path.startsWith("resource/Price%20List") || path.startsWith("resource/Price List")) {
      return Response.json({ data: [] });
    }
    assert.match(path, /resource\/Customer\/KH-DAI-LY$/);
    return Response.json({ data: { price_group: "Đại lý", contact_person: "Anh A" } });
  }, {
    doctype: "Sales Order",
    changed_field: "customer",
    doc: { customer: "KH-DAI-LY", items: [] },
  });
  assert.equal(customerChanged.status, 200);
  const customerBody = await customerChanged.json();
  assert.equal(customerBody.patch.customer_group, "Đại lý");

  let reads = 0;
  const dateChanged = await previewDocument(async (path) => {
    if (path.startsWith("resource/Price%20List") || path.startsWith("resource/Price List")) {
      return Response.json({ data: [] });
    }
    reads += 1;
    return Response.json({ data: { price_group: "Đại lý" } });
  }, {
    doctype: "Sales Order",
    changed_field: "transaction_date",
    doc: { customer: "KH-DAI-LY", customer_group: "Lẻ", transaction_date: "2026-08-19", items: [] },
  });
  assert.equal(dateChanged.status, 200);
  const dateBody = await dateChanged.json();
  assert.equal(reads, 0, "non-customer preview must not reload and overwrite the selected price group");
  assert.equal(dateBody.patch.customer_group, undefined);
  /**
   * Danh mục không có bảng giá nào ⇒ KHÔNG điền gì.
   *
   * Brief `Price List` ghi: để trống `selling_price_list` nghĩa là giá gõ tay — mặc định của
   * xưởng. Trước 21/08 chỗ này ghim `"ALUMDOOR-SELLING"` và ép lên mọi đơn, nên khi chủ xưởng
   * đổi tên bảng giá thì mọi dòng bán báo "chưa khai đơn giá" dù giá vẫn nằm trong D1.
   */
  assert.equal(dateBody.patch.selling_price_list, undefined);
});

test("bảng giá bán suy từ danh mục, và KHÔNG đè lựa chọn của người lập đơn", async () => {
  const priceLists = [
    { name: "Alumdoor 2026", price_list_name: "Alumdoor 2026", customer_group: "", disabled: 0 },
  ];
  const call = async (path) => {
    if (path.startsWith("resource/Price%20List") || path.startsWith("resource/Price List")) {
      return Response.json({ data: priceLists });
    }
    return Response.json({ data: {} });
  };

  // Trống thì suy: đúng một bảng giá còn dùng ⇒ lấy nó.
  const auto = await previewDocument(call, { doctype: "Sales Order", doc: { items: [] } });
  assert.equal((await auto.json()).patch.selling_price_list, "Alumdoor 2026");

  // Người lập đơn đã chọn thì GIỮ — preview không có quyền đè.
  const chosen = await previewDocument(call, {
    doctype: "Sales Order",
    doc: { items: [], selling_price_list: "Bảng giá lẻ 2025" },
  });
  assert.equal((await chosen.json()).patch.selling_price_list, undefined);

  // Nhiều bảng giá còn dùng mà không đủ căn cứ chọn ⇒ để trống, không đoán.
  priceLists.push({ name: "Bảng giá lẻ 2025", price_list_name: "Bảng giá lẻ 2025", customer_group: "", disabled: 0 });
  const ambiguous = await previewDocument(call, { doctype: "Sales Order", doc: { items: [] } });
  assert.equal((await ambiguous.json()).patch.selling_price_list, undefined);

  // Có nhóm giá của khách thì dùng nó để chọn.
  priceLists[1].customer_group = "Lẻ";
  const byGroup = await previewDocument(call, {
    doctype: "Sales Order",
    doc: { items: [], customer_group: "Lẻ" },
  });
  assert.equal((await byGroup.json()).patch.selling_price_list, "Bảng giá lẻ 2025");
});
