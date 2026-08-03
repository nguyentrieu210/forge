import test from "node:test";
import assert from "node:assert/strict";
import {
  ForgeAiPolicyError,
  buildForgeAiGatewayMetadata,
  runForgeAi,
} from "../dist/packages/ai-policy/src/index.js";

const baseRequest = {
  tenantId: "tenant-secret-name",
  userId: "user@example.com",
  app: "tenant-worker",
  purpose: "context_assistant",
  requestClass: "interactive",
  sensitivity: "confidential",
  input: { messages: [{ role: "user", content: "hello" }], max_tokens: 9999 },
};

test("gateway metadata stays within five stable keys and pseudonymizes identities", async () => {
  const metadata = await buildForgeAiGatewayMetadata(baseRequest);
  assert.deepEqual(Object.keys(metadata), ["tenant", "actor", "app", "purpose", "class"]);
  assert.equal(Object.keys(metadata).length, 5);
  assert.doesNotMatch(JSON.stringify(metadata), /tenant-secret-name|user@example\.com/);
  assert.match(metadata.tenant, /^t:[0-9a-f]{16}$/);
  assert.match(metadata.actor, /^u:[0-9a-f]{16}$/);
});

test("confidential requests use gateway without prompt logging or cache and clamp output budget", async () => {
  const calls = [];
  const binding = {
    aiGatewayLogId: "log-123",
    async run(...args) {
      calls.push(args);
      return { response: "ok" };
    },
  };
  const execution = await runForgeAi(binding, baseRequest, { gatewayId: "forge-ai" });
  assert.equal(execution.usedGateway, true);
  assert.equal(execution.gatewayLogId, "log-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].max_tokens, 700);
  assert.equal(calls[0][2].gateway.id, "forge-ai");
  assert.equal(calls[0][2].gateway.skipCache, true);
  assert.equal(calls[0][2].gateway.collectLog, false);
  assert.equal(Object.keys(calls[0][2].gateway.metadata).length, 5);
});

test("missing gateway configuration preserves the existing direct Workers AI path", async () => {
  const calls = [];
  const binding = {
    async run(...args) {
      calls.push(args);
      return { response: "ok" };
    },
  };
  const execution = await runForgeAi(binding, baseRequest);
  assert.equal(execution.usedGateway, false);
  assert.equal(calls[0].length, 2);
});

test("retired models follow the declared fallback graph", async () => {
  const models = [];
  const binding = {
    async run(model) {
      models.push(model);
      if (models.length === 1) throw new Error("5028 model deprecated");
      return { response: "fallback-ok" };
    },
  };
  const execution = await runForgeAi(binding, baseRequest);
  assert.equal(models.length, 2);
  assert.equal(execution.model, models[1]);
});

test("quota or rate-limit refusal never fans out into surprise fallback spend", async () => {
  let calls = 0;
  const binding = {
    async run() {
      calls += 1;
      throw new Error("429 rate limit exceeded");
    },
  };
  await assert.rejects(
    () => runForgeAi(binding, baseRequest, { gatewayId: "forge-ai" }),
    (error) => error instanceof ForgeAiPolicyError && error.code === "quota_or_rate_limited",
  );
  assert.equal(calls, 1);
});

test("trusted tenant context is mandatory", async () => {
  const binding = { async run() { return {}; } };
  await assert.rejects(
    () => runForgeAi(binding, { ...baseRequest, tenantId: "" }),
    (error) => error instanceof ForgeAiPolicyError && error.code === "invalid_context",
  );
});
