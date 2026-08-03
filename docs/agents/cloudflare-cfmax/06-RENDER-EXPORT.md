# CF06 — Browser Run / PDF / Export Delivery

Status: READY
Branch: `cloudflare/cfmax-06-render-export`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authorities: WS14 presentation/runtime, WS12 operational execution
Risk: STANDARD; security-sensitive where arbitrary content/URLs/files are involved

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

## R2 artifact policy

If PDFs/exports are persisted:

- object key must be tenant scoped;
- metadata record belongs to Forge;
- downloads pass permission check;
- retention/expiry explicit;
- artifact integrity/checksum where useful;
- deletion follows source/tenant/legal policy;
- no assumption that R2 object listing itself enforces business ACL.

## Implementation slices

### A — exact renderer inventory

### B — Browser Run proof on one canonical existing Print Format

Choose a stable fixture with current regression evidence.

### C — deterministic compare

Compare visual/text/layout requirements and business values with current output. Pixel-identical is not required if existing renderer is non-deterministic, but business content and approved layout contract must match.

### D — async retained export

Only if representative use case benefits; otherwise document Queue/Workflow seam and defer.

### E — failure/security/performance evidence

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

## Dependencies

- CF04 for perimeter/SSRF security;
- CF08 for resource/config/retention/release governance;
- CF02 if batch export becomes Workflow;
- WS14 for shared rendering/presentation contract.

## Completion record

Owner: —
Started from: —
Head: —
Status: READY
Capabilities: —
Representative print format: —
Changed zones: —
Tests/screenshots/PDF checks: —
R2 policy: —
Dependency requests: —
Gaps: —

## Startup prompt

Đọc handoff, Skill, CFMAX docs và exact print/file code. Audit renderer hiện tại trước. Giữ Print Format metadata và server permission là authority. Dùng Browser Run như execution engine, không tạo arbitrary-URL SSRF surface; R2 chỉ là artifact storage sau permission facade. Verify business content/layout/security/failure/cost. Blocker ghi Dependency Request rồi tiếp tục. Không deploy production binding/resource.
