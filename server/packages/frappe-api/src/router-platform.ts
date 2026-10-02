/**
 * Stable platform-facing dependency boundary for the Frappe transport router.
 *
 * The router translates HTTP/Frappe wire shapes. It should depend on one platform
 * surface rather than knowing which kernel package owns every primitive. Keeping
 * that package wiring here lowers transport coupling without changing behaviour.
 */
export type {
  Actor, CanonicalDocument, JsonObject, JsonValue, MutationAction, MutationCommand, MutationReceipt,
} from "../../contracts/src/index.js";
export { errors, sha256Hex } from "../../core/src/index.js";
// Chốt chặn lúc LƯU `Item Price`, không phải lúc bán: khoá đặt tên năm đoạn đã gỡ mất chốt
// trùng tên của nền tảng, nên hai dòng giá cùng khớp một khoá lọt vào D1 được và chỉ lộ ra
// bằng "Multiple active Item Price records match" giữa lúc lập đơn.
export { areaTierBasisSqm, assertItemPriceTierIsUnambiguous } from "../../clouderp-pricing/src/index.js";
// Trục số lượng mua của Item là ô `valueSource: "formula"` — server phải tính lại ở mỗi lượt
// ghi. Luật nằm cạnh chỗ TIÊU THỤ nó (`applyUomConversion`), router chỉ gọi.
export { derivePurchaseQuantityAxis } from "../../clouderp-core/src/uom.js";
export {
  alumdoorCommercialBenefits,
  // Ngưỡng/toán tử tặng ray và chốt chặn dưới ngưỡng. Đường xem trước dùng cùng engine lúc lưu.
  alumdoorGiftRailAreaOperator,
  alumdoorGiftRailEligible,
  alumdoorGiftRailThresholdSqm,
  assertAlumdoorGiftRailAllowed,
  defaultAlumdoorDiscountPercent,
  hasAlumdoorDiscountEffect,
  resolveCommercialLine,
  withAlumdoorDefaultDiscountSnapshot,
} from "../../clouderp-selling/src/index.js";
export type { D1MutationStore, DocumentGroupProjection, DocumentListService, ListFilter } from "../../document-kernel/src/index.js";
export {
  blocksSelfApproval, evaluateWorkflowCondition, mergeCustomizations, parseCsvImport, parseCustomField, parseDocTypeMeta,
  parsePropertySetter, permissionAllows, renderPrintFormat, resolveAutoname, validateWorkflow,
} from "../../frappe-model/src/index.js";
export type {
  CustomFieldRecord, CustomizationStore, D1CollaborationService, D1SearchStore, DocTypeMeta,
  DocumentAccessStore, ExtendedPermissionAction, MetadataPermissionService, MetadataStore, PropertySetterRecord,
} from "../../frappe-model/src/index.js";
export type { D1UserStore } from "../../auth/src/index.js";
export { parseQueryRequest } from "../../query/src/index.js";
export type { AppReportService, AppReportSpec, D1ReportService, QueryFilter } from "../../query/src/index.js";
export { appMethodTarget, combinedNavigation, dispatchAppMethod, navItemPath } from "../../app-registry/src/index.js";
export type { AppInstaller, AppMethodEnv } from "../../app-registry/src/index.js";
