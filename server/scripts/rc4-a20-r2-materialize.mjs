#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const statusPath = path.join(root, "docs", "FORGE_ENTERPRISE_CAPABILITY_STATUS.md");

let text = fs.readFileSync(statusPath, "utf8");

function converge(oldText, newText, label) {
  if (text.includes(newText)) return;
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`RC4-A20 R2 materializer cannot find ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`RC4-A20 R2 materializer found duplicate ${label}`);
  text = text.slice(0, first) + newText + text.slice(first + oldText.length);
}

converge("| RC | 65 | 6.80% |", "| RC | 66 | 6.90% |", "RC baseline count");
converge("| Wired | 407 | 42.57% |", "| Wired | 406 | 42.47% |", "Wired baseline count");

const oldSummary = "**Hardened = 0 by evidence.** RC3 retains the four narrow historical RC claims and adds **61 scoped RC promotions** accepted by A5 from exact Transaction Closure / WS09 executable evidence. A2 contributes seven lower-level promotions plus three privacy demotions; A4 contributes four device-capability promotions plus one Push demotion. No merge, source presence, provider config or historical production release is treated as Hardened evidence.";
const newSummary = "**Hardened = 0 by evidence.** RC3 retains the four narrow historical RC claims and adds **61 scoped RC promotions** accepted by A5 from exact Transaction Closure / WS09 executable evidence. A2 contributes seven lower-level promotions plus three privacy demotions; A4 contributes four device-capability promotions plus one Push demotion. RC4-A20 R2 adds **one current-main promotion** (`U01-001` Wired -> RC) from merged A6 exact cross-device browser evidence. No branch-only implementation, source presence, provider config or historical production release is treated as Hardened evidence.";
converge(oldSummary, newSummary, "maturity summary");

const oldDelta = "Historical RC-01 counts were `Hardened=0 / RC=4 / Wired=448 / Foundation=345 / Missing=159`; RC3 delta is `0 / +61 / -41 / -18 / -2`.";
const newDelta = "Historical RC-01 counts were `Hardened=0 / RC=4 / Wired=448 / Foundation=345 / Missing=159`; current RC4-A20 R2 delta is `0 / +62 / -42 / -18 / -2` after integrating A6 responsive-browser evidence on main.";
converge(oldDelta, newDelta, "historical delta");

const oldUiEvidence = "- `E-UI`: exact RC3 source authority is **MetaForge V2** after the V3 rollback; responsive/installable PWA remains Wired. Barcode/QR/geolocation/signature are Wired source paths; Push and offline cache/write/sync/conflict remain Missing where evidence is absent. Current browser/device/exact-release proof remains required for RC.";
const newUiEvidence = "- `E-UI`: exact source authority is **MetaForge V2**. RC4-A6 PR #598 is merged on current main and exact browser run `30871503111` / job `91874277369` passed demo build, 50 browser checks, runtime build and 19 runtime/login/PWA checks across desktop/tablet/Pixel/360px/dark/reduced-motion; `U01-001` Responsive PWA therefore reaches RC. `U01-002` Installable PWA remains Wired because standalone installed-launch proof is absent; `U01-003..007` and `U01-013` remain Missing; `U01-009..012` remain Wired pending physical/authorized device evidence. Exact production `/health` + `/release.json` proof remains absent, so no UI Hardened claim is made.";
converge(oldUiEvidence, newUiEvidence, "E-UI evidence bundle");

const oldU01 = "| Wired | `U01-001` `U01-002` `U01-009..U01-012` | `E-UI` |\n| Foundation | `U01-008` | `E-UI` |";
const newU01 = "| RC | `U01-001` | `E-UI` |\n| Wired | `U01-002` `U01-009..U01-012` | `E-UI` |\n| Foundation | `U01-008` | `E-UI` |";
converge(oldU01, newU01, "U01 registry rows");

fs.writeFileSync(statusPath, text, "utf8");
console.log("RC4-A20 R2 materialization: U01-001 Wired -> RC; counts 66/406/327/157");
