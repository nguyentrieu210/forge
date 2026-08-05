import assert from "node:assert/strict";
import test from "node:test";
import {
  demoDatabaseName,
  demoHostname,
  ensureDemoDatabase,
  normalizeDemoSlug,
  resolveWorkersDevOrigin,
} from "../scripts/lib/demo-provisioning.mjs";

function jsonResponse(result, status = 200) {
  return new Response(JSON.stringify({ success: status >= 200 && status < 300, result, errors: [] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("normalizes Vietnamese customer names to deterministic tenant slugs", () => {
  assert.equal(normalizeDemoSlug("Nguyễn Thị Thúy"), "nguyen-thi-thuy");
  assert.equal(normalizeDemoSlug("Đặng Shop  68"), "dang-shop-68");
  assert.equal(demoHostname("Thúy", "kairo.vn"), "thuy.kairo.vn");
  assert.equal(demoDatabaseName("Thúy"), "cloudforge-thuy");
});

test("rejects unsafe or empty slugs", () => {
  assert.throws(() => normalizeDemoSlug("123"), /start with a letter/);
  assert.throws(() => normalizeDemoSlug("---"), /start with a letter/);
});

test("reuses an exact existing D1 database without creating another", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    return jsonResponse([{ name: "cloudforge-thuy", uuid: "db-existing" }]);
  };
  const result = await ensureDemoDatabase({
    accountId: "acct",
    token: "token",
    databaseName: "cloudforge-thuy",
    fetchImpl,
  });
  assert.deepEqual(result, { id: "db-existing", name: "cloudforge-thuy", created: false });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /name=cloudforge-thuy/);
});

test("creates D1 only when no exact database exists", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body });
    if ((init.method ?? "GET") === "GET") return jsonResponse([]);
    return jsonResponse({ name: "cloudforge-thuy", uuid: "db-new" });
  };
  const result = await ensureDemoDatabase({
    accountId: "acct",
    token: "token",
    databaseName: "cloudforge-thuy",
    fetchImpl,
  });
  assert.deepEqual(result, { id: "db-new", name: "cloudforge-thuy", created: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(JSON.parse(calls[1].body), { name: "cloudforge-thuy" });
});

test("derives the control-plane workers.dev origin only when the script is enabled", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/workers/subdomain")) return jsonResponse({ subdomain: "account-sub" });
    if (path.endsWith("/workers/scripts/cloudforge-control-plane/subdomain")) return jsonResponse({ enabled: true, previews_enabled: false });
    throw new Error(`unexpected ${path}`);
  };
  assert.equal(await resolveWorkersDevOrigin({
    accountId: "acct",
    token: "token",
    scriptName: "cloudforge-control-plane",
    fetchImpl,
  }), "https://cloudforge-control-plane.account-sub.workers.dev");
});
