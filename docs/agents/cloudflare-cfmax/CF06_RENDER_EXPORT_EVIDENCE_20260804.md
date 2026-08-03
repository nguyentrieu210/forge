# CFMAX-06 — Render / Export Evidence

Date: 2026-08-04  
Lane: `cloudflare/cfmax-06-render-export`  
Capability: `A01-016` PDF export  
Maturity claimed by this lane: **Wired**  
Maturity explicitly **not** claimed: RC / Hardened

## 1. Scope closed by this slice

This lane closes one representative end-to-end PDF path without creating a second document, Print Format, permission or persistence authority:

`PrintContainer -> adapter.downloadPdf -> /api/method/frappe.utils.print_format.download_pdf -> canonical print-view route -> Browser Run Quick Action -> streamed PDF response`

The server first delegates to the existing `frappe.www.printview.get_html_and_style` implementation. That existing path remains authoritative for:

- authentication/session handling;
- `DocPerm` print authorization;
- row/share policy;
- field redaction;
- document loading;
- stored Print Format selection and rendering.

Only HTML returned by that already-authorized path is handed to Browser Run. Browser Run is an execution engine, not a new template or document source of truth.

## 2. Renderer inventory / audit matrix

| Surface | Current authority | CF6 execution path | Permission boundary | Persistence / retention | CF6 decision |
|---|---|---|---|---|---|
| Single-document preview | Existing Print Format + canonical print-view route | Existing server HTML -> sandboxed `PrintView` | Canonical print permission path | Browser-only preview; no new artifact | Preserve |
| Single-document PDF | Existing Print Format + canonical print-view route | Browser Run `quickAction("pdf")` over authorized HTML | Canonical print-view executes first; denial exits before Browser Run | Direct streamed response, `private, no-store`; no R2 write | **Wired** |
| Legacy client PDF rasterizer | Same server print HTML, then `html2canvas/jsPDF` in browser | No longer used by `PrintContainer` | Client previously rendered privileged HTML locally | Browser-generated blob | Superseded by trusted server path; helper may remain only as dead/compat code until separate cleanup |
| Report PDF/export | Report subsystem | Not changed by this representative slice | Must reuse report permission/filter authority | No CF6 retention rule added | **Deferred**; cannot inherit `A01-016` RC from document-PDF proof alone |
| Excel/CSV export (`A01-015`) | Report/list subsystem | Not changed | Existing report/list permissions | Existing behavior | Out of CF6 representative PDF slice |
| Files/attachments | D1 file metadata + tenant-scoped `FILES` R2 binding | Existing file facade | Existing file/document permission checks | Existing R2 object lifecycle | Reused only if a future export is deliberately persisted; no duplicate file store |
| Async export | Job/queue subsystem | Not introduced for the representative PDF path | Must resolve actor/tenant permissions before enqueue and again at materialization if later added | Requires explicit artifact TTL/cleanup | Deferred until a measured workload needs it |

## 3. Cloudflare binding and provisioning

Both the checked-in tenant Worker template and generated tenant configuration bind:

- entrypoint: `src/index-cf6.ts`;
- Browser Run binding: `BROWSER`.

`server/apps/tenant-worker/worker-configuration.d.ts` is regenerated from Wrangler and contains `BROWSER: BrowserRun` plus `mainModule: typeof import("./src/index-cf6")`.

Provisioned tenants therefore receive the same render binding as the checked-in demo template; this avoids a local-only success path.

## 4. Security boundary

### Authorization before rendering

The PDF route does not duplicate authorization logic. It makes an in-process call to the canonical print-view route with the original request headers. A non-2xx authorization/render result is returned immediately. Browser Run is never called on that denied path.

### SSRF / remote-fetch control

The route does not accept an arbitrary URL for Browser Run. It passes raw authorized HTML only. The generated document adds a restrictive CSP:

- `default-src 'none'`;
- `img-src data:`;
- `font-src data:`;
- `style-src 'unsafe-inline'`.

This intentionally prevents a Print Format or document value from turning the privileged renderer into a general outbound-fetch primitive. The lane also caps rendered HTML at 4,000,000 bytes before Browser Run.

### Data leakage and caching

The PDF response is returned with:

- `Content-Type: application/pdf`;
- safe attachment filename;
- `Cache-Control: private, no-store`;
- `X-Content-Type-Options: nosniff`.

Browser Run response headers are preserved, so provider-side usage evidence such as Browser Run timing headers is not intentionally discarded.

### Artifact retention

The representative PDF is **not persisted**. Therefore:

- no duplicate D1 row is created;
- no R2 export object is created;
- no new retention/cleanup authority is necessary for this path;
- the source document and Print Format remain the only durable authorities.

If a future async/scheduled export is persisted, it must use the existing file metadata + tenant-scoped R2 lifecycle and define TTL/cleanup before promotion.

## 5. Client behavior

`PrintContainer` now calls the adapter's already-existing `downloadPdf(doctype, name, format)` contract. The adapter already targets Frappe-compatible `frappe.utils.print_format.download_pdf`.

The UI no longer feeds privileged print HTML to the local `html2canvas/jsPDF` helper for the normal download action. Preview remains sandboxed and separate from binary PDF generation.

## 6. Regression / build evidence

CF6 validation workflow covers:

1. locked dependency install;
2. CF6 regression tests;
3. `@metaforge/charts`, `@metaforge/visual`, then `@metaforge/views` TypeScript builds;
4. Wrangler tenant Worker `deploy --dry-run`;
5. presence of the `BROWSER` Browser Run binding in Wrangler output;
6. exact regeneration + drift check of `worker-configuration.d.ts`;
7. full server build as a non-blocking baseline debt detector.

Focused regressions pin:

- canonical print-view reference appears before Browser Run invocation;
- no Browser Run arbitrary-URL input path;
- restrictive CSP and size cap remain present;
- representative PDF path does not write `env.FILES`;
- template and generated tenant configs both bind Browser Run;
- generated Wrangler types contain `BrowserRun` and `index-cf6`;
- `PrintContainer` calls `adapter.downloadPdf()` and no longer calls `downloadPrintPdf(printQ.data, ...)`.

The full server baseline currently reports unrelated `exactOptionalPropertyTypes` / nullability debt in manufacturing, App Registry, QMS, CRM/selling and model validation code. CF6 does not modify those areas, so this lane records that debt but does not mislabel it as a render/export regression.

## 7. Capability mapping

### `A01-016` — PDF export

Status after CF6: **Wired** for the representative single-document PDF vertical slice.

Evidence:

- server Frappe-compatible PDF endpoint;
- canonical permission + Print Format reuse;
- trusted Cloudflare Browser Run binding;
- client adapter/UI wiring;
- Wrangler dry-run and binding type generation;
- focused regression tests.

Not enough evidence exists to promote the whole capability to RC because report-PDF breadth, remote Browser Run output fixtures, failure-injection and measured performance/cost evidence are still absent.

## 8. Deliberately deferred before RC

The following are not silently treated as complete:

1. real remote Browser Run execution producing a PDF artifact on a Cloudflare-bound environment;
2. golden PDF/content fixtures across multiple representative doctypes and layouts;
3. explicit denied-user runtime fixture proving Browser Run invocation count stays zero;
4. report PDF/export integration beyond single-document Print Format;
5. measured render latency, Browser Run usage/cost and concurrency behavior;
6. async export/job path, only if measurements justify it;
7. persisted export lifecycle/TTL/cleanup, only if persistence is introduced;
8. provider failure/timeout/retry and large-document fixtures;
9. stale legacy `downloadPdf.ts` cleanup after downstream import search proves it is unused everywhere.

## 9. Promotion rule

CF6 must remain **Wired** until the deferred runtime/provider evidence above is collected. Code presence, Wrangler dry-run success, or a merged PR alone are not sufficient evidence for RC/Hardened.
