import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const projectRoot = process.cwd();
const configPath = path.join(projectRoot, "tsconfig.json");
const sourcePath = path.join(projectRoot, "apps", "tenant-worker", "src", "index-core.ts");
const outputPath = path.join(projectRoot, "dist", "apps", "tenant-worker", "src", "index-core.js");

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) fail([configFile.error]);

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot, undefined, configPath);
if (parsed.errors.length > 0) fail(parsed.errors);

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const sourceFile = program.getSourceFile(sourcePath);
if (!sourceFile) {
  throw new Error(`Tenant Worker core source is missing from the TypeScript program: ${sourcePath}`);
}

const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
if (diagnostics.length > 0) fail(diagnostics);

const emitted = [];
const result = program.emit(sourceFile, (fileName, data, writeByteOrderMark) => {
  fs.mkdirSync(path.dirname(fileName), { recursive: true });
  fs.writeFileSync(fileName, data, { encoding: "utf8", flag: "w" });
  if (writeByteOrderMark) {
    const content = fs.readFileSync(fileName);
    fs.writeFileSync(fileName, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]));
  }
  emitted.push(path.relative(projectRoot, fileName));
});
if (result.emitSkipped) fail(result.diagnostics);
if (!fs.existsSync(outputPath)) {
  throw new Error(`Targeted Tenant Worker core emit did not create ${outputPath}; emitted: ${emitted.join(", ")}`);
}

console.log(`Tenant Worker core emit: ${emitted.join(", ")}`);

function fail(diagnostics) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => projectRoot,
    getNewLine: () => "\n",
  };
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
}
