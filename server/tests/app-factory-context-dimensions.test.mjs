import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CLIENT_CONTEXT_DIMENSIONS,
  parseAppManifest,
} from "../dist/packages/app-registry/src/index.js";
import {
  BRIEF_CONTEXT_DIMENSIONS,
  validateBriefContextDimensions,
} from "../scripts/lib/business-context-dimensions.mjs";
import {
  BriefError,
  compileBrief,
} from "../scripts/lib/compile-brief-app-factory.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";

function brief(overrides = {}) {
  return {
    id: "context-test",
    name: "Context Test",
    roles: ["User"],
    dimensions: ["company", "branch"],
    doctypes: [{
      name: "Thing",
      fields: ["title:Data! Tên"],
      permissions: { User: "rwc" },
    }],
    ...overrides,
  };
}

test("brief helper, JSON Schema and server parser expose the same context dimension set", async () => {
  const schema = JSON.parse(await readFile(new URL("../briefs/brief.schema.json", import.meta.url), "utf8"));
  const schemaDimensions = schema.properties.dimensions.items.enum;
  assert.deepEqual([...BRIEF_CONTEXT_DIMENSIONS].sort(), [...CLIENT_CONTEXT_DIMENSIONS].sort());
  assert.deepEqual([...schemaDimensions].sort(), [...CLIENT_CONTEXT_DIMENSIONS].sort());
});

test("unsupported department fails before App Factory package emission", () => {
  const source = brief({ dimensions: ["company", "branch", "department"] });
  assert.deepEqual(validateBriefContextDimensions(source).length, 1);
  assert.throws(() => compileBrief(source), BriefError);
  assert.throws(() => compileBrief(source), /server có thể resolve: department/);
});

test("brief schema also reports an unsupported context dimension", async () => {
  const errors = await validateBriefSchema(brief({ dimensions: ["company", "department"] }));
  assert.ok(errors.some((entry) => entry.includes("department")));
});

test("every accepted App Factory dimension survives server manifest parsing", () => {
  for (const dimension of BRIEF_CONTEXT_DIMENSIONS) {
    const pkg = compileBrief(brief({ dimensions: [dimension] }));
    const parsed = parseAppManifest(pkg);
    assert.deepEqual(parsed.client.dimensions, [dimension]);
  }
});
