import fs from "node:fs";

const target = new URL("./build-alumdoor-v2-brief.mjs", import.meta.url);
let source = fs.readFileSync(target, "utf8");

const marker = "GRID-03 · current Selling authority projection";
if (source.includes(marker)) {
  console.log("GRID-03 build source already materialized");
  process.exit(0);
}

const startMarker = "// ────────────────── SALES CHILD GRID ──────────────────";
const endMarker = "// ────────────────── BATCH (doctype NỀN TẢNG) ──────────────────";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error("GRID-03: Sales child-grid source block not found");
}

const replacement = `// ────────────────── SALES CHILD GRID ──────────────────
// GRID-03 · current Selling authority projection.
// Pricing Rule + Sales Option + Sales Package are server authorities. This generator only
// materialises the operator-visible fields that the AlumDoor metadata-owned grid must expose;
// no commercial formula or percentage policy is evaluated here.
const ensureSalesLineField = (line, anchor, field) => {
  const existingIndex = line.fields.findIndex((candidate) => nameOf(candidate) === field.fieldname);
  if (existingIndex >= 0) {
    const current = parseField(line.fields[existingIndex], existingIndex, line.name);
    line.fields[existingIndex] = { ...current, ...field };
    return;
  }
  addAfter(line, anchor, field);
};

const salesOptionField = {
  fieldname: "sales_option",
  fieldtype: "Link",
  options: "Sales Option",
  label: "Phương án bán",
  in_list_view: true,
  surface: "quick",
};

// 0118 makes Sales Option an operator choice on quotation/order/invoice lines. Keep the same
// projection in the generated package so authored quickEntry columns do not hide a field added
// later by tenant migration.
for (const childName of ["Quotation Item", "Sales Order Item", "Sales Invoice Item"]) {
  ensureSalesLineField(doctype(childName), "item_code", salesOptionField);
}

// 0120 makes these monetary projections server-owned on Quotation/Sales Order. They are display
// outputs only; discount_percentage remains an audit/compatibility field and is never editable.
for (const childName of ["Quotation Item", "Sales Order Item"]) {
  const line = doctype(childName);
  ensureSalesLineField(line, "rate", {
    fieldname: "discount_amount",
    fieldtype: "Currency",
    label: "Tiền CK",
    read_only: true,
    in_list_view: true,
    description: "Server-authoritative monetary discount for this line.",
  });
  ensureSalesLineField(line, "discount_amount", {
    fieldname: "adjustment_amount",
    fieldtype: "Currency",
    label: "Phụ thu",
    read_only: true,
    in_list_view: true,
    description: "Server-authoritative Pricing Rule adjustments for this line.",
  });
  ensureSalesLineField(line, "adjustment_amount", {
    fieldname: "net_amount",
    fieldtype: "Currency",
    label: "Thành tiền",
    read_only: true,
    in_list_view: true,
    description: "Gross minus policy discount plus adjustments.",
  });

  const discountIndex = line.fields.findIndex((field) => nameOf(field) === "discount_percentage");
  if (discountIndex >= 0) {
    const discount = parseField(line.fields[discountIndex], discountIndex, line.name);
    line.fields[discountIndex] = {
      ...discount,
      hidden: true,
      read_only: true,
      in_list_view: false,
      surface: "internal",
    };
  }

  replaceField(line, "length_m", {
    fieldname: "length_m",
    fieldtype: "Float",
    label: "Dài một cây/đoạn (m)",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre')",
    mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre')",
    description: "Chiều dài của một cây/đoạn, không phải tổng số mét.",
  });
  replaceField(line, "qty_bar", {
    fieldname: "qty_bar",
    fieldtype: "Float",
    label: "Số cây/đoạn",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre' || doc.uom == 'Cây' || doc.uom == 'cay' || doc.uom == 'Lá' || doc.uom == 'la' || doc.uom == 'Đoạn' || doc.uom == 'doan')",
    mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'm' || doc.uom == 'met' || doc.uom == 'meter' || doc.uom == 'metre' || doc.uom == 'Cây' || doc.uom == 'cay' || doc.uom == 'Lá' || doc.uom == 'la' || doc.uom == 'Đoạn' || doc.uom == 'doan')",
    description: "Bán theo Mét: hệ thống lấy chiều dài × số cây. Bán theo Cây/Lá: hệ thống lấy chính số này.",
  });
  replaceField(line, "qty", {
    fieldname: "qty",
    fieldtype: "Float",
    label: "SL tính tiền",
    required: true,
    read_only_depends_on: "eval:(doc.inventory_mode == 'Thành phẩm theo m2' && (doc.uom == 'm2' || doc.uom == 'M2' || doc.uom == 'm²' || doc.uom == 'Bộ')) || (doc.inventory_mode == 'Nhôm cây/lá' && (doc.uom == 'Mét' || doc.uom == 'M' || doc.uom == 'Cây' || doc.uom == 'Lá'))",
    description: "Ô máy tính theo quy cách của dòng: cửa = m² đã chốt × số bộ; ray/trục = dài × số cây; phụ kiện = số lượng theo ĐVT bán.",
  });
  line.list = [
    "item_code", "sales_option", "color", "width_m", "height_m", "set_count", "has_butterfly_bracket",
    "length_m", "qty_bar", "uom", "qty", "rate", "discount_amount", "adjustment_amount", "net_amount",
  ];
}

`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(target, source);
console.log("GRID-03 Sales child-grid build source materialized");
