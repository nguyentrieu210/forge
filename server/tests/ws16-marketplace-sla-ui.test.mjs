import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const queue = await readFile(new URL("../../client/apps/runtime/src/experiences/MarketplaceSlaQueue.tsx", import.meta.url), "utf8");
const badge = await readFile(new URL("../../client/apps/runtime/src/experiences/MarketplaceSlaBadge.tsx", import.meta.url), "utf8");
const social = await readFile(new URL("../../client/apps/runtime/src/experiences/SocialCommerce.tsx", import.meta.url), "utf8");

test("order cockpit mounts a dedicated policy-driven SLA queue", () => {
  assert.match(social, /import \{ MarketplaceSlaQueue \}/);
  assert.match(social, /<MarketplaceSlaQueue orders=\{orders\} \/>/);
  assert.match(queue, /Marketplace SLA Policy/);
  assert.match(queue, /Cần chú ý/);
  assert.match(queue, /Vi phạm/);
  assert.match(queue, /Chưa cấu hình/);
  assert.match(queue, /slaNeedsAttention\(order\.sla \?\? null\)/);
});

test("SLA UI trusts server observation and does not manufacture clocks or lifecycle state", () => {
  assert.match(queue, /order\.sla\?\.state === "breached"/);
  assert.match(badge, /sla\.due_at/);
  assert.match(badge, /sla\.fulfilled_at/);
  assert.doesNotMatch(queue, /Date\.now|new Date\(|created_at|modified_at|target_minutes\s*[+*\/-]/);
  assert.doesNotMatch(badge, /Date\.now|target_minutes\s*[+*\/-]|warning_minutes\s*[+*\/-]/);
  assert.doesNotMatch(queue, /\b(?:POST|PUT|PATCH|DELETE)\b|\bapi\s*\(|\bfetch\s*\(/);
});
