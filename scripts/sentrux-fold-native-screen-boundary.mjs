import { readFile, writeFile, unlink } from "node:fs/promises";

const screenPath = "client/packages/views/src/screen/ScreenView.tsx";
const nativePath = "client/packages/views/src/screen/NativeScreenView.tsx";
const indexPath = "client/packages/views/src/index.ts";
const packagePath = "client/packages/views/package.json";
const vitePath = "client/apps/runtime/vite.config.ts";

let screen = await readFile(screenPath, "utf8");
const actionImport = 'import { ActionScreen } from "../action/ActionScreen.js";';
if (!screen.includes(actionImport)) throw new Error("ScreenView ActionScreen import anchor missing");
screen = screen.replace(
  actionImport,
  `${actionImport}\nimport { preferFirstClassActionInputTables } from "../action/input-table.js";`,
);
const oldSelection = `export function ScreenView({ screen, actions = [], onNavigate }: ScreenViewProps) {\n  const screenActions = screen.app\n    ? actions.filter((action) => action.app === screen.app)\n    : actions;`;
const newSelection = `export function ScreenView({ screen, actions = [], onNavigate }: ScreenViewProps) {\n  // Public ScreenView owns the first-class input-table compatibility seam. Keeping\n  // the normalization here avoids an otherwise behavior-only wrapper module.\n  const normalizedActions = actions.map(preferFirstClassActionInputTables);\n  const screenActions = screen.app\n    ? normalizedActions.filter((action) => action.app === screen.app)\n    : normalizedActions;`;
if (!screen.includes(oldSelection)) throw new Error("ScreenView action selection anchor missing");
screen = screen.replace(oldSelection, newSelection);
await writeFile(screenPath, screen, "utf8");

let index = await readFile(indexPath, "utf8");
const oldIndexExport = 'export { ScreenView, type ScreenViewProps } from "./screen/NativeScreenView.js";';
if (!index.includes(oldIndexExport)) throw new Error("views index NativeScreenView export missing");
index = index.replace(oldIndexExport, 'export { ScreenView, type ScreenViewProps } from "./screen/ScreenView.js";');
await writeFile(indexPath, index, "utf8");

const pkg = JSON.parse(await readFile(packagePath, "utf8"));
const screenExport = pkg.exports?.["./screen"];
if (screenExport?.types !== "./dist/screen/NativeScreenView.d.ts" || screenExport?.import !== "./dist/screen/NativeScreenView.js") {
  throw new Error("views ./screen export no longer targets NativeScreenView");
}
pkg.exports["./screen"] = {
  types: "./dist/screen/ScreenView.d.ts",
  import: "./dist/screen/ScreenView.js",
};
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

let vite = await readFile(vitePath, "utf8");
const oldAlias = '{ find: /^@metaforge\\/views\\/screen$/, replacement: viewSource("screen/NativeScreenView") },';
if (!vite.includes(oldAlias)) throw new Error("runtime NativeScreenView alias missing");
vite = vite.replace(oldAlias, '{ find: /^@metaforge\\/views\\/screen$/, replacement: viewSource("screen/ScreenView") },');
await writeFile(vitePath, vite, "utf8");

const native = await readFile(nativePath, "utf8");
if (!native.includes("preferFirstClassActionInputTables") || !native.includes("ExistingScreenView")) {
  throw new Error("NativeScreenView is no longer the expected behavior-only wrapper");
}
await unlink(nativePath);
