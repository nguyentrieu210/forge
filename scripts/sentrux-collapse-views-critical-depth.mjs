import { readFile, writeFile, unlink } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content, "utf8");

// 1) Fold the behavior-only NativeScreenView wrapper into ScreenView.
const screenPath = "client/packages/views/src/screen/ScreenView.tsx";
let screen = await read(screenPath);
const actionImport = 'import { ActionScreen } from "../action/ActionScreen.js";';
if (!screen.includes(actionImport)) throw new Error("ScreenView ActionScreen import anchor missing");
screen = screen.replace(actionImport, `${actionImport}\nimport { preferFirstClassActionInputTables } from "../action/input-table.js";`);
const oldSelection = `export function ScreenView({ screen, actions = [], onNavigate }: ScreenViewProps) {\n  const screenActions = screen.app\n    ? actions.filter((action) => action.app === screen.app)\n    : actions;`;
const newSelection = `export function ScreenView({ screen, actions = [], onNavigate }: ScreenViewProps) {\n  const normalizedActions = actions.map(preferFirstClassActionInputTables);\n  const screenActions = screen.app\n    ? normalizedActions.filter((action) => action.app === screen.app)\n    : normalizedActions;`;
if (!screen.includes(oldSelection)) throw new Error("ScreenView action selection anchor missing");
screen = screen.replace(oldSelection, newSelection);
await write(screenPath, screen);

const indexPath = "client/packages/views/src/index.ts";
let index = await read(indexPath);
const oldIndexExport = 'export { ScreenView, type ScreenViewProps } from "./screen/NativeScreenView.js";';
if (!index.includes(oldIndexExport)) throw new Error("views index NativeScreenView export missing");
index = index.replace(oldIndexExport, 'export { ScreenView, type ScreenViewProps } from "./screen/ScreenView.js";');
await write(indexPath, index);

const viewsPackagePath = "client/packages/views/package.json";
const viewsPackage = JSON.parse(await read(viewsPackagePath));
const screenExport = viewsPackage.exports?.["./screen"];
if (screenExport?.types !== "./dist/screen/NativeScreenView.d.ts" || screenExport?.import !== "./dist/screen/NativeScreenView.js") {
  throw new Error("views ./screen export no longer targets NativeScreenView");
}
viewsPackage.exports["./screen"] = { types: "./dist/screen/ScreenView.d.ts", import: "./dist/screen/ScreenView.js" };
await write(viewsPackagePath, `${JSON.stringify(viewsPackage, null, 2)}\n`);

const vitePath = "client/apps/runtime/vite.config.ts";
let vite = await read(vitePath);
const oldAlias = '{ find: /^@metaforge\\/views\\/screen$/, replacement: viewSource("screen/NativeScreenView") },';
if (!vite.includes(oldAlias)) throw new Error("runtime NativeScreenView alias missing");
vite = vite.replace(oldAlias, '{ find: /^@metaforge\\/views\\/screen$/, replacement: viewSource("screen/ScreenView") },');
await write(vitePath, vite);

const nativePath = "client/packages/views/src/screen/NativeScreenView.tsx";
const native = await read(nativePath);
if (!native.includes("preferFirstClassActionInputTables") || !native.includes("ExistingScreenView")) {
  throw new Error("NativeScreenView is no longer the expected behavior-only wrapper");
}
await unlink(nativePath);

// 2) Remove AlumdoorWorkspaceBoundary from the critical path. Keep its mode logic
// in a focused hook, while DoctypeWorkspace lazy-loads the four screens directly.
const modePath = "client/packages/views/src/app/vertical/alumdoor/useAlumdoorWorkspaceMode.ts";
await write(modePath, `import { useMetaForge } from "../../../container/provider.js";\nimport type { UrlStateBridge } from "../../../list/useListState.js";\n\ntype ManufacturingStockPurpose = "Material Transfer" | "Manufacture";\n\nexport interface AlumdoorWorkspaceModeInput {\n  doctype: string;\n  isNew: boolean;\n  decoded?: string;\n  bridge: UrlStateBridge;\n}\n\nexport function useAlumdoorWorkspaceMode(input: AlumdoorWorkspaceModeInput) {\n  const { formProfiles } = useMetaForge();\n  const { doctype, isNew, decoded, bridge } = input;\n  const isAlumdoorProfile = Boolean(formProfiles?.["Item Group"]?.keep?.includes("default_measurement_profile"));\n  const useAlumdoorSalesForm = doctype === "Sales Order" && isAlumdoorProfile;\n  const useAlumdoorSalesCreate = isNew && useAlumdoorSalesForm;\n  const useAlumdoorSalesDetail = Boolean(decoded) && useAlumdoorSalesForm;\n  const useAlumdoorProductionRequestDetail = Boolean(decoded) && doctype === "Production Request" && isAlumdoorProfile;\n  const useAlumdoorWorkOrderDetail = Boolean(decoded) && doctype === "Work Order" && isAlumdoorProfile;\n  const manufacturingWorkOrder = bridge.get("f_work_order")?.trim() ?? "";\n  const requestedStockPurpose = bridge.get("f_purpose");\n  const manufacturingPurpose: ManufacturingStockPurpose | undefined = requestedStockPurpose === "Material Transfer" || requestedStockPurpose === "Manufacture"\n    ? requestedStockPurpose\n    : undefined;\n  const useAlumdoorManufacturingStockEntryContext = !isNew && !decoded && doctype === "Stock Entry"\n    && isAlumdoorProfile && Boolean(manufacturingWorkOrder && manufacturingPurpose);\n\n  return {\n    isAlumdoorProfile,\n    useAlumdoorSalesForm,\n    useAlumdoorSalesCreate,\n    useAlumdoorSalesDetail,\n    useAlumdoorProductionRequestDetail,\n    useAlumdoorWorkOrderDetail,\n    manufacturingWorkOrder,\n    manufacturingPurpose,\n    useAlumdoorManufacturingStockEntryContext,\n  };\n}\n`);

const workspacePath = "client/packages/views/src/app/DoctypeWorkspace.tsx";
let workspace = await read(workspacePath);
const reactImport = 'import { Suspense, useMemo, useState, type ReactNode } from "react";';
if (!workspace.includes(reactImport)) throw new Error("DoctypeWorkspace React import anchor missing");
workspace = workspace.replace(reactImport, 'import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";');
const boundaryImport = `import {\n  AlumdoorManufacturingStockEntryCreate,\n  AlumdoorProductionRequestDetail,\n  AlumdoorSalesOrderCreate,\n  AlumdoorWorkOrderDetail,\n  useAlumdoorWorkspaceMode,\n} from "./vertical/alumdoor/AlumdoorWorkspaceBoundary.js";`;
if (!workspace.includes(boundaryImport)) throw new Error("DoctypeWorkspace boundary import missing");
const directBoundary = `import { useAlumdoorWorkspaceMode } from "./vertical/alumdoor/useAlumdoorWorkspaceMode.js";\n\nconst AlumdoorSalesOrderCreate = lazy(() => import("./vertical/alumdoor/AlumdoorSalesOrderCreate.js").then((module) => ({ default: module.AlumdoorSalesOrderCreate })));\nconst AlumdoorProductionRequestDetail = lazy(() => import("./vertical/alumdoor/AlumdoorProductionRequestDetail.js").then((module) => ({ default: module.AlumdoorProductionRequestDetail })));\nconst AlumdoorWorkOrderDetail = lazy(() => import("./vertical/alumdoor/AlumdoorWorkOrderDetail.js").then((module) => ({ default: module.AlumdoorWorkOrderDetail })));\nconst AlumdoorManufacturingStockEntryCreate = lazy(() => import("./vertical/alumdoor/AlumdoorManufacturingStockEntryCreate.js").then((module) => ({ default: module.AlumdoorManufacturingStockEntryCreate })));`;
workspace = workspace.replace(boundaryImport, directBoundary);
await write(workspacePath, workspace);

const oldBoundaryPath = "client/packages/views/src/app/vertical/alumdoor/AlumdoorWorkspaceBoundary.tsx";
const oldBoundary = await read(oldBoundaryPath);
if (!oldBoundary.includes("useAlumdoorWorkspaceMode") || !oldBoundary.includes("AlumdoorSalesOrderCreate")) {
  throw new Error("AlumdoorWorkspaceBoundary no longer matches expected seam");
}
await unlink(oldBoundaryPath);

// 3) AllocationTimelineDialog already receives its owner from FormContainer. Pass
// adapter/scopeKey explicitly so the dialog no longer re-enters the provider.
const allocationPath = "client/packages/views/src/container/AllocationTimelineDialog.tsx";
let allocation = await read(allocationPath);
const adapterImport = 'import { NO_CAPS, type Capabilities } from "@metaforge/adapter-frappe";';
if (!allocation.includes(adapterImport)) throw new Error("Allocation adapter import anchor missing");
allocation = allocation.replace(adapterImport, 'import { NO_CAPS, type Capabilities, type FrappeAdapter } from "@metaforge/adapter-frappe";');
const providerImport = 'import { useMetaForge } from "./provider.js";\n';
if (!allocation.includes(providerImport)) throw new Error("Allocation provider import missing");
allocation = allocation.replace(providerImport, "");
const propsTail = `  error: string | null;\n  onClose: () => void;\n}`;
if (!allocation.includes(propsTail)) throw new Error("Allocation props anchor missing");
allocation = allocation.replace(propsTail, `  error: string | null;\n  adapter: FrappeAdapter;\n  scopeKey: string;\n  onClose: () => void;\n}`);
const oldStart = `export function AllocationTimelineDialog(props: AllocationTimelineDialogProps) {\n  const { open, timeline, loading, error, onClose } = props;\n  const { adapter, scopeKey } = useMetaForge();`;
const newStart = `export function AllocationTimelineDialog(props: AllocationTimelineDialogProps) {\n  const { open, timeline, loading, error, adapter, scopeKey, onClose } = props;`;
if (!allocation.includes(oldStart)) throw new Error("Allocation provider usage anchor missing");
allocation = allocation.replace(oldStart, newStart);
await write(allocationPath, allocation);

const formPath = "client/packages/views/src/container/FormContainer.tsx";
let form = await read(formPath);
const allocationCall = `      <AllocationTimelineDialog\n        open={allocationTimelineOpen}\n        timeline={allocationTimeline}\n        loading={allocationTimelineLoading}\n        error={allocationTimelineError}\n        onClose={() => setAllocationTimelineOpen(false)}\n      />`;
if (!form.includes(allocationCall)) throw new Error("FormContainer allocation call anchor missing");
form = form.replace(allocationCall, `      <AllocationTimelineDialog\n        open={allocationTimelineOpen}\n        timeline={allocationTimeline}\n        loading={allocationTimelineLoading}\n        error={allocationTimelineError}\n        adapter={adapter}\n        scopeKey={scopeKey}\n        onClose={() => setAllocationTimelineOpen(false)}\n      />`);
await write(formPath, form);

const harnessPath = "client/apps/runtime/purchase-harness/main.tsx";
let harness = await read(harnessPath);
const harnessCall = '<AllocationTimelineDialog open timeline={timeline} loading={false} error={null} onClose={() => undefined} />';
if (!harness.includes(harnessCall)) throw new Error("purchase harness allocation call anchor missing");
harness = harness.replace(harnessCall, '<AllocationTimelineDialog open timeline={timeline} loading={false} error={null} adapter={adapter} scopeKey="purchase-harness" onClose={() => undefined} />');
await write(harnessPath, harness);
