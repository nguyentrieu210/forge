import test from "node:test";
import assert from "node:assert/strict";
import { askAssistant } from "../dist/apps/tenant-worker/src/ai-assistant.js";

function environment(answer) {
  const writes = [];
  return {
    writes,
    env: {
      AI: { run: async () => ({ response: answer }) },
      DB: {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                async run() {
                  writes.push({ sql, params });
                  return { success: true };
                },
              };
            },
          };
        },
      },
    },
  };
}

test("successful AI answers are audit-logged with tenant and caller identity", async () => {
  const { env, writes } = environment("Còn 7 cây từ 4,5 m trở lên.");
  const response = await askAssistant(
    env,
    { question: "Còn bao nhiêu?", context: { warehouse: "K36", available_qty: 7 } },
    { tenantId: "demo", userId: "kho@example.com" },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: "Còn 7 cây từ 4,5 m trở lên." });
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /INSERT INTO ai_logs/);
  assert.equal(writes[0].params[0], "demo");
  assert.equal(writes[0].params[2], "kho@example.com");
  assert.equal(writes[0].params[3], "Còn bao nhiêu?");
  assert.deepEqual(JSON.parse(writes[0].params[4]), { warehouse: "K36", available_qty: 7 });
  assert.equal(writes[0].params[5], "Còn 7 cây từ 4,5 m trở lên.");
});

test("empty AI answers fail and never create a misleading audit record", async () => {
  const { env, writes } = environment("");
  const response = await askAssistant(
    env,
    { question: "Còn bao nhiêu?", context: {} },
    { tenantId: "demo", userId: "kho@example.com" },
  );
  assert.equal(response.status, 502);
  assert.equal(writes.length, 0);
});
