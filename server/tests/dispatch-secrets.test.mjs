import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { main } from "../scripts/manage-dispatch-secrets.mjs";

async function captureStdout(work) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try { await work(); } finally { process.stdout.write = original; }
  return chunks.join("");
}

test("dispatch secret put uses the WfP secret endpoint and never prints the value", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ success: true, result: { name: "INTERNAL_AUTH_SECRET", text: "must-not-leak", type: "secret_text" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const output = await captureStdout(() => main([
    "put", "--account", "acc", "--namespace", "cloudforge-production", "--script", "cloudforge-tenant-demo",
    "--name", "INTERNAL_AUTH_SECRET", "--stdin",
  ], { CLOUDFLARE_API_TOKEN: "api-token" }, fetchImpl, Readable.from(["super-secret\n"])));
  assert.match(request.url, /workers\/dispatch\/namespaces\/cloudforge-production\/scripts\/cloudforge-tenant-demo\/secrets$/);
  assert.equal(request.init.method, "PUT");
  assert.equal(request.init.headers.get("authorization"), "Bearer api-token");
  assert.deepEqual(request.body, { name: "INTERNAL_AUTH_SECRET", text: "super-secret", type: "secret_text" });
  assert.doesNotMatch(output, /super-secret|must-not-leak/);
  assert.match(output, /INTERNAL_AUTH_SECRET/);
});

test("dispatch secret list returns names only", async () => {
  const output = await captureStdout(() => main([
    "list", "--account", "acc", "--namespace", "ns", "--script", "worker",
  ], { CLOUDFLARE_API_TOKEN: "token" }, async () => new Response(JSON.stringify({
    success: true, result: [{ name: "B", text: "hidden", type: "secret_text" }, { name: "A", text: "hidden2", type: "secret_text" }],
  }), { status: 200, headers: { "content-type": "application/json" } })));
  assert.deepEqual(JSON.parse(output).secrets, ["A", "B"]);
  assert.doesNotMatch(output, /hidden/);
});

test("a `wrangler login` session is accepted when no API token is set", async () => {
  // The default auth path stores an OAuth token and never sets CLOUDFLARE_API_TOKEN.
  // Requiring the env var alone locked out exactly the people most likely to run this.
  let authorization;
  const fetchImpl = async (url, init) => {
    authorization = init.headers.get("authorization");
    return new Response(JSON.stringify({ success: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await captureStdout(() => main(
    ["list", "--account", "acc", "--namespace", "ns", "--script", "w"],
    {}, fetchImpl, Readable.from([""]), () => "oauth-from-wrangler",
  ));
  assert.equal(authorization, "Bearer oauth-from-wrangler");
});

test("an explicit API token still wins over a stored session", async () => {
  let authorization;
  const fetchImpl = async (url, init) => {
    authorization = init.headers.get("authorization");
    return new Response(JSON.stringify({ success: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await captureStdout(() => main(
    ["list", "--account", "acc", "--namespace", "ns", "--script", "w"],
    { CLOUDFLARE_API_TOKEN: "explicit" }, fetchImpl, Readable.from([""]), () => "oauth-from-wrangler",
  ));
  assert.equal(authorization, "Bearer explicit");
});

test("neither credential present is reported as such, not as an API failure", async () => {
  await assert.rejects(
    main(["list", "--account", "acc", "--namespace", "ns", "--script", "w"], {}, async () => new Response(), Readable.from([""]), () => undefined),
    /CLOUDFLARE_API_TOKEN \(or a `wrangler login` session\) is required/,
  );
});

test("dispatch secret CLI validates binding names and a single secret source", async () => {
  await assert.rejects(main(["put", "--account", "acc", "--namespace", "ns", "--script", "w", "--name", "bad-name", "--stdin"], { CLOUDFLARE_API_TOKEN: "t" }, async () => new Response(), Readable.from(["x"])), /uppercase Worker binding/);
  await assert.rejects(main(["put", "--account", "acc", "--namespace", "ns", "--script", "w", "--name", "GOOD"], { CLOUDFLARE_API_TOKEN: "t" }, async () => new Response(), Readable.from(["x"])), /exactly one/);
});
