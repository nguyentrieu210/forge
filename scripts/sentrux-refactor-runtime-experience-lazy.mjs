import { readFile, writeFile } from "node:fs/promises";

const mainPath = "client/apps/runtime/src/main-base.tsx";
const lazyPath = "client/apps/runtime/src/experiences/lazy.tsx";

let main = await readFile(mainPath, "utf8");

const lazyLines = [
  'const ApprovalInbox = lazy(() => import("./experiences/ApprovalInbox.js").then((module) => ({ default: module.ApprovalInbox })));',
  'const SocialCommerce = lazy(() => import("./experiences/SocialCommerce.js").then((module) => ({ default: module.SocialCommerce })));',
  'const DailyDetailedLedger = lazy(() => import("./experiences/DailyDetailedLedger.js").then((module) => ({ default: module.DailyDetailedLedger })));',
  'const AlumdoorOperationsCenter = lazy(() => import("./experiences/AlumdoorOperationsCenter.js").then((module) => ({ default: module.AlumdoorOperationsCenter })));',
  'const AlumdoorAttendanceScanner = lazy(() => import("./experiences/AlumdoorAttendanceScanner.js").then((module) => ({ default: module.AlumdoorAttendanceScanner })));',
  'const AlumdoorAttendanceOperations = lazy(() => import("./experiences/AlumdoorAttendanceOperations.js").then((module) => ({ default: module.AlumdoorAttendanceOperations })));',
  'const AlumdoorMasterDataScreen = lazy(() => import("./experiences/AlumdoorMasterDataScreen.js").then((module) => ({ default: module.AlumdoorMasterDataScreen })));',
];

for (const line of lazyLines) {
  if (!main.includes(line)) throw new Error(`Expected runtime lazy declaration not found: ${line.slice(0, 90)}`);
}

const anchor = 'import { Storefront, type StorefrontPage } from "./storefront/Storefront.js";';
if (!main.includes(anchor)) throw new Error("Expected Storefront import anchor not found");

const boundaryImport = `import {\n  AlumdoorAttendanceOperations, AlumdoorAttendanceScanner, AlumdoorMasterDataScreen, AlumdoorOperationsCenter,\n  ApprovalInbox, DailyDetailedLedger, SocialCommerce,\n} from "./experiences/lazy.js";`;
main = main.replace(anchor, `${anchor}\n${boundaryImport}`);
for (const line of lazyLines) main = main.replace(`${line}\n`, "");

const lazyModule = `import { lazy } from "react";\n\n/**\n * Lazy-loaded runtime experiences.\n *\n * The generic runtime chooses an experience by manifest key, but it should not\n * carry a direct dependency edge to every hand-written screen. This registry\n * preserves one chunk per experience while keeping the shell's dependency graph\n * stable as new operational screens are added.\n */\nexport const ApprovalInbox = lazy(() => import("./ApprovalInbox.js").then((module) => ({ default: module.ApprovalInbox })));\nexport const SocialCommerce = lazy(() => import("./SocialCommerce.js").then((module) => ({ default: module.SocialCommerce })));\nexport const DailyDetailedLedger = lazy(() => import("./DailyDetailedLedger.js").then((module) => ({ default: module.DailyDetailedLedger })));\nexport const AlumdoorOperationsCenter = lazy(() => import("./AlumdoorOperationsCenter.js").then((module) => ({ default: module.AlumdoorOperationsCenter })));\nexport const AlumdoorAttendanceScanner = lazy(() => import("./AlumdoorAttendanceScanner.js").then((module) => ({ default: module.AlumdoorAttendanceScanner })));\nexport const AlumdoorAttendanceOperations = lazy(() => import("./AlumdoorAttendanceOperations.js").then((module) => ({ default: module.AlumdoorAttendanceOperations })));\nexport const AlumdoorMasterDataScreen = lazy(() => import("./AlumdoorMasterDataScreen.js").then((module) => ({ default: module.AlumdoorMasterDataScreen })));\n`;

await writeFile(mainPath, main, "utf8");
await writeFile(lazyPath, lazyModule, "utf8");
