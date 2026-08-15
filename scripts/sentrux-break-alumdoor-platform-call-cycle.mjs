import { readFile, writeFile } from "node:fs/promises";

const indexPath = "server/apps-src/alumdoor-worker/src/index.ts";
const lotsPath = "server/apps-src/alumdoor-worker/src/lots-from-receipt.ts";
const contractPath = "server/apps-src/alumdoor-worker/src/platform-call.ts";

let index = await readFile(indexPath, "utf8");
let lots = await readFile(lotsPath, "utf8");

const definition = 'export type PlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via: string };';
if (!index.includes(definition)) throw new Error("PlatformCall definition not found in index.ts");
index = index.replace(definition, 'import type { PlatformCall } from "./platform-call.js";\nexport type { PlatformCall } from "./platform-call.js";');

const oldImport = 'import type { PlatformCall } from "./index.js";';
if (!lots.includes(oldImport)) throw new Error("lots-from-receipt PlatformCall import not found");
lots = lots.replace(oldImport, 'import type { PlatformCall } from "./platform-call.js";');

await writeFile(contractPath, `${definition}\n`, "utf8");
await writeFile(indexPath, index, "utf8");
await writeFile(lotsPath, lots, "utf8");
