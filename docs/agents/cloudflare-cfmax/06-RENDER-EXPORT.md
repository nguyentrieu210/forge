# CF06 — Browser Run / PDF / Export Delivery

Status: WIRED — REMOTE PROOF PENDING
Branch: `cloudflare/cfmax-06-render-export`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authorities: WS14 presentation/runtime, WS12 operational execution
Risk: STANDARD; security-sensitive where arbitrary content/URLs/files are involved
Execution evidence: `CF06_RENDER_EXPORT_EVIDENCE_20260804.md`

## Mission

Move Forge print/export execution toward reliable server-side Cloudflare rendering while preserving existing Print Format metadata, authorization and domain presentation authority.

## Required reading

Common CFMAX docs plus:

- print routes/services;
- Print Format metadata/model;
- client print route/render code;
- current jsPDF/html2canvas usage;
- Alumdoor print brand regression;
- file upload/download facade and R2 binding;
- report/export/batch-print backlog;
- permission checks around document/report/file access.

Provider reference: `https://developers.cloudflare.com/browser-run/quick-actions/pdf-endpoint/`.

## Target flow

```text
request
 -> authenticate/authorize source document/report
 -> resolve Print Format metadata
 -> deterministic server HTML/render payload
 -> Browser Run PDF
 -> optional R2 persistence for retained/batch artifact
 -> File/export metadata in Forge
 -> permission-aware download
```

Print Format remains the template/presentation source of truth.

## Owned scope

- exact print/export execution inventory;
- Browser Run integration seam;
- deterministic HTML/PDF render contract;
- R2 artifact retention/delivery contract;
- async Queue/Workflow fit for batch/long exports;
- security/SSRF/input-size/font/timeout analysis;
- PDF regression and performance/cost evidence.

## Forbidden zone

Do not:

- redesign domain print templates unless required to prove renderer compatibility;
- expose arbitrary internal URLs to Browser Run;
- create public R2 bypass around Forge file permissions;
- move canonical document data into generated PDF metadata;
- rely on client browser for authoritative export if server artifact is claimed;
- commit font binaries or secrets;
- deploy Browser Run/R2 production changes without approval.

## Audit matrix

```text
surface | current renderer | client/server | input source | permission | output | retained? | batch? | failure behavior | Browser Run fit
```

Cover:

- single document print;
- report export;
- invoice/order print formats;
- batch print/labels backlog;
- file/attachment download;
- scheduled/subscribed report if present.

The executed matrix and deliberate deferrals are recorded in `CF06_RENDER_EXPORT_EVIDENCE_20260804.md`.

## Rendering contract

Define:

- canonical template identifier/version;
- locale/timezone/currency context;
- allowed assets/origins;
- embedded image handling;
- CSS/page size/margins;
- timeout/resource limits;
- output MIME/name;
- deterministic metadata/hash where practical;
- font strategy using supported/system/web assets without committing prohibited binaries;
- failure/retry class;
- audit linkage to source document/report and exact template revision.

## SSRF/exfiltration controls

Prefer controlled HTML payload generated from authorized Forge data.

If URL rendering is used:

- allowlist Forge-controlled hosts;
- prevent loopback/private/internal target access as applicable;
- never accept arbitrary untrusted URL from user and pass directly;
- strip/avoid sensitive cookies/tokens unless explicit same-origin design requires a scoped mechanism;
- coordinate with CF04.

CF06's representative implementation does **not** expose URL rendering. It submits only authorized server-rendered HTML and applies a self-contained CSP before Browser Run.

## R2 artifact policy

If PDFs/exports are persisted:

- object key must be tenant scoped;
- metadata record belongs to Forge;
- downloads pass permission check;
- retention/expiry explicit;
- artifact integrity/checksum where useful;
- deletion follows source/tenant/legal policy;
- no assumption that R2 object listing itself enforces business ACL.

The representative PDF is streamed and not retained, so CF06 intentionally introduces no second artifact lifecycle.

## Implementation slices

### A — exact renderer inventory

Recorded in `CF06_RENDER_EXPORT_EVIDENCE_20260804.md`.

### B — Browser Run proof on one canonical existing Print Format

Wired through the canonical Print Format/permission route and Cloudflare Browser Run binding. Remote provider execution artifact remains a pre-RC gate.

### C — deterministic compare

Static/business-authority regressions are present. Golden remote PDF content/layout fixtures remain a pre-RC gate.

### D — async retained export

Deferred because the representative direct PDF path does not justify Queue/R2 persistence yet. The existing job/file seams remain the required authority if measurements later justify async retention.

### E — failure/security/performance evidence

SSRF/arbitrary-URL and configuration regressions are pinned. Remote Browser Run timeout/error, measured latency/cost and provider-failure fixtures remain pending.

## Acceptance gates

Before RC:

- capability mapping;
- renderer inventory;
- server authorization before render;
- authorized download after render;
- fixture regression for Vietnamese text/business values/layout;
- Browser Run timeout/error test;
- SSRF/arbitrary-url negative test;
- R2 tenant isolation if persisted;
- output MIME/name/checksum evidence;
- performance and provider cost/limit estimate;
- no production deployment claim without exact evidence.

Current maturity remains **Wired** because the remote/golden/performance gates are not yet satisfied.

## Dependencies

- CF04 for perimeter/SSRF security;
- CF08 for resource/config/retention/release governance;
- CF02 if batch export becomes Workflow;
- WS14 for shared rendering/presentation contract.

## Completion record

Owner: CF06 render/export lane  
Started from: current `main` synchronized into `cloudflare/cfmax-06-render-export` before implementation and again during execution  
Head: exact final validation SHA is recorded by the CFMAX-06 workflow/PR evidence; docs may be newer without changing runtime code  
Status: **Wired — not RC/Hardened**  
Capabilities: `A01-016` PDF export — representative single-document vertical only  
Representative print format: existing stored Print Format resolved by canonical `frappe.www.printview.get_html_and_style`; no parallel template created  
Changed zones: tenant Worker entrypoint/env/Wrangler config + generated tenant config/types; print UI; focused CF06 tests; validation workflow; evidence docs  
Tests/screenshots/PDF checks: focused regressions + UI dependency build + Wrangler dry-run/typegen; remote PDF artifact/golden layout proof still pending  
R2 policy: direct PDF is streamed with `private, no-store`; no CF06 R2 persistence; any later retained export must reuse existing tenant-scoped file/R2 lifecycle  
Dependency requests: none required for the Wired slice; CF04/CF08 remain promotion dependencies  
Gaps: remote Browser Run artifact, denied-user invocation-count fixture, Vietnamese/golden PDF fixtures, report-PDF breadth, timeout/provider failure, measured performance/cost, async/retention only if justified  

## Startup prompt

Đọc handoff, Skill, CFMAX docs và exact print/file code. Audit renderer hiện tại trước. Giữ Print Format metadata và server permission là authority. Dùng Browser Run như execution engine, không tạo arbitrary-URL SSRF surface; R2 chỉ là artifact storage sau permission facade. Verify business content/layout/security/failure/cost. Blocker ghi Dependency Request rồi tiếp tục. Không deploy production binding/resource.
