import fs from "node:fs";

const STATUS = "docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md";
const CURRENT = "CURRENT_STATUS.md";
const NEXT = "NEXT_TASKS.md";
const CONVERGENCE = "docs/agents/rc/RC3_CONVERGENCE_20260804.md";

function read(path) { return fs.readFileSync(path, "utf8"); }
function writeIfChanged(path, content) {
  const current = read(path);
  if (current !== content) fs.writeFileSync(path, content);
}
function replaceOnce(text, pattern, replacement, label) {
  if (typeof pattern === "string") {
    if (text.split("\n").map((line) => line.trimEnd()).join("\n").includes(replacement.split("\n").map((line) => line.trimEnd()).join("\n"))) return text;
    if (text.includes(replacement)) return text;
    if (!text.includes(pattern)) throw new Error(`RC3 convergence pattern missing: ${label}`);
    return text.replace(pattern, replacement);
  }
  if (text.match(pattern)?.[0] === replacement) return text;
  if (!pattern.test(text)) throw new Error(`RC3 convergence regex missing: ${label}`);
  return text.replace(pattern, replacement);
}
function replaceFamily(text, family, nextFamily, body) {
  const pattern = new RegExp(`### ${family} \\([^\\n]+\\)\\n[\\s\\S]*?(?=\\n### ${nextFamily} \\()`);
  if (!pattern.test(text)) throw new Error(`Family section not found: ${family}`);
  return text.replace(pattern, body.trimEnd());
}

let status = read(STATUS);
status = replaceOnce(status,
  "> RC-01 capability truth baseline  \n> Baseline: `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`  \n> Branch: `rc/w0-capability-status`  \n> Date: 2026-08-03  ",
  "> RC3 exact-main release-confidence convergence  \n> Program seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  \n> Control: `program/rc3-exact-main-release-confidence-20260804`  \n> Date: 2026-08-04  ",
  "status header",
);
status = replaceOnce(status,
`| Hardened | 0 | 0.00% |
| RC | 4 | 0.42% |
| Wired | 448 | 46.86% |
| Foundation | 345 | 36.09% |
| Missing | 159 | 16.63% |
| **Total** | **956** | **100.00%** |`,
`| Hardened | 0 | 0.00% |
| RC | 65 | 6.80% |
| Wired | 407 | 42.57% |
| Foundation | 327 | 34.21% |
| Missing | 157 | 16.42% |
| **Total** | **956** | **100.00%** |`,
  "maturity report",
);
status = status.replace(/\*\*Hardened = 0 by evidence\.\*\*[\s\S]*?\n\n## Evidence Index/,
`**Hardened = 0 by evidence.** RC3 retains the four narrow historical RC claims and adds **61 scoped RC promotions** accepted by A5 from exact Transaction Closure / WS09 executable evidence. A2 contributes seven lower-level promotions plus three privacy demotions; A4 contributes four device-capability promotions plus one Push demotion. No merge, source presence, provider config or historical production release is treated as Hardened evidence.\n\nHistorical RC-01 counts were \`Hardened=0 / RC=4 / Wired=448 / Foundation=345 / Missing=159\`; RC3 delta is \`0 / +61 / -41 / -18 / -2\`.\n\n## Evidence Index`);

const evidence = {
  "E-FIN": "- `E-FIN`: RC3 consumes RC-020/021/023 plus Transaction Closure run `30847056639` / job `91797832548` (221/221 focused regressions) for only the named Finance RC slices; exact current source/migration remains authoritative; year-end close, broader FX/consolidation/statutory/provider and exact-production evidence remain below RC/Hardened.",
  "E-PROC": "- `E-PROC`: RC3 uses Transaction Closure P2P 30/30 executable evidence for named Purchase Invoice/partial receipt/invoice/3-way-match/variance capabilities; landed-cost authoritative stock-value application/reversal and supplier-management breadth remain open; production proof none.",
  "E-STOCK": "- `E-STOCK`: RC3 combines Transaction Closure Inventory/WMS/valuation 38/38 with WS09 final run `30860236052` Stock Reconciliation 16/16; named reconciliation/FIFO/moving-average/valuation-adjustment slices reach RC, while full historical repost->Finance and persisted WMS task/mobile proof remain open; production exact-current unproven.",
  "E-MFG": "- `E-MFG`: RC3 combines Transaction Closure Manufacturing 56/56 with WS09 BOM 18/18 exact execution; named BOM lifecycle and guarded shop-floor transaction/correction slices reach RC; rework, subcontract, broad actual-cost/variance posting and full stock->Finance restatement remain below RC; production none.",
  "E-APPFACTORY": "- `E-APPFACTORY`: WS09 #553 is current source authority for first-class `AppAction.input_tables`, row/table BatchAction/BatchTransaction and durable replay; final run `30860236052` validates the declared shared slice. Generic materialized rollback/reverse migration, quorum/timer/escalation breadth and browser evidence remain below RC.",
  "E-IAM": "- `E-IAM`: RC3 exact-source audit wires MFA before session issuance, security-alert read model and suspend/reactivate governance; OIDC/SSO remain Foundation and privacy taxonomy/masking/retention are Missing. No provider lifecycle or exact-production security proof is inferred.",
  "E-SRE": "- `E-SRE`: CFMAX R2 source convergence #570 and exact source tooling are retained, but remote provider observation remains `unverified`; D1 replica/APAC, Workflow recovery, edge security, AI Gateway/Browser Run and restore/PITR/DR drills require approved non-production/provider evidence. Historical production release does not prove current main.",
  "E-UI": "- `E-UI`: exact RC3 source authority is **MetaForge V2** after the V3 rollback; responsive/installable PWA remains Wired. Barcode/QR/geolocation/signature are Wired source paths; Push and offline cache/write/sync/conflict remain Missing where evidence is absent. Current browser/device/exact-release proof remains required for RC.",
};
for (const [key, replacement] of Object.entries(evidence)) {
  const re = new RegExp("^- `" + key + "`:[^\\n]*$", "m");
  if (!re.test(status)) throw new Error(`Evidence bundle not found: ${key}`);
  status = status.replace(re, replacement);
}

status = replaceFamily(status, "F01", "F02", `### F01 (25)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`F01-003\` \`F01-007..F01-010\` \`F01-014\` \`F01-015\` \`F01-022\` \`F01-024\` \`F01-025\` | \`E-FIN\` |
| Wired | \`F01-001\` \`F01-002\` \`F01-004..F01-006\` \`F01-011..F01-013\` \`F01-016\` | \`E-FIN\` |
| Foundation | \`F01-017..F01-021\` \`F01-023\` | \`E-FIN\` |
`);
status = replaceFamily(status, "F02", "F03", `### F02 (18)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`F02-001..F02-003\` \`F02-005..F02-008\` \`F02-012\` \`F02-013\` \`F02-017\` \`F02-018\` | \`E-FIN\` |
| Wired | \`F02-004\` \`F02-009..F02-011\` | \`E-FIN\` |
| Foundation | \`F02-014..F02-016\` | \`E-FIN\` |
`);
status = replaceFamily(status, "F03", "F04", `### F03 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`F03-003\` \`F03-006..F03-010\` | \`E-FIN\` |
| Wired | \`F03-001\` \`F03-002\` \`F03-004\` \`F03-005\` | \`E-FIN\` |
| Foundation | \`F03-011..F03-013\` | \`E-FIN\` |
`);
status = replaceFamily(status, "F04", "F05", `### F04 (20)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`F04-001..F04-006\` \`F04-008..F04-013\` | \`E-FIN\` |
| Wired | \`F04-007\` | \`E-FIN\` |
| Foundation | \`F04-014..F04-020\` | \`E-FIN\` |
`);
status = replaceFamily(status, "P01", "P02", `### P01 (20)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`P01-011\` \`P01-013\` \`P01-014\` \`P01-017..P01-019\` | \`E-PROC\` |
| Wired | \`P01-002..P01-004\` \`P01-008\` \`P01-010\` \`P01-012\` | \`E-PROC\` |
| Foundation | \`P01-001\` \`P01-007\` \`P01-009\` \`P01-015\` \`P01-016\` \`P01-020\` | \`E-PROC\` |
| Missing | \`P01-005\` \`P01-006\` | \`E-PROC\` |
`);
status = replaceFamily(status, "W01", "W02", `### W01 (32)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`W01-011\` \`W01-013\` \`W01-014\` \`W01-022\` | \`E-STOCK\` |
| Wired | \`W01-001..W01-010\` \`W01-012\` \`W01-015..W01-020\` \`W01-025\` | \`E-STOCK\` |
| Foundation | \`W01-021\` \`W01-023\` \`W01-024\` \`W01-026..W01-031\` | \`E-STOCK\` |
| Missing | \`W01-032\` | \`E-STOCK\` |
`);
status = replaceFamily(status, "M01", "M02", `### M01 (12)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`M01-001..M01-005\` | \`E-MFG\` |
| Wired | \`M01-009..M01-012\` | \`E-MFG\` |
| Foundation | \`M01-006\` | \`E-MFG\` |
| Missing | \`M01-007\` \`M01-008\` | \`E-MFG\` |
`);
status = replaceFamily(status, "M03", "M04", `### M03 (14)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`M03-001\` \`M03-003..M03-008\` | \`E-MFG\` |
| Wired | \`M03-002\` \`M03-011\` \`M03-012\` | \`E-MFG\` |
| Foundation | \`M03-013\` \`M03-014\` | \`E-MFG\` |
| Missing | \`M03-009\` \`M03-010\` | \`E-MFG\` |
`);
status = replaceFamily(status, "B02", "A01", `### B02 (23)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | \`B02-001..B02-005\` \`B02-016\` | \`E-APPFACTORY\` |
| Foundation | \`B02-006..B02-013\` \`B02-017..B02-023\` | \`E-APPFACTORY\` |
| Missing | \`B02-014\` \`B02-015\` | \`E-APPFACTORY\` |
`);
status = replaceFamily(status, "G01", "G02", `### G01 (18)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | \`G01-001..G01-011\` \`G01-016\` \`G01-017\` | \`E-IAM\` |
| Foundation | \`G01-012\` \`G01-014\` \`G01-018\` | \`E-IAM\` |
| Missing | \`G01-013\` \`G01-015\` | \`E-IAM\` |
`);
status = replaceFamily(status, "G02", "T01", `### G02 (9)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | \`G02-001\` | \`E-IAM\` |
| Wired | \`G02-002\` \`G02-007\` \`G02-008\` | \`E-IAM\` |
| Foundation | \`G02-006\` \`G02-009\` | \`E-IAM\` |
| Missing | \`G02-003..G02-005\` | \`E-IAM\` |
`);
status = replaceFamily(status, "T01", "O01", `### T01 (20)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | \`T01-001..T01-005\` \`T01-012\` \`T01-013\` \`T01-018\` | \`E-IAM\` |
| Foundation | \`T01-006..T01-011\` \`T01-014..T01-017\` | \`E-IAM\` |
| Missing | \`T01-019\` \`T01-020\` | \`E-IAM\` |
`);
status = replaceFamily(status, "U01", "U02", `### U01 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | \`U01-001\` \`U01-002\` \`U01-009..U01-012\` | \`E-UI\` |
| Foundation | \`U01-008\` | \`E-UI\` |
| Missing | \`U01-003..U01-007\` \`U01-013\` | \`E-UI\` |
`);

const top30 = `## Top-30 blockers / next tasks

1. \`G01-011\`: MFA exact login/enroll/recovery/browser + operational evidence to RC.
2. \`G01-012..G01-015\`: complete OIDC/SAML/SSO/SCIM provider lifecycle.
3. \`G01-016..G01-017\`: exact-current session/revocation/recent-auth regression across surfaces.
4. \`T01-020\`: attributed/audited support access or impersonation lifecycle.
5. \`G02-003..G02-005\`: canonical PII classification, masking and retention taxonomy.
6. \`T01-019\`: tenant/data deletion, retention/legal-hold and recovery boundary.
7. \`T01-016..T01-017\`, \`O01-013..O01-016\`: restore/PITR/DR/rollback drill + RTO/RPO.
8. \`O01-006..O01-012\`: durable alert/error/DLQ/retry/integrity operations.
9. \`O01-020..O01-021\`: edge policy, API/PWA compatibility and false-positive provider proof.
10. \`IM02-006..IM02-009\`: resumable retry/correction/incremental migration/post-migration reconciliation.
11. \`T01-015\`, \`IM02-016\`: cutover/rollback/crash-window/reconciliation proof.
12. Migration execution slice: applied-state-aware resolution of duplicate \`0110_*\` prefixes; no unsafe rename.
13. \`F01-011..F01-013\`: automated close aggregate, retained earnings and close/reopen semantics.
14. \`V02-011..V02-014\`: PIT resident/progressive/deduction/annual settlement with official effective-dated fixtures.
15. \`V03-001..V03-010\`: clause-verified PIT/BHXH/BHYT/BHTN numeric fixtures + exact statutory regression.
16. \`V04-006..V04-010\`: e-invoice provider/signing/submission/retry/status synchronization.
17. \`P01-016\`, \`W01-021\`: landed-cost authoritative stock-value application/reversal + Stock/GL reconciliation.
18. \`W01-023..W01-024\`: historical stock repost/replay through downstream COGS/Finance correction.
19. \`W02-004\`, \`W02-013\`: persisted putaway/warehouse-task state machine.
20. \`W02-009\`, \`W02-014\`: dedicated cycle-count/freeze workflow closure.
21. \`M03-009..M03-010\`: rework operating model + subcontract material/procurement/valuation contract.
22. \`M04-004..M04-010\`: actual labor/machine/overhead cost + variance posting/reconciliation.
23. \`B02-006\`, \`T01-014\`: materialized schema/data reverse migration + transactional rollback.
24. \`B01-005\`, \`B01-009..B01-011\`: persisted parallel/quorum approval, escalation, SLA/timer/scheduled actions.
25. \`I01-011..I01-015\`: physical attempt persistence, quarantine/replay and DLQ metrics while preserving idempotency.
26. \`U01-001..U01-002\`: current V2 cross-device/a11y + installed standalone PWA evidence.
27. \`U01-003..U01-007\`: tenant/session-aware offline cache/write queue/background replay/OCC conflict UX.
28. \`R01-014\`: offline POS consuming canonical offline/OCC/idempotency authority.
29. \`A02-021..A02-024\`: AI proposal/tool/preview/human approval with permission/audit authority.
30. \`O01-002\`, \`VP01-007..VP01-008\`: exact current release SHA/bundle/authenticated live evidence before Hardened.
`;
status = status.replace(/## Top-30 blockers \/ next tasks[\s\S]*?(?=\n## Interpretation)/, top30.trimEnd());
writeIfChanged(STATUS, status);

let current = read(CURRENT);
const currentBlock = `## DONE — RC3 exact-main release-confidence convergence\n\n- Program seed: \`main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7\`; A0-A5 evidence converged through \`program/rc3-exact-main-release-confidence-20260804\`.\n- Canonical capability denominator remains **956/956**. RC3 candidate maturity: **Hardened 0 / RC 65 / Wired 407 / Foundation 327 / Missing 157**.\n- Delta vs RC-01: **RC +61 / Wired -41 / Foundation -18 / Missing -2 / Hardened unchanged 0**.\n- Promotions are scoped to exact evidence; no global TypeScript PASS, provider/live PASS or current-production PASS is inferred.\n- Current shared shell authority is **MetaForge V2**; V3 history is not current presentation authority.\n- Duplicate \`0110_*\` migration prefixes are tracked as an applied-state/governance blocker; no potentially applied migration was renamed.\n- No production deploy, provider mutation, DNS/secret change, restore/PITR or customer-data mutation occurred in RC3.\n- Canonical evidence: \`docs/agents/rc/RC3_CONVERGENCE_20260804.md\` and A1-A5 evidence files.\n\n`;
if (!current.includes("## DONE — RC3 exact-main release-confidence convergence")) {
  current = current.replace("## DONE — CFMAX R2 Cloudflare-native source convergence", currentBlock + "## DONE — CFMAX R2 Cloudflare-native source convergence");
}
current = current.replace("## ACTIVE — VN Accounting Period Integrity Hardening r8", "## SUPERSEDED — VN Accounting Period Integrity Hardening r8");
if (!current.includes("The r8 branch is historical/superseded")) {
  current = current.replace("## SUPERSEDED — VN Accounting Period Integrity Hardening r8\n", "## SUPERSEDED — VN Accounting Period Integrity Hardening r8\n\nThe r8 branch is historical/superseded by canonical RC-020/Transaction Closure authority on current main; retain the bullets below only as provenance, not active work.\n");
}
writeIfChanged(CURRENT, current);

let next = read(NEXT);
const rc3Next = `## DONE — RC3 release-confidence rebaseline\n\n- Capability truth reconciled from A0-A5 against exact WS09 main seed.\n- New maturity candidate: **Hardened 0 / RC 65 / Wired 407 / Foundation 327 / Missing 157** across exactly 956 IDs.\n- WS09 Batch Productization source convergence is DONE; remaining App Factory work is residual RC evidence/rollback/workflow depth, not another generic batch rewrite.\n- Next work should follow the RC3 top-30 queue: WS11 IAM/privacy, WS12 provider/SRE recovery, WS13 migration/cutover, WS01/WS06 statutory + reconciliation depth, then WS14 browser/mobile/offline evidence.\n\n`;
if (!next.includes("## DONE — RC3 release-confidence rebaseline")) {
  next = next.replace("## DONE — CFMAX R2 source convergence", rc3Next + "## DONE — CFMAX R2 source convergence");
}
next = next.replace("## NEXT PROGRAM — Platform Productization", "## NEXT PROGRAM — RC3 residual release-confidence closure");
next = next.replace(/Ưu tiên sau Transaction Closure\/CFMAX source convergence không phải mở thêm horizontal ERP feature wave\. Mục tiêu tiếp theo là biến core đã chứng minh thành platform có thể tạo\/cài\/nâng cấp\/vận hành app cho nhiều tenant một cách an toàn\.[\s\S]*?(?=\n## Forge 0\.2\.0 parallel execution)/,
`Ưu tiên sau RC3 là đóng các blocker còn ngăn capability từ Wired/Foundation lên RC, không mở lại các source wave đã hội tụ.\n\nThứ tự ưu tiên:\n\n1. **WS11 — IAM / privacy / SaaS operational evidence**: MFA browser/recovery, OIDC/SAML/SSO/SCIM lifecycle, support access, PII taxonomy/masking/retention.\n2. **WS12 — SRE / provider / recovery evidence**: restore/PITR/DR/RTO-RPO, DLQ/alerts, edge policy, D1/Workflow/provider proofs.\n3. **WS13 — Migration / onboarding / cutover**: retry/correction/incremental/reconciliation, cutover rollback and applied-state-aware migration numbering governance.\n4. **WS01/WS06 — Finance/Vietnam statutory residuals**: year-end close, official effective-dated PIT/BHXH/BHYT/BHTN fixtures, e-invoice provider closure, landed-cost and Stock/GL repost reconciliation.\n5. **WS14 — Current V2 browser/mobile/offline evidence**: desktop/tablet/Android/360px/a11y/PWA, then tenant/session/OCC-safe offline queue/conflict behavior.\n6. **WS09 residual**: generic materialized rollback/reverse migration and approval quorum/timer/escalation only; do not rebuild BatchAction/BatchTransaction.\n`);
next = next.replace("Đây là workstream ưu tiên số 1 của program kế tiếp:", "WS09 Batch Productization source convergence đã DONE qua #553; chỉ mở residual RC gaps có capability/evidence cụ thể:");
writeIfChanged(NEXT, next);

let convergence = read(CONVERGENCE);
const finalMarker = "<!-- RC3_FINAL_CONVERGENCE_START -->";
if (!convergence.includes(finalMarker)) {
  convergence += `\n\n${finalMarker}\n## Final A0 convergence candidate\n\nExact seed: \`main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7\`.\n\nAccepted worker evidence: A1 #590, A2 #589, A3 #586, A4 #588, A5 #591. A5 independently accepted A1's 61 scoped RC promotions, all A2 7 promotions + 3 demotions, A3's 0/0 provider-conservative result and A4's 4 Wired promotions + Push demotion.\n\nFinal maturity candidate before validator:\n\n| Maturity | RC-01 | RC3 | Delta |\n|---|---:|---:|---:|\n| Hardened | 0 | 0 | 0 |\n| RC | 4 | 65 | +61 |\n| Wired | 448 | 407 | -41 |\n| Foundation | 345 | 327 | -18 |\n| Missing | 159 | 157 | -2 |\n| Total | 956 | 956 | 0 |\n\nThe duplicate \`0110_*\` numeric-prefix anomaly remains a tracked governance blocker; because the migration runner journals complete filenames, RC3 does not rename potentially applied migrations without environment applied-state evidence.\n\nRequired final structural gate: \`node server/scripts/validate-enterprise-capability-status.mjs\` must report 956 map IDs, 956 status IDs, zero missing/unknown/duplicate IDs and matching maturity arithmetic.\n\nNo production/provider mutation is part of this convergence.\n<!-- RC3_FINAL_CONVERGENCE_END -->\n`;
}
writeIfChanged(CONVERGENCE, convergence);

console.log("RC3 convergence generator complete");
console.log("Expected maturity: Hardened=0 RC=65 Wired=407 Foundation=327 Missing=157 Total=956");
