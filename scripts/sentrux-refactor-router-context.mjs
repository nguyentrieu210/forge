import { readFile, writeFile } from "node:fs/promises";

const routerPath = "server/packages/frappe-api/src/router.ts";
const contextPath = "server/packages/frappe-api/src/router-context.ts";

let router = await readFile(routerPath, "utf8");

const interfaceStart = router.indexOf("export interface FrappeRouterContext {");
const interfaceEndMarker = "\n}\n\n/**\n * Doctypes that describe the platform rather than live in it.";
const interfaceEnd = router.indexOf(interfaceEndMarker, interfaceStart);
if (interfaceStart < 0 || interfaceEnd < 0) {
  throw new Error("FrappeRouterContext block not found; refusing to modify router.ts");
}

const interfaceBlock = router.slice(interfaceStart, interfaceEnd + 2);

const contextImports = `import type { Actor, JsonObject, MutationCommand, MutationReceipt } from "../../contracts/src/index.js";\nimport type { D1MutationStore, DocumentListService } from "../../document-kernel/src/index.js";\nimport type {\n  CustomizationStore, D1CollaborationService, D1SearchStore, DocumentAccessStore,\n  MetadataPermissionService, MetadataStore,\n} from "../../frappe-model/src/index.js";\nimport type { D1UserStore } from "../../auth/src/index.js";\nimport type { AppReportService, D1ReportService } from "../../query/src/index.js";\nimport type { AppInstaller, AppMethodEnv } from "../../app-registry/src/index.js";\nimport type { D1TranslationStore } from "./translations.js";\nimport type { D1DeskViewStore } from "./desk-views.js";\n\n`;

await writeFile(contextPath, `${contextImports}${interfaceBlock}\n`, "utf8");

const exactReplacements = [
  [
    'import type { Actor, CanonicalDocument, JsonObject, JsonValue, MutationAction, MutationCommand, MutationReceipt } from "../../contracts/src/index.js";',
    'import type { CanonicalDocument, JsonObject, JsonValue, MutationAction } from "../../contracts/src/index.js";',
  ],
  [
    'import type { D1MutationStore, DocumentListService, ListFilter } from "../../document-kernel/src/index.js";',
    'import type { ListFilter } from "../../document-kernel/src/index.js";',
  ],
  [
    'import type {\n  D1CollaborationService, DocTypeMeta, DocumentAccessStore, ExtendedPermissionAction,\n  MetadataPermissionService, MetadataStore,\n} from "../../frappe-model/src/index.js";',
    'import type { DocTypeMeta, ExtendedPermissionAction } from "../../frappe-model/src/index.js";',
  ],
  [
    'import type { CustomFieldRecord, CustomizationStore, D1SearchStore, PropertySetterRecord } from "../../frappe-model/src/index.js";',
    'import type { CustomFieldRecord, PropertySetterRecord } from "../../frappe-model/src/index.js";',
  ],
  ['import type { D1UserStore } from "../../auth/src/index.js";\n', ''],
  [
    'import { parseQueryRequest, type AppReportService, type AppReportSpec, type D1ReportService, type QueryFilter } from "../../query/src/index.js";',
    'import { parseQueryRequest, type AppReportSpec, type QueryFilter } from "../../query/src/index.js";',
  ],
  [
    'import {\n  appMethodTarget, combinedNavigation, dispatchAppMethod, navItemPath,\n  type AppInstaller, type AppMethodEnv,\n} from "../../app-registry/src/index.js";',
    'import { appMethodTarget, combinedNavigation, dispatchAppMethod, navItemPath } from "../../app-registry/src/index.js";',
  ],
  ['import type { D1TranslationStore } from "./translations.js";\n', ''],
  ['import { assertKanbanField, type D1DeskViewStore } from "./desk-views.js";', 'import { assertKanbanField } from "./desk-views.js";'],
];

for (const [before, after] of exactReplacements) {
  if (!router.includes(before)) throw new Error(`Expected router import not found: ${before}`);
  router = router.replace(before, after);
}

const accessControlImportEnd = '} from "./access-control.js";';
const importAnchor = router.indexOf(accessControlImportEnd);
if (importAnchor < 0) throw new Error("access-control import anchor not found");
const insertAt = importAnchor + accessControlImportEnd.length;
router = `${router.slice(0, insertAt)}\nimport type { FrappeRouterContext } from "./router-context.js";${router.slice(insertAt)}`;

router = router.slice(0, interfaceStart) + 'export type { FrappeRouterContext } from "./router-context.js";' + router.slice(interfaceEnd + 2);

await writeFile(routerPath, router, "utf8");
