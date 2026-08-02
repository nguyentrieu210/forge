import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const indexPath = path.join(root, "apps/runtime/index.html");
const manifestPath = path.join(root, "apps/runtime/public/manifest.webmanifest");
const iconPath = path.join(root, "apps/runtime/public/forge-mark.svg");

const fail = (message) => {
  console.error(`PWA installability check failed: ${message}`);
  process.exitCode = 1;
};

const index = fs.readFileSync(indexPath, "utf8");
if (!/rel=["']manifest["'][^>]+href=["']\/manifest\.webmanifest["']/.test(index)) {
  fail("runtime index must link /manifest.webmanifest");
}
if (/serviceWorker\.register|navigator\.serviceWorker/.test(index)) {
  fail("installability slice must not fake offline support with a service worker registration");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const key of ["name", "short_name", "start_url", "scope", "display"]) {
  if (!manifest[key]) fail(`manifest is missing ${key}`);
}
if (manifest.start_url !== "/" || manifest.scope !== "/" || manifest.id !== "/") {
  fail("manifest app identity/start/scope must stay same-origin root scoped");
}
if (!["standalone", "minimal-ui", "fullscreen"].includes(manifest.display)) {
  fail("manifest display must be installable");
}
if (manifest.prefer_related_applications === true) {
  fail("Forge must remain the preferred installed app");
}

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
for (const required of ["192x192", "512x512"]) {
  if (!icons.some((icon) => String(icon.sizes ?? "").split(/\s+/).includes(required))) {
    fail(`manifest must expose a ${required} icon`);
  }
}
if (!icons.every((icon) => icon.src === "/forge-mark.svg" && icon.type === "image/svg+xml")) {
  fail("install icons must resolve to the canonical Forge vector asset");
}
if (!fs.existsSync(iconPath)) fail("canonical Forge icon asset is missing");

if (!process.exitCode) console.log("PWA installability contract OK");
