import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const socialCommerce = await readFile(new URL("../../client/apps/runtime/src/experiences/SocialCommerce.tsx", import.meta.url), "utf8");

const start = socialCommerce.indexOf("function MarketplaceOrderList");
const end = socialCommerce.indexOf("function SettlementList");
assert.ok(start >= 0 && end > start);
const cockpit = socialCommerce.slice(start, end);

test("order cockpit searches canonical order references and filters by provider and status locally", () => {
  assert.match(cockpit, /const \[query, setQuery\] = useState\(""\)/);
  assert.match(cockpit, /const \[providerFilter, setProviderFilter\] = useState\("all"\)/);
  assert.match(cockpit, /const \[statusFilter, setStatusFilter\] = useState\("all"\)/);
  assert.match(cockpit, /Tìm mã đơn \/ Sales Order \/ Customer/);
  assert.match(cockpit, /order\.order_id, order\.sales_order_name \?\? "", order\.customer \?\? ""/);
  assert.match(cockpit, /providerFilter !== "all" && order\.provider !== providerFilter/);
  assert.match(cockpit, /statusFilter !== "all" && order\.status !== statusFilter/);
  assert.match(cockpit, /filteredOrders\.map/);
});

test("attention filter is based only on missing canonical links and does not invent an SLA clock", () => {
  assert.match(cockpit, /const \[missingLinkOnly, setMissingLinkOnly\] = useState\(false\)/);
  assert.match(cockpit, /!order\.sales_order_name \|\| !order\.customer/);
  assert.match(cockpit, /Thiếu liên kết ERP/);
  assert.match(cockpit, /Thiếu Customer/);
  assert.match(cockpit, /Thiếu Sales Order/);
  assert.doesNotMatch(cockpit, /Date\.now\(\)|getTime\(\)|86400000|SLA|overdue|quá hạn/i);
});

test("order cockpit filters are observational and do not introduce new lifecycle mutation routes", () => {
  const filterStart = cockpit.indexOf("const [query, setQuery]");
  const identityStart = cockpit.indexOf("async function saveIdentity");
  assert.ok(filterStart >= 0 && identityStart > filterStart);
  const filterLogic = cockpit.slice(filterStart, identityStart);
  assert.doesNotMatch(filterLogic, /\bapi\s*[<(]/);
  assert.doesNotMatch(filterLogic, /fetch\s*\(/);
  assert.doesNotMatch(filterLogic, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});
