import assert from "node:assert/strict";
import test from "node:test";
import { websiteReadResponse } from "../dist/packages/frappe-api/src/website-response.js";

const request = (tag, path = "page?slug=home") => new Request(`https://tenant.test/api/method/forge.website.${path}`, {
  headers: tag === undefined ? {} : { "if-none-match": tag },
});
const response = (value) => new Response(JSON.stringify({ message: value }), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

test("published Website revalidates only after resolving the current representation", async () => {
  let reads = 0;
  const resolve = async () => { reads++; return response({ page: { title: "Home" } }); };
  const initial = await websiteReadResponse(request(), "alpha", resolve);
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get("cache-control"), "private, no-cache, must-revalidate");
  const etag = initial.headers.get("etag");
  assert.match(etag, /^"[a-f0-9]{64}"$/);
  for (const condition of [etag, `W/${etag}`, `"old", W/${etag}`, "*"]) {
    const cached = await websiteReadResponse(request(condition), "alpha", resolve);
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), "");
    assert.equal(cached.headers.get("etag"), etag);
    assert.equal(cached.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(reads, 5, "no conditional request may skip publication resolution");
});

test("page, navigation, theme and preset changes invalidate a Website validator", async () => {
  const baseline = { page: { title: "Home" }, navigation: [{ slug: "home" }], theme: { primary: "#112233" }, site: { template_version: 1 } };
  const initial = await websiteReadResponse(request(), "alpha", async () => response(baseline));
  const etag = initial.headers.get("etag");
  for (const changed of [
    { ...baseline, page: { title: "Edited" } },
    { ...baseline, navigation: [] },
    { ...baseline, theme: { primary: "#ffffff" } },
    { ...baseline, site: { template_version: 2 } },
  ]) {
    const result = await websiteReadResponse(request(etag), "alpha", async () => response(changed));
    assert.equal(result.status, 200);
    assert.notEqual(result.headers.get("etag"), etag);
    assert.deepEqual(await result.json(), { message: changed });
  }
});

test("tenant and method boundaries cannot share a Website validator", async () => {
  const resolve = async () => response({ same: "public content" });
  const initial = await websiteReadResponse(request(), "alpha", resolve);
  const etag = initial.headers.get("etag");
  for (const [tenant, path] of [["beta", "page?slug=home"], ["alpha", "manifest"]]) {
    const result = await websiteReadResponse(request(etag, path), tenant, resolve);
    assert.equal(result.status, 200);
    assert.notEqual(result.headers.get("etag"), etag);
  }
});

test("unpublish and resolver failures cannot revive a cached public page", async () => {
  const initial = await websiteReadResponse(request(), "alpha", async () => response({ page: "published" }));
  const etag = initial.headers.get("etag");
  await assert.rejects(() => websiteReadResponse(request(etag), "alpha", async () => { throw new Error("unpublished"); }), /unpublished/);
  const missing = await websiteReadResponse(request("*"), "alpha", async () => new Response("missing", { status: 404, headers: { "cache-control": "no-store" } }));
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("etag"), null);
  assert.equal(missing.headers.get("cache-control"), "no-store");
});
