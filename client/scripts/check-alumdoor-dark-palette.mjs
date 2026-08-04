import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../apps/runtime/src/alumdoor-dark-palette.css", import.meta.url));
const css = readFileSync(path, "utf8");
const allowed = new Set(["#000000", "#f45b24", "#ffffff"]);
const hex = [...new Set(css.match(/#[0-9a-fA-F]{6}\b/g) ?? [])].map((value) => value.toLowerCase()).sort();
const unexpected = hex.filter((value) => !allowed.has(value));

if (unexpected.length) {
  throw new Error(`Alumdoor dark palette leaked colors outside black/orange/white: ${unexpected.join(", ")}`);
}

for (const required of allowed) {
  if (!hex.includes(required)) throw new Error(`Alumdoor dark palette is missing required base color ${required}`);
}

if (/\b(?:rgb|rgba|hsl|hsla|oklch|lab|lch)\s*\(/i.test(css)) {
  throw new Error("Alumdoor dark palette must derive variants with color-mix from the three base colors, not introduce raw color functions");
}

for (const token of ["info", "success", "warning", "destructive"]) {
  if (!css.includes(`--${token}: var(--alu-orange);`)) {
    throw new Error(`Alumdoor dark semantic token --${token} must collapse to orange`);
  }
  if (!css.includes(`--${token}-text: var(--alu-white);`)) {
    throw new Error(`Alumdoor dark semantic token --${token}-text must collapse to white`);
  }
}

console.log(`Alumdoor dark palette OK: ${hex.length} base colors (${hex.join(", ")})`);