function text(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rows(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
}

function submitted(row) {
  return Number(row?.docstatus ?? 0) === 1;
}

function notCancelled(row) {
  return Number(row?.docstatus ?? 0) !== 2 && !["cancelled", "canceled", "đã huỷ", "đã hủy"].includes(text(row?.status ?? row?.request_state).toLocaleLowerCase("vi"));
}

function linksSalesOrder(row, salesOrder) {
  if (text(row?.against_sales_order) === salesOrder || text(row?.sales_order) === salesOrder) return true;
  return rows(row?.items).some((item) => text(item.sales_order ?? item.against_sales_order) === salesOrder);
}

function paymentReferencesInvoice(entry, invoiceNames) {
  return rows(entry?.references).some((ref) =>
    text(ref.reference_doctype) === "Sales Invoice"
    && invoiceNames.has(text(ref.reference_name))
    && numeric(ref.allocated_amount) > 0,
  );
}

function stockLedgerMatchesDelivery(row, deliveryNames) {
  const voucher = text(row?.voucher_no ?? row?.voucher);
  return deliveryNames.has(voucher) && numeric(row?.actual_qty) < 0;
}

function receivableMatchesInvoice(row, invoiceNames) {
  return invoiceNames.has(text(row?.voucher_no ?? row?.invoice ?? row?.name));
}

function productionRowIds(productionRequests, workOrders) {
  const ids = new Set();
  for (const request of productionRequests) {
    for (const item of rows(request.items)) {
      const id = text(item.sales_order_row_id);
      if (id) ids.add(id);
    }
  }
  for (const work of workOrders) {
    const id = text(work.sales_order_row_id);
    if (id) ids.add(id);
  }
  return ids;
}

function deliveryRowIds(deliveryNotes) {
  const ids = new Set();
  for (const note of deliveryNotes) {
    for (const item of rows(note.items)) {
      const id = text(item.sales_order_row_id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function evaluateGoldenOrderEvidence(input) {
  const salesOrder = input?.salesOrder ?? {};
  const salesOrderName = text(salesOrder.name);
  if (!salesOrderName) throw new Error("Golden Order thiếu Sales Order nguồn.");
  if (!submitted(salesOrder)) throw new Error(`Sales Order ${salesOrderName} chưa submit.`);

  const productionRequests = rows(input.productionRequests)
    .filter((row) => text(row.sales_order) === salesOrderName && notCancelled(row));
  if (!productionRequests.length) throw new Error(`Không có Production Request hoạt động cho ${salesOrderName}.`);
  const productionRequestNames = new Set(productionRequests.map((row) => text(row.name)).filter(Boolean));

  const workOrders = rows(input.workOrders)
    .filter((row) => productionRequestNames.has(text(row.production_request)) && notCancelled(row));
  if (!workOrders.length) throw new Error(`Không có Work Order truy vết từ Production Request của ${salesOrderName}.`);
  for (const work of workOrders) {
    const against = text(work.against_sales_order);
    if (against && against !== salesOrderName) {
      throw new Error(`Work Order ${text(work.name)} trỏ sang Sales Order khác (${against}).`);
    }
  }

  const productionRows = productionRowIds(productionRequests, workOrders);
  if (!productionRows.size) {
    throw new Error(`Production Request / Work Order của ${salesOrderName} thiếu sales_order_row_id để chứng minh lineage.`);
  }
  const requestRows = new Set(productionRequests.flatMap((request) => rows(request.items).map((item) => text(item.sales_order_row_id)).filter(Boolean)));
  if (requestRows.size) {
    for (const work of workOrders) {
      const rowId = text(work.sales_order_row_id);
      if (!rowId || !requestRows.has(rowId)) {
        throw new Error(`Work Order ${text(work.name)} không khớp sales_order_row_id của Production Request.`);
      }
    }
  }

  const deliveryNotes = rows(input.deliveryNotes)
    .filter((row) => submitted(row) && linksSalesOrder(row, salesOrderName));
  if (!deliveryNotes.length) throw new Error(`Không có Delivery Note submitted cho ${salesOrderName}.`);
  const deliveryNames = new Set(deliveryNotes.map((row) => text(row.name)).filter(Boolean));
  const deliveredRows = deliveryRowIds(deliveryNotes);
  if (!deliveredRows.size) {
    throw new Error(`Delivery Note của ${salesOrderName} thiếu sales_order_row_id để nối về dòng sản xuất.`);
  }
  const missingDeliveredRows = [...productionRows].filter((rowId) => !deliveredRows.has(rowId));
  if (missingDeliveredRows.length) {
    throw new Error(`Golden Order chưa giao đủ lineage sản xuất; thiếu dòng: ${missingDeliveredRows.join(", ")}.`);
  }

  const stockRows = rows(input.stockLedgerRows).filter((row) => stockLedgerMatchesDelivery(row, deliveryNames));
  if (!stockRows.length) throw new Error(`Stock Ledger không có dòng xuất kho từ Delivery Note của ${salesOrderName}.`);

  const invoices = rows(input.invoices)
    .filter((row) => submitted(row) && linksSalesOrder(row, salesOrderName));
  if (!invoices.length) throw new Error(`Không có Sales Invoice submitted cho ${salesOrderName}.`);
  const invoiceNames = new Set(invoices.map((row) => text(row.name)).filter(Boolean));

  const payments = rows(input.paymentEntries)
    .filter((row) => submitted(row) && paymentReferencesInvoice(row, invoiceNames));
  if (!payments.length) throw new Error(`Không có Payment Entry submitted phân bổ vào hóa đơn của ${salesOrderName}.`);

  const receivableRows = rows(input.receivableRows).filter((row) => receivableMatchesInvoice(row, invoiceNames));
  if (!receivableRows.length) throw new Error(`Accounts Receivable không trả dòng cho hóa đơn của ${salesOrderName}.`);

  const warrantyClaims = rows(input.warrantyClaims)
    .filter((row) => text(row.sales_order) === salesOrderName || deliveryNames.has(text(row.delivery_note)));
  if (input.requireWarranty && !warrantyClaims.length) {
    throw new Error(`Không có Warranty Claim truy vết tới ${salesOrderName} hoặc Delivery Note của đơn.`);
  }

  const paidAmount = payments.reduce((sum, payment) => sum + rows(payment.references)
    .filter((ref) => text(ref.reference_doctype) === "Sales Invoice" && invoiceNames.has(text(ref.reference_name)))
    .reduce((inner, ref) => inner + numeric(ref.allocated_amount), 0), 0);
  const stockQty = stockRows.reduce((sum, row) => sum + numeric(row.actual_qty), 0);
  const outstanding = receivableRows.reduce((sum, row) => sum + numeric(row.outstanding_amount), 0);

  return {
    sales_order: salesOrderName,
    production_requests: [...productionRequestNames],
    work_orders: workOrders.map((row) => text(row.name)).filter(Boolean),
    production_row_ids: [...productionRows].sort(),
    delivered_production_row_ids: [...productionRows].filter((rowId) => deliveredRows.has(rowId)).sort(),
    delivery_notes: [...deliveryNames],
    stock_ledger_rows: stockRows.length,
    stock_out_qty: Math.abs(stockQty),
    sales_invoices: [...invoiceNames],
    payment_entries: payments.map((row) => text(row.name)).filter(Boolean),
    paid_amount: paidAmount,
    ar_outstanding: outstanding,
    warranty_claims: warrantyClaims.map((row) => text(row.name)).filter(Boolean),
    warranty_required: Boolean(input.requireWarranty),
    authority: {
      production: "Production Request / Work Order",
      fulfillment_lineage: "sales_order_row_id",
      stock: "Stock Ledger",
      receivable: "Accounts Receivable / Payment Ledger",
      warranty: "Warranty Claim",
    },
  };
}
