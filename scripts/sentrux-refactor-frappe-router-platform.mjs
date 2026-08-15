import { readFile, writeFile } from "node:fs/promises";

const routerPath = "server/packages/frappe-api/src/router.ts";
const platformPath = "server/packages/frappe-api/src/router-platform.ts";

let router = await readFile(routerPath, "utf8");

const contractsImport = 'import type { Actor, CanonicalDocument, JsonObject, JsonValue, MutationAction, MutationCommand, MutationReceipt } from "../../contracts/src/index.js";';
if (!router.includes(contractsImport)) throw new Error("Expected contracts import not found in frappe-api router");

const removals = [
  'import { errors, sha256Hex } from "../../core/src/index.js";',
  'import { resolveCommercialLine } from "../../clouderp-selling/src/index.js";',
  'import type { D1MutationStore, DocumentListService, ListFilter } from "../../document-kernel/src/index.js";',
  `import type {\n  D1CollaborationService, DocTypeMeta, DocumentAccessStore, ExtendedPermissionAction,\n  MetadataPermissionService, MetadataStore,\n} from "../../frappe-model/src/index.js";`,
  `import {\n  blocksSelfApproval, mergeCustomizations, parseCsvImport, parseCustomField, parseDocTypeMeta,\n  parsePropertySetter, permissionAllows, renderPrintFormat, resolveAutoname, validateWorkflow,\n} from "../../frappe-model/src/index.js";`,
  'import type { CustomFieldRecord, CustomizationStore, D1SearchStore, PropertySetterRecord } from "../../frappe-model/src/index.js";',
  'import type { D1UserStore } from "../../auth/src/index.js";',
  'import { parseQueryRequest, type AppReportService, type AppReportSpec, type D1ReportService, type QueryFilter } from "../../query/src/index.js";',
  `import {\n  appMethodTarget, combinedNavigation, dispatchAppMethod, navItemPath,\n  type AppInstaller, type AppMethodEnv,\n} from "../../app-registry/src/index.js";`,
];

for (const statement of removals) {
  if (!router.includes(statement)) throw new Error(`Expected router import not found: ${statement.slice(0, 80)}`);
  router = router.replace(`${statement}\n`, "");
}

const boundaryImport = `import {\n  appMethodTarget, blocksSelfApproval, combinedNavigation, dispatchAppMethod, errors, mergeCustomizations,\n  navItemPath, parseCsvImport, parseCustomField, parseDocTypeMeta, parsePropertySetter, parseQueryRequest,\n  permissionAllows, renderPrintFormat, resolveAutoname, resolveCommercialLine, sha256Hex, validateWorkflow,\n  type Actor, type AppInstaller, type AppMethodEnv, type AppReportService, type AppReportSpec,\n  type CanonicalDocument, type CustomFieldRecord, type CustomizationStore, type D1CollaborationService,\n  type D1MutationStore, type D1ReportService, type D1SearchStore, type D1UserStore, type DocTypeMeta,\n  type DocumentAccessStore, type DocumentListService, type ExtendedPermissionAction, type JsonObject,\n  type JsonValue, type ListFilter, type MetadataPermissionService, type MetadataStore, type MutationAction,\n  type MutationCommand, type MutationReceipt, type PropertySetterRecord, type QueryFilter,\n} from "./router-platform.js";`;
router = router.replace(contractsImport, boundaryImport);

const platform = `/**\n * Stable platform-facing dependency boundary for the Frappe transport router.\n *\n * The router translates HTTP/Frappe wire shapes. It should depend on one platform\n * surface rather than knowing which kernel package owns every primitive. Keeping\n * that package wiring here lowers transport coupling without changing behaviour.\n */\nexport type {\n  Actor, CanonicalDocument, JsonObject, JsonValue, MutationAction, MutationCommand, MutationReceipt,\n} from "../../contracts/src/index.js";\nexport { errors, sha256Hex } from "../../core/src/index.js";\nexport { resolveCommercialLine } from "../../clouderp-selling/src/index.js";\nexport type { D1MutationStore, DocumentListService, ListFilter } from "../../document-kernel/src/index.js";\nexport {\n  blocksSelfApproval, mergeCustomizations, parseCsvImport, parseCustomField, parseDocTypeMeta,\n  parsePropertySetter, permissionAllows, renderPrintFormat, resolveAutoname, validateWorkflow,\n} from "../../frappe-model/src/index.js";\nexport type {\n  CustomFieldRecord, CustomizationStore, D1CollaborationService, D1SearchStore, DocTypeMeta,\n  DocumentAccessStore, ExtendedPermissionAction, MetadataPermissionService, MetadataStore, PropertySetterRecord,\n} from "../../frappe-model/src/index.js";\nexport type { D1UserStore } from "../../auth/src/index.js";\nexport { parseQueryRequest } from "../../query/src/index.js";\nexport type { AppReportService, AppReportSpec, D1ReportService, QueryFilter } from "../../query/src/index.js";\nexport { appMethodTarget, combinedNavigation, dispatchAppMethod, navItemPath } from "../../app-registry/src/index.js";\nexport type { AppInstaller, AppMethodEnv } from "../../app-registry/src/index.js";\n`;

await writeFile(routerPath, router, "utf8");
await writeFile(platformPath, platform, "utf8");
