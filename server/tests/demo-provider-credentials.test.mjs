import assert from "node:assert/strict";
import test from "node:test";
import { resolveCloudflareAccountId, resolveDemoPlatformSecrets } from "../scripts/lib/demo-provider-credentials.mjs";

function response(result, status = 200) {
  return new Response(JSON.stringify({ success: status >= 200 && status < 300, result, errors: [] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("discovers the one token-visible account containing cloudforge-gateway", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/client/v4/accounts") return response([{ id: "acct-a" }, { id: "acct-b" }]);
    if (path.includes("/accounts/acct-a/workers/scripts/cloudforge-gateway/settings")) return response(null, 404);
    if (path.includes("/accounts/acct-b/workers/scripts/cloudforge-gateway/settings")) return response({ bindings: [] });
    throw new Error(`unexpected ${url}`);
  };
  const result = await resolveCloudflareAccountId({ token: "token", fetchImpl });
  assert.deepEqual(result, { accountId: "acct-b", selection: "token-visible account containing cloudforge-gateway" });
});

test("uses an explicit account hint without provider enumeration", async () => {
  let calls = 0;
  const result = await resolveCloudflareAccountId({
    token: "token",
    accountHint: "acct-explicit",
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
  });
  assert.equal(result.accountId, "acct-explicit");
  assert.equal(calls, 0);
});

test("reuses environment-held shared platform secrets without reading provider values", async () => {
  let calls = 0;
  const result = await resolveDemoPlatformSecrets({
    token: "token",
    accountId: "acct",
    env: {
      FORGE_INTERNAL_AUTH_SECRET: "auth",
      FORGE_INTERNAL_SERVICE_TOKEN: "service",
      FORGE_CONTROL_TOKEN: "control",
    },
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
  });
  assert.deepEqual(result.values, {
    FORGE_INTERNAL_AUTH_SECRET: "auth",
    FORGE_INTERNAL_SERVICE_TOKEN: "service",
    FORGE_CONTROL_TOKEN: "control",
  });
  assert.equal(calls, 0);
});

test("can use provider-returned secret text transiently without changing names", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/INTERNAL_AUTH_SECRET")) return response({ name: "INTERNAL_AUTH_SECRET", type: "secret_text", text: "auth" });
    if (path.endsWith("/INTERNAL_SERVICE_TOKEN")) return response({ name: "INTERNAL_SERVICE_TOKEN", type: "secret_text", text: "service" });
    if (path.endsWith("/CONTROL_TOKEN")) return response({ name: "CONTROL_TOKEN", type: "secret_text", text: "control" });
    throw new Error(`unexpected ${url}`);
  };
  const result = await resolveDemoPlatformSecrets({ token: "token", accountId: "acct", env: {}, fetchImpl });
  assert.equal(result.values.FORGE_INTERNAL_AUTH_SECRET, "auth");
  assert.equal(result.values.FORGE_INTERNAL_SERVICE_TOKEN, "service");
  assert.equal(result.values.FORGE_CONTROL_TOKEN, "control");
  assert.equal(result.source.FORGE_CONTROL_TOKEN, "cloudflare-existing-binding");
});

test("fails closed when Cloudflare returns only secret metadata", async () => {
  const fetchImpl = async (url) => {
    const name = new URL(url).pathname.split("/").pop();
    return response({ name, type: "secret_text" });
  };
  await assert.rejects(
    resolveDemoPlatformSecrets({ token: "token", accountId: "acct", env: {}, fetchImpl }),
    /metadata only.*do not generate mismatched replacements/,
  );
});
