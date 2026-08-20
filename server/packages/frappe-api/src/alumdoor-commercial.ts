import {
  alumdoorCommercialBenefits, areaTierBasisSqm, defaultAlumdoorDiscountPercent, errors, resolveCommercialLine,
  withAlumdoorDefaultDiscountSnapshot,
  type JsonObject, type JsonValue, type MutationCommand,
} from "./router-platform.js";
import type { FrappeArgs } from "./args.js";
import { loadReadable } from "./document-access.js";
import type { FrappeRouterContext } from "./router.js";

// Xem trước một dòng bán hàng theo luật thương mại của AlumDoor: chiết khấu mặc định theo
// mặt hàng, quyền lợi kèm theo, và diện tích tính tiền cho hàng bán theo m2.
//
// Hàm này từng nằm trong router.ts, kéo theo ba hàm mang tên khách hàng vào đúng khối import
// của lõi nền tảng. Nó là luật của một vertical, nên ở đây.

export async function previewSalesCommercialLine(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const line = args.object("line") ?? args.object("row") ?? {};
  const itemCode = String(line.item_code ?? args.text("item_code") ?? "").trim();
  const priceList = String(args.text("price_list") ?? line.price_list ?? "").trim();
  const currency = String(args.text("currency") ?? line.currency ?? "VND").trim() || "VND";
  const postingDate = String(args.text("posting_date") ?? args.text("transaction_date") ?? line.posting_date ?? context.now().slice(0, 10)).slice(0, 10);
  if (!itemCode) throw errors.validation("item_code is required");
  if (!priceList) throw errors.validation("price_list is required");

  // Permission is evaluated on the actual Item before any pricing master is read.
  const item = await loadReadable("Item", itemCode, context);
  const qty = Number(line.qty ?? line.priced_qty ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) throw errors.validation("qty must be greater than zero");
  const normalizedUom = String(line.uom ?? "").normalize("NFC").trim().toLocaleLowerCase("vi").replace(/\s+/g, "");
  const explicitArea = Number(line.billable_area_sqm);
  // For area-priced lines, qty is the latest canonical result produced by the
  // vertical formula preview. Prefer it over a stale billable_area_sqm left on
  // the row, then expose the common aliases used by configured conditions.
  const effectiveArea = ["m2", "m²", "sqm"].includes(normalizedUom)
    ? qty
    : Number.isFinite(explicitArea) && explicitArea > 0
      ? explicitArea
      : undefined;

  /**
   * Cùng một phép suy diện tích-một-bộ mà `optionalPositiveFacts` dùng lúc lưu đơn, để xem trước
   * và lưu không bao giờ ra hai bậc khác nhau. `billable_area_sqm` ở đây là diện tích CẢ DÒNG vừa
   * tính lại (`effectiveArea`), nên nó phải đi vào cùng ô đó.
   *
   * Chuyển tay từ `router.ts` khi gom nhánh: `main` đã dời `previewSalesCommercialLine` sang file
   * này (`refactor(router): bóc 6 method AlumDoor khỏi switch dùng chung`), còn `agent-live` sửa
   * nó tại chỗ cũ. Bỏ qua bước chuyển này là màn xem trước báo một bậc, lưu đơn ra bậc khác.
   */
  const previewAreaPerSet = areaTierBasisSqm({
    area_per_set_sqm: line.area_per_set_sqm,
    billable_area_sqm: effectiveArea,
    set_count: line.set_count,
  });

  const fakeCommand: MutationCommand<JsonObject> = {
    schema_version: 1,
    command_id: `preview-sales-${context.traceId}`,
    tenant_id: context.tenantId,
    aggregate: { doctype: "Sales Order", name: "__commercial_preview__" },
    action: "save",
    expected_version: null,
    payload_hash: "preview",
    document: {},
    actor: context.actor,
  };
  const facts: Record<string, unknown> = {
    ...line,
    item_group: item.data.item_group,
    ...(effectiveArea === undefined ? {} : {
      billable_area_sqm: effectiveArea,
      area_sqm: effectiveArea,
      sqm2: effectiveArea,
    }),
  };
  const requestedDiscount = Number(line.discount_percentage);
  const expectedDiscount = defaultAlumdoorDiscountPercent({
    ...item.data,
    item_code: itemCode,
  });
  const kernelContext = {
    command: fakeCommand,
    existing: null,
    now: context.now(),
    nextVersion: 1,
    reader: context.documents,
  };
  const resolved = await resolveCommercialLine(kernelContext, {
    itemCode,
    priceList,
    documentCurrency: currency,
    postingDate,
    ...(typeof line.uom === "string" && line.uom.trim() ? { uom: line.uom.trim() } : {}),
    pricedQty: qty,
    partyType: "Customer",
    ...(args.text("customer") ? { party: args.text("customer")! } : {}),
    ...(args.text("customer_group") ? { customerGroup: args.text("customer_group")! } : {}),
    facts,
    ...(Number.isFinite(requestedDiscount) || expectedDiscount > 0
      ? { discountPercentageOverride: Number.isFinite(requestedDiscount) ? requestedDiscount : expectedDiscount }
      : {}),
    ...(effectiveArea === undefined ? {} : { areaSqm: effectiveArea }),
    // Bậc tra theo diện tích MỘT BỘ. `effectiveArea` là qty của dòng m², tức ĐÃ nhân số bộ —
    // đưa thẳng nó xuống là đơn 2 bộ cửa 3,5m² ăn nhầm bậc 7m².
    ...(previewAreaPerSet === undefined ? {} : { areaPerSetSqm: previewAreaPerSet }),
    ...(Number.isFinite(Number(line.length_m)) ? { lengthM: Number(line.length_m) } : {}),
    ...(Number.isFinite(Number(line.set_count)) ? { setCount: Number(line.set_count) } : {}),
  });
  const pricingRuleSnapshots = withAlumdoorDefaultDiscountSnapshot(resolved.pricing_rule_snapshots, {
    ...item.data,
    item_code: itemCode,
  });
  return {
    ...resolved,
    pricing_rule_snapshots: pricingRuleSnapshots,
    benefit_items: alumdoorCommercialBenefits({ ...item.data, item_code: itemCode }, effectiveArea ?? qty),
    rate: resolved.selling_rate,
    amount: resolved.net_before_tax,
    net_amount: resolved.net_before_tax,
  };
}
