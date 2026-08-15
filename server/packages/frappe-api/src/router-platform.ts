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
export { resolveCommercialLine } from "../../clouderp-selling/src/index.js";
export type { D1MutationStore, DocumentListService, ListFilter } from "../../document-kernel/src/index.js";
export {
  blocksSelfApproval, mergeCustomizations, parseCsvImport, parseCustomField, parseDocTypeMeta,
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
