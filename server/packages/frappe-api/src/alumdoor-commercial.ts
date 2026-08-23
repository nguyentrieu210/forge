import {
  alumdoorCommercialBenefits, alumdoorGiftRailAreaOperator, alumdoorGiftRailEligible,
  alumdoorGiftRailThresholdSqm, areaTierBasisSqm, assertAlumdoorGiftRailAllowed,
  defaultAlumdoorDiscountPercent, errors, resolveCommercialLine,
  hasAlumdoorDiscountEffect,
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
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2026-08-21 — giải trình được con số, không chỉ trả ra con số
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Hợp đồng: `docs/audits/ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md` §B.
//
// `resolveServerPrice` (`clouderp-pricing`) TÍNH RA `uom` và `source_uom` — trong đó
// `source_uom` là dấu hiệu duy nhất cho biết đơn giá đang hiện KHÔNG phải giá ai đó khai, mà là
// giá của ĐVT khác đã nhân chéo hệ số quy đổi. Rồi `resolveCommercialLine`
// (`clouderp-selling/src/commercial-line-resolver.ts`) dựng object trả về **không chép hai khoá
// đó sang**, nên chúng chết ngay trên đường về. Người bán thấy một đơn giá lạ và không có đường
// nào truy ra vì sao.
//
// Sửa đúng chỗ là sửa `commercial-line-resolver.ts`, nhưng đó là hợp đồng dùng chung của cả
// controller `Sales Order` và nằm ngoài phạm vi đợt này. Nên ở đây ĐỌC LẠI đúng bản ghi
// `Item Price` mà engine vừa chọn (`resolved.item_price`) và thuật lại. Không tính lại một con
// số thứ hai: hai con số cùng nói về một đơn giá là mầm của mọi lần "xem trước một đằng, lưu một
// nẻo".
//
// Phạm vi quyền: `Item` đã qua `loadReadable` ở đầu hàm. Ba bản ghi đọc thêm (`Item Price` đã
// chọn, `Bậc diện tích` của chính nó, `Pricing Rule` đã áp) đều là những bản ghi VỪA tạo ra các
// con số đang trả về — bề mặt hẹp hơn hẳn thứ đã trả. Mọi lượt đọc đều được phép hỏng riêng:
// hỏng thì khoá giải trình vắng mặt, tiền vẫn đúng.

interface CatalogWarning extends JsonObject {
  code: string;
  label: string;
  where: string;
}

function catalogText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function catalogNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readMaster(
  context: FrappeRouterContext,
  doctype: string,
  name: string,
): Promise<JsonObject | null> {
  if (!name) return null;
  return await context.documents.getMasterRecordData(context.tenantId, doctype, name).catch(() => null);
}

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
  const widthForGift = [line.width_pb_ray_m, line.width_pb_nhua_m, line.width_m]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0);
  const heightForGift = Number(line.height_m);
  const physicalGiftAreaPerSet = widthForGift !== undefined && Number.isFinite(heightForGift) && heightForGift > 0
    ? widthForGift * heightForGift
    : previewAreaPerSet;

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
    door_type: item.data.door_type,
    ...(effectiveArea === undefined ? {} : {
      billable_area_sqm: effectiveArea,
      area_sqm: effectiveArea,
      sqm2: effectiveArea,
    }),
    /*
     * Diện tích MỘT BỘ — phụ thu "Vận chuyển cửa nhỏ" (< 8 m²) so theo kích thước của TỪNG cửa,
     * không phải tổng diện tích cả dòng (dòng 2 bộ × 3,5 m² = 7 m²/bộ vẫn dưới ngưỡng, nhưng cả
     * dòng đã 14 m² — so nhầm trục sẽ để lọt một bộ đáng ra phải chịu phí vận chuyển).
     */
    ...(previewAreaPerSet === undefined ? {} : { area_per_set_sqm: previewAreaPerSet }),
  };
  const requestedDiscount = Number(line.discount_percentage);
  // P0-2: nhóm giá của khách quyết định có chiết khấu đại lý hay không.
  const previewCustomerGroup = args.text("customer_group");
  const expectedDiscount = defaultAlumdoorDiscountPercent({
    ...item.data,
    item_code: itemCode,
  }, previewCustomerGroup);
  const kernelContext = {
    command: fakeCommand,
    existing: null,
    now: context.now(),
    nextVersion: 1,
    reader: context.documents,
  };
  const resolveInput: Parameters<typeof resolveCommercialLine>[1] = {
    itemCode,
    priceList,
    documentCurrency: currency,
    postingDate,
    ...(typeof line.uom === "string" && line.uom.trim() ? { uom: line.uom.trim() } : {}),
    /**
     * CÁCH BÁN của dòng phải đi cùng lượt tra giá ở ĐÂY nữa.
     *
     * `commercial-sales-order-controller.ts:125` (lúc lưu) và `clouderp-selling/controllers.ts`
     * (hoá đơn bán lẻ) đều truyền `priceVariant`; đường XEM TRƯỚC này thì không — nên mọi dòng
     * đi qua đây đều tra biến thể `STANDARD` bất kể người bán chọn gì. Hỏng chỉ lộ ra khi mặt
     * hàng KHÔNG còn dòng `STANDARD`: đo trên `Alumdoor 2026` ngày 21/08/2026, 15 mã cửa Đức
     * chỉ còn `TANG_RAY`/`CHI_LA` ⇒ xem trước ném "Item Price … does not exist for variant
     * STANDARD" trong khi lưu đơn lại ra giá đúng. Xem một đằng, lưu một nẻo.
     *
     * Cú pháp sai thì để `normalizePriceVariant` ở tầng giá từ chối — không tự sửa hộ, không
     * lặng lẽ rơi về STANDARD.
     */
    ...(typeof line.price_variant === "string" && line.price_variant.trim()
      ? { priceVariant: line.price_variant.trim() }
      : {}),
    pricedQty: qty,
    partyType: "Customer",
    ...(args.text("customer") ? { party: args.text("customer")! } : {}),
    ...(args.text("customer_group") ? { customerGroup: args.text("customer_group")! } : {}),
    facts,
    /**
     * P0-1 — xem trước phải tính CÙNG một cách với lúc lưu, nên ở đây cũng chỉ truyền mức
     * người bán TỰ NHẬP. Hằng số 15% (`expectedDiscount`) không còn đi vào phép tính tiền:
     * chiết khấu đại lý do luật Pricing Rule trong danh mục cấp, một lần duy nhất.
     * Xem lý do đầy đủ ở `commercial-sales-order-controller.ts` (cùng chỗ vá).
     */
    ...(Number.isFinite(requestedDiscount)
      ? { discountPercentageOverride: requestedDiscount }
      : {}),
    ...(effectiveArea === undefined ? {} : { areaSqm: effectiveArea }),
    // Bậc tra theo diện tích MỘT BỘ. `effectiveArea` là qty của dòng m², tức ĐÃ nhân số bộ —
    // đưa thẳng nó xuống là đơn 2 bộ cửa 3,5m² ăn nhầm bậc 7m².
    ...(previewAreaPerSet === undefined ? {} : { areaPerSetSqm: previewAreaPerSet }),
    /*
     * `lengthM` cho phụ thu tính theo mét (`adjustment_basis: LENGTH_M` — ví dụ sơn ray).
     *
     * `line.length_m` là chiều dài CẮT MỖI CÂY do BOM gán cho dòng cấu kiện — không tồn tại
     * trên một dòng bán ĐỘC LẬP. Ray bán riêng (Tách món, ĐVT "Mét") thì chính `qty` của dòng
     * đã LÀ tổng số mét bán — không có con số nào khác để nói "chiều dài" ở đây. Thiếu nhánh
     * lùi này thì luật phụ thu sơn ray không bao giờ tính ra tiền: cơ sở đọc được `undefined`,
     * hạ xuống 0, và bị coi là "không đủ điều kiện" dù mọi điều kiện màu/phạm vi đã khớp.
     */
    ...(Number.isFinite(Number(line.length_m))
      ? { lengthM: Number(line.length_m) }
      : normalizedUom === "mét" || normalizedUom === "met" || normalizedUom === "m"
        ? { lengthM: qty }
        /*
         * Trọn bộ tick "Sơn ray": ray không phải dòng bán độc lập nên không có `length_m`/`qty`
         * mét riêng — chiều dài để tính LENGTH_M là `ray_paint_length_m` mà client đã ghi lại
         * từ đúng lượt xem BOM (`alumdoor.sales.ray_paint_surcharge`). Phải khớp NGUYÊN VẸN với
         * `optionalPositiveFacts` (đường lưu), nếu không xem trước và lưu ra hai số khác nhau.
         */
        : Number(line.ray_painted) && Number.isFinite(Number(line.ray_paint_length_m)) && Number(line.ray_paint_length_m) > 0
          ? { lengthM: Number(line.ray_paint_length_m) }
          : {}),
    ...(Number.isFinite(Number(line.set_count)) ? { setCount: Number(line.set_count) } : {}),
  };
  let resolved = await resolveCommercialLine(kernelContext, resolveInput);
  if (expectedDiscount > 0
    && !Number.isFinite(requestedDiscount)
    && !resolved.pricing_rule_snapshots.some(hasAlumdoorDiscountEffect)) {
    resolved = await resolveCommercialLine(kernelContext, {
      ...resolveInput,
      discountPercentageOverride: expectedDiscount,
    });
  }
  const pricingRuleSnapshots = withAlumdoorDefaultDiscountSnapshot(resolved.pricing_rule_snapshots, {
    ...item.data,
    item_code: itemCode,
  }, previewCustomerGroup, resolved.discount_percentage);

  // ── Giải trình đơn giá ───────────────────────────────────────────────────────────────────
  const chosenPrice = await readMaster(context, "Item Price", catalogText(resolved.item_price));
  const priceUom = catalogText(chosenPrice?.uom);
  const lineUom = catalogText(line.uom);
  // `source_uom` bị vứt trên đường về, nên suy lại từ đúng dữ kiện engine đã dùng: bản ghi giá
  // khai một ĐVT khác ĐVT của dòng ⇒ đơn giá đang hiện là giá đã quy đổi chéo. Chỉ kết luận khi
  // CẢ HAI đều có giá trị; thiếu một vế thì để `null` (chưa biết), không đoán là "không quy đổi".
  const convertedFromUom = priceUom && lineUom && priceUom !== lineUom ? priceUom : null;
  const areaTier = catalogText(chosenPrice?.area_tier);
  const tier = areaTier && areaTier !== "ALL_AREA_TIER"
    ? await readMaster(context, "Bậc diện tích", areaTier)
    : null;
  const rateChangedByRule = catalogText(resolved.base_rate) !== catalogText(resolved.selling_rate);

  const catalogWarnings: CatalogWarning[] = [];
  if (convertedFromUom) {
    catalogWarnings.push({
      code: "PRICE_CONVERTED_FROM_BASE_UOM",
      label: `Đơn giá quy đổi từ ĐVT ${convertedFromUom}, không phải giá khai cho ${lineUom}`,
      where: `Danh mục → Đơn giá theo bảng giá → ${resolved.item_price}`,
    });
  }

  // ── Phạm vi áp dụng chính sách giá: vì sao luật này lọt vào dòng ─────────────────────────
  // Chỉ tra đúng những luật ĐÃ ÁP. Quét cả danh mục `Pricing Rule` ở đây là dựng lại phép chọn
  // luật lần thứ hai bên cạnh engine — đúng kiểu "luật viết hai lần rồi trôi dạt".
  const appliedRuleNames = [...new Set([
    ...pricingRuleSnapshots.map((snapshot) => catalogText(snapshot.rule_name)),
    ...resolved.applied_adjustments.map((entry) => catalogText(entry.rule_name)),
  ].filter(Boolean))];
  const scopeEntries = await Promise.all(appliedRuleNames.map(async (ruleName) => {
    const rule = await readMaster(context, "Pricing Rule", ruleName);
    return [ruleName, catalogText(rule?.pricing_scope)] as const;
  }));
  const pricingScopeByRule: JsonObject = {};
  for (const [ruleName, scope] of scopeEntries) if (scope) pricingScopeByRule[ruleName] = scope;

  // ── Ngữ cảnh danh mục của dòng ───────────────────────────────────────────────────────────
  // `min_area_sqm` là diện tích tối thiểu tính tiền của MỘT BỘ, và nó thật sự kéo tiền lên khi
  // dòng nhỏ hơn (`document-validation.ts` chốt `max(rộng × cao, tối thiểu) × số bộ` lúc lưu).
  // Người bán phải thấy điều đó, vì khách sẽ hỏi tại sao cửa nhỏ mà tiền không giảm thêm.
  const minAreaSqm = catalogNumber(item.data.min_area_sqm);
  const minAreaApplied = minAreaSqm !== null && minAreaSqm > 0 && previewAreaPerSet !== undefined
    ? previewAreaPerSet <= minAreaSqm
    : null;

  /**
   * "10 chặn cảnh báo" — XEM TRƯỚC phải chặn CÙNG một luật với lúc lưu, nếu không người bán
   * thấy một dòng giá đẹp rồi mới ăn lỗi lúc bấm Lưu. Chặn theo `resolved.price_variant`
   * (biến thể engine THỰC SỰ dùng để ra giá), không theo chuỗi client gửi.
   */
  assertAlumdoorGiftRailAllowed(
    { ...item.data, item_code: itemCode },
    physicalGiftAreaPerSet,
    resolved.price_variant,
    itemCode,
  );

  return {
    ...resolved,
    pricing_rule_snapshots: pricingRuleSnapshots,
    // P0-3: chỉ biến thể TANG_RAY mới được tặng ray. `resolved.price_variant` là biến thể
    // engine ĐÃ thực sự dùng để ra giá, không phải chuỗi client gửi.
    benefit_items: alumdoorCommercialBenefits(
      { ...item.data, item_code: itemCode },
      physicalGiftAreaPerSet,
      resolved.price_variant,
    ),
    rate: resolved.selling_rate,
    amount: resolved.net_before_tax,
    net_amount: resolved.net_before_tax,

    /**
     * PHẦN TRĂM CHÍNH SÁCH — để màn bán nói được "15%", KHÔNG phải để điền vào ô nhập.
     *
     * Chiết khấu 15% cửa Đức chảy qua LUẬT GIÁ (số tiền trên m², vì 15% tính trên đơn giá chỉ
     * lá kể cả khi bán bản tặng ray). Ô `discount_percentage` trên dòng là chiết khấu NHẬP TAY;
     * điền 15 vào đó là trừ hai lần, và kernel chặn thẳng — "chiết khấu bị trừ hai lần cho cùng
     * một chính sách". Nên con số này chỉ để hiển thị, cạnh khoản tiền đã giảm.
     *
     * Lấy từ chính `defaultAlumdoorDiscountPercent` mà khâu ghi sổ dùng, nên hai nơi không thể
     * nói hai con số khác nhau.
     */
    policy_discount_percentage: expectedDiscount,

    // ── THÊM MỚI 2026-08-21 · tất cả optional, không trường cũ nào đổi nghĩa ────────────────
    ...(chosenPrice === null ? {} : {
      price_explain: {
        price_list: priceList,
        item_price: resolved.item_price,
        price_variant: resolved.price_variant,
        line_uom: lineUom || null,
        price_uom: priceUom || null,
        converted_from_uom: convertedFromUom,
        price_rate: chosenPrice.rate === undefined || chosenPrice.rate === null
          ? null
          : String(chosenPrice.rate),
        base_rate: resolved.base_rate,
        selling_rate: resolved.selling_rate,
        rate_changed_by_rule: rateChangedByRule,
        area_tier: areaTier || null,
        area_tier_basis_sqm: previewAreaPerSet ?? null,
        area_tier_bounds: tier
          ? { min_area_sqm: catalogNumber(tier.min_area_sqm), max_area_sqm: catalogNumber(tier.max_area_sqm) }
          : null,
        posting_date: postingDate,
        currency,
        note: convertedFromUom
          ? `Không có dòng giá cho ${lineUom}; lấy ${resolved.item_price} (${priceUom}) rồi quy đổi `
            + `⇒ ${resolved.selling_rate} ${currency}/${lineUom}.`
          : `Đơn giá ${resolved.selling_rate} ${currency}/${priceUom || lineUom || "ĐVT dòng"} từ `
            + `${resolved.item_price}${areaTier ? `, bậc ${areaTier}` : ""}.`,
      },
    }),
    /**
     * ── NGƯỠNG TẶNG RAY TRẢ XUỐNG CLIENT ────────────────────────────────────────────────
     * Client phải tự tick hộ người bán khi vượt ngưỡng, nên nhận cả con số lẫn toán tử từ
     * Item master. Hai tầng cùng gọi một engine eligibility, không tự viết lại phép so.
     *
     * `gift_rail_eligible` = dòng này có ĐỦ ĐIỀU KIỆN được tặng ray hay không (đúng phạm vi
     * chính sách + đạt ngưỡng). Nó KHÔNG nói người bán đã tick hay chưa — tick là quyền của
     * người bán, server chỉ được phép TỪ CHỐI tick sai (dưới ngưỡng), không được ép tick.
     */
    gift_rail_threshold_sqm: alumdoorGiftRailThresholdSqm({ ...item.data, item_code: itemCode }),
    gift_rail_area_operator: alumdoorGiftRailAreaOperator({ ...item.data, item_code: itemCode }),
    gift_rail_area_sqm: physicalGiftAreaPerSet ?? null,
    gift_rail_eligible: defaultAlumdoorDiscountPercent({ ...item.data, item_code: itemCode }) === 15
      && alumdoorGiftRailEligible({ ...item.data, item_code: itemCode }, physicalGiftAreaPerSet),
    pricing_scope_by_rule: pricingScopeByRule,
    catalog_context: {
      item_group: catalogText(item.data.item_group) || null,
      door_type: catalogText(item.data.door_type) || null,
      inventory_mode: catalogText(item.data.inventory_mode) || null,
      measurement_profile: catalogText(item.data.measurement_profile) || null,
      material_specification: catalogText(item.data.material_specification) || null,
      min_area_sqm: minAreaSqm,
      min_area_applied: minAreaApplied,
      gift_rail_min_area_sqm: alumdoorGiftRailThresholdSqm({ ...item.data, item_code: itemCode }),
      gift_rail_area_operator: alumdoorGiftRailAreaOperator({ ...item.data, item_code: itemCode }),
    },
    catalog_warnings: catalogWarnings,
  };
}
