import { readFile, writeFile } from "node:fs/promises";

const dir = "client/packages/controls/src";
const indexPath = `${dir}/index.ts`;
const contractPath = `${dir}/contract.ts`;
const implementationPaths = [`${dir}/controls.tsx`, `${dir}/media.tsx`, `${dir}/register.ts`];

const index = await readFile(indexPath, "utf8");
const barrelAnchor = 'export * from "./controls.js";';
const splitAt = index.indexOf(barrelAnchor);
if (splitAt < 0) throw new Error("controls index barrel anchor not found");

const foundation = index.slice(0, splitAt).trimEnd() + "\n";
const barrel = index.slice(splitAt).trimStart();
await writeFile(contractPath, foundation, "utf8");
await writeFile(indexPath, `export * from "./contract.js";\n${barrel}`, "utf8");

for (const path of implementationPaths) {
  let source = await readFile(path, "utf8");
  if (!source.includes('from "./index.js"')) throw new Error(`expected index import missing in ${path}`);
  source = source.replaceAll('from "./index.js"', 'from "./contract.js"');
  await writeFile(path, source, "utf8");
}
