#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const statusPath = path.join(root, "docs", "FORGE_ENTERPRISE_CAPABILITY_STATUS.md");
const manifestPath = path.join(root, "docs", "agents", "rc4", "RC4_A20_EVIDENCE_MANIFEST.json");

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

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.snapshot.observed_through_pr = 623;
manifest.snapshot.note = "Final RC4 worker evidence re-convergence: A19 independently replays A1-A18 green; A22/A23 exact-head gates are green outside the A1-A19 maturity manifest. Canonical maturity still changes only for implementation integrated into this convergence tree.";

const laneByAgent = new Map(manifest.lanes.map((lane) => [lane.agent, lane]));
function updateLane(agent, patch) {
  const lane = laneByAgent.get(agent);
  if (!lane) throw new Error(`RC4-A20 R2 materializer cannot find ${agent}`);
  Object.assign(lane, patch);
}

updateLane("A4", {
  head_sha: "068ca98ba6446d367aed7667d6ba19170ec5869f",
  status: "READY",
  evidence_kind: "independent-executable",
  validated_head_sha: "068ca98ba6446d367aed7667d6ba19170ec5869f",
  workflow_run: 30875686652,
  integrated_in_tree: false,
  accepted_for_maturity: false,
  reason: "A19 final worker matrix independently passes the repaired VN statutory lane, including canonical App Action method naming, VAT/statutory regressions and four-eyes policy retirement. The backend/migration branch remains unmerged, so no branch-only maturity promotion is accepted."
});

updateLane("A10", {
  head_sha: "00b071130155d6a7359e4ab0eb1849048b57a139",
  status: "READY",
  evidence_kind: "independent-executable",
  validated_head_sha: "00b071130155d6a7359e4ab0eb1849048b57a139",
  workflow_run: 30875686652,
  integrated_in_tree: false,
  accepted_for_maturity: false,
  reason: "A19 final worker matrix independently passes Customer 360 after syntax, external ownership and new-metadata reserved-field repairs. Legacy CRM metadata debt remains separate; the A10 implementation is unmerged and therefore does not change canonical maturity."
});

updateLane("A13", {
  head_sha: "0822b9237b3d1485cc5d9bf72ff03e0834a10383",
  status: "READY",
  evidence_kind: "exact-executable",
  validated_head_sha: "0822b9237b3d1485cc5d9bf72ff03e0834a10383",
  workflow_run: 30874796558,
  integrated_in_tree: false,
  accepted_for_maturity: false,
  reason: "Manufacturing/QMS lane-owned exactOptionalPropertyTypes defects are repaired; own exact-head validation and A19 adversarial replay are green. The branch remains unmerged and domain dependencies still bound any maturity promotion."
});

updateLane("A19", {
  head_sha: "fea98132a0adfbef1c6ca3066082320d28be364d",
  status: "DONE",
  evidence_kind: "independent-executable",
  validated_head_sha: "bfdff28cfcb2f052775f1a6812793235009cbb0c",
  workflow_run: 30875784687,
  integrated_in_tree: false,
  accepted_for_maturity: false,
  reason: "A19 independently replayed all A1-A18 worker lanes plus baseline truth, A2 provider/source separation and merged A6 browser provenance. Run 30875784687 is green after PASS handoff materialization; the latest A19 change is evidence-only and QA itself never promotes capability maturity."
});

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("RC4-A20 R2 materialization: final worker truth recorded; U01-001 Wired -> RC; counts 66/406/327/157");
