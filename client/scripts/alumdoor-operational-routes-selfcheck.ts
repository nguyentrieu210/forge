import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AppManifest } from "@metaforge/core";
import {
  alumdoorOperationalRouteForAction,
  alumdoorOperationalRouteForDoctype,
} from "../apps/runtime/src/alumdoor-operational-routes.js";

const manifest = {
  id: "alumdoor",
  domain: "alumdoor",
  actions: [{ name: "nhap-nhom-fifo" }, { name: "giao-nhieu-don-fifo" }],
} as unknown as AppManifest;

assert.equal(alumdoorOperationalRouteForDoctype(manifest, "Delivery Note")?.action, "giao-nhieu-don-fifo");
assert.equal(alumdoorOperationalRouteForAction(manifest, "don-ban-thanh-phieu-xuat")?.doctype, "Delivery Note");
assert.equal(alumdoorOperationalRouteForAction(manifest, "giao-nhieu-don-fifo")?.doctype, "Delivery Note");

const policy = readFileSync(new URL("../packages/shell/src/workspace-product-policy.ts", import.meta.url), "utf8");
assert.match(policy, /ALUMDOOR_SALES_WORKSPACE_KEYS[\s\S]*"Sales Order"[\s\S]*"Delivery Note"/);
assert.match(policy, /group === "ban hang"/);
console.log("alumdoor operational routes selfcheck: PASS");
