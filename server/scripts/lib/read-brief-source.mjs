import { readFile } from "node:fs/promises";
import path from "node:path";

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: ${error.message}`);
  }
}

/**
 * Read a brief plus its optional print-format sidecar.
 *
 * Large production briefs should not have every A4 template embedded in the same JSON file.
 * A sibling `<brief>.prints.json` keeps print design independently reviewable while still
 * producing one ordinary brief before schema validation and compilation.
 */
export async function readBriefSource(source) {
  const brief = parseJson(await readFile(source, "utf8"), source);
  const parsed = path.parse(source);
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
    throw new Error(`${source}: prints hiện có phải là mảng trước khi ghép sidecar.`);
  }

  return {
    ...brief,
    ...(extension.version ? { version: extension.version } : {}),
    prints: [...(brief.prints ?? []), ...extension.prints],
  };
}
