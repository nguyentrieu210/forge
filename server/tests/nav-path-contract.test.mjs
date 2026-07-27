import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { navItemPath } from "../dist/packages/app-registry/src/index.js";

/**
 * The server and the client must agree on the URL a nav entry leads to.
 *
 * They are separate codebases with separate implementations, and when they disagree the
 * failure is invisible on both sides. It happened: the server encoded an experience key
 * with `encodeURIComponent` while the client's manifest validator compared against the raw
 * key, so the first app generated from a brief installed cleanly, reported a valid
 * manifest, and then opened to "Không dựng được giao diện" — a redirect-loop guard firing
 * against a route that was in fact correct.
 *
 * Nothing caught it because the rule existed twice: `resolveNavPath` on the client had the
 * encoding, and the validator kept its own copy that did not. This test pins the two
 * implementations against each other so a third copy, or a change to either, has to break
 * here first.
 */

const CLIENT_MANIFEST = path.resolve(
  new URL("../../client/packages/core/dist/app/manifest.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

// The client is a sibling workspace, not a dependency: skip rather than fail when only the
// server is checked out or built, but say so — a silently skipped contract test is worse
// than no test at all.
const available = existsSync(CLIENT_MANIFEST);
const client = available ? await import(pathToFileURL(CLIENT_MANIFEST).href) : null;

test("server and client resolve the same path for every nav kind", { skip: available ? false : `client core not built at ${CLIENT_MANIFEST}` }, () => {
  const cases = [
    { key: "Leave Application", label: "x", kind: "doctype" },
    { key: "approval:Asset Request", label: "x", kind: "experience" },
    { key: "picking", label: "x", kind: "experience" },
    { key: "__permissions", label: "x", kind: "system" },
    { key: "catalog", label: "x", kind: "route", route: "/catalog" },
  ];
  for (const item of cases) {
    assert.equal(
      navItemPath(item),
      client.resolveNavPath(item),
      `nav kind "${item.kind}" key "${item.key}": server and client disagree on the route`,
    );
  }
});

test("a key needing URL encoding resolves identically on both sides", { skip: available ? false : "client core not built" }, () => {
  // The exact shape that broke: a colon and a space in one experience key.
  const item = { key: "approval:Asset Request", label: "x", kind: "experience" };
  assert.equal(navItemPath(item), "/x/approval%3AAsset%20Request");
  assert.equal(client.resolveNavPath(item), "/x/approval%3AAsset%20Request");
});

test("the client accepts a home route the server would produce", { skip: available ? false : "client core not built" }, () => {
  const nav = [
    { key: "approval:Asset Request", label: "Duyệt", kind: "experience" },
    { key: "Asset Request", label: "Yêu cầu", kind: "doctype" },
  ];
  const manifest = {
    id: "assets", name: "Tài sản", home: { route: navItemPath(nav[0]) }, nav,
  };
  const result = client.validateManifest(manifest);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, [], `client rejected a manifest the server built: ${errors.map((issue) => issue.code).join(", ")}`);
  assert.equal(result.ok, true);
});

test("an unreachable home route is still rejected — the guard must not be loosened, only unified", { skip: available ? false : "client core not built" }, () => {
  const result = client.validateManifest({
    id: "assets", name: "Tài sản",
    home: { route: "/x/approval%3ASomething%20Else" },
    nav: [{ key: "approval:Asset Request", label: "Duyệt", kind: "experience" }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "home_route_unmatched"), "the redirect-loop guard still fires on a genuinely unreachable home");
});
