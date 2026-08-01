import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: ${error.message}`);
  }
}

function sourcePathOf(source) {
  if (source instanceof URL) {
    if (source.protocol !== "file:") {
      throw new Error(`${source}: brief source URL phải dùng giao thức file:.`);
    }
    return fileURLToPath(source);
  }
  if (typeof source !== "string") {
    throw new TypeError("brief source phải là đường dẫn chuỗi hoặc file URL.");
  }
  return source;
}

/**
 * Read a brief plus its optional print-format sidecar.
 *
 * Accepts either a filesystem path or a file URL so CLI paths and import.meta.url-based
 * tests use the same loader contract.
 *
 * Large production briefs should not have every A4 template embedded in the same JSON file.
 * A sibling `<brief>.prints.json` keeps print design independently reviewable while still
 * producing one ordinary brief before schema validation and compilation.
 *
 * @param {string | URL} source
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readBriefSource(source) {
  const sourcePath = sourcePathOf(source);
  const brief = parseJson(await readFile(sourcePath, "utf8"), sourcePath);
  const parsed = path.parse(sourcePath);
  const printsSource = path.join(parsed.dir, `${parsed.name}.prints.json`);

  let extensionText;
  try {
    extensionText = await readFile(printsSource, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return brief;
    throw error;
  }

  const extension = parseJson(extensionText, printsSource);
  if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
    throw new Error(`${printsSource}: gốc file phải là object.`);
  }

  const unsupported = Object.keys(extension).filter((key) => key !== "version" && key !== "prints" && !key.startsWith("//"));
  if (unsupported.length) {
    throw new Error(`${printsSource}: chỉ nhận version, prints và khóa ghi chú //; không nhận ${unsupported.join(", ")}.`);
  }
  if (!Array.isArray(extension.prints) || extension.prints.length === 0) {
    throw new Error(`${printsSource}: prints phải là mảng không rỗng.`);
  }
  if (brief.prints !== undefined && !Array.isArray(brief.prints)) {
    throw new Error(`${sourcePath}: prints hiện có phải là mảng trước khi ghép sidecar.`);
  }

  return {
    ...brief,
    ...(extension.version ? { version: extension.version } : {}),
    prints: [...(brief.prints ?? []), ...extension.prints],
  };
}
