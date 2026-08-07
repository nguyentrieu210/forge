import assert from "node:assert/strict";
import test from "node:test";
import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";

test("App Factory compiles legacy runtime experiences out of installable packages", () => {
  const pkg = compileBrief({
    id: "sample",
    name: "Sample",
    version: "1.0.0",
    roles: ["Operator"],
    doctypes: [{
      name: "Task",
      label: "Task",
      fields: ["title:Data! Title"],
      permissions: { Operator: "rwc" },
    }],
    experiences: [{
      key: "legacy-workbench:task",
      label: "Legacy workbench",
      permission: "Task",
    }],
    navigation: {
      items: ["legacy-workbench:task", "Task"],
    },
    home: "legacy-workbench:task",
  });

  assert.equal(pkg.nav.some((entry) => entry.key === "legacy-workbench:task"), false);
  assert.deepEqual(pkg.nav.map((entry) => entry.key), ["Task"]);
  assert.deepEqual(pkg.home, { doctype: "Task" });
});
