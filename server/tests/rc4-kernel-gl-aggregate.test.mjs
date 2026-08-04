import test from "node:test";
import assert from "node:assert/strict";
import { D1GeneralLedgerAggregateReader } from "../dist/packages/document-kernel/src/general-ledger-aggregate.js";

function fakeD1(rows) {
  const calls = { consistency: [], sql: [], params: [] };
  const session = {
    prepare(sql) {
      calls.sql.push(sql);
      return {
        bind(...params) {
          calls.params.push(params);
          return {
            async all() {
              return { results: rows };
            },
          };
        },
      };
    },
  };
  return {
    calls,
    db: {
      withSession(consistency) {
        calls.consistency.push(consistency);
        return session;
      },
      prepare: session.prepare,
    },
  };
}

const validRow = {
  company: "ALUMDOOR",
  branch: "HN",
  account: "131",
  currency: "VND",
  currency_scale: 0,
  debit_minor: 250_000,
  credit_minor: 75_000,
  entry_count: 4,
  voucher_count: 3,
  first_posting_at: "2026-07-01T08:00:00.000Z",
  last_posting_at: "2026-07-31T17:00:00.000Z",
};

test("GL aggregate uses primary session, canonical scope and deterministic account bindings", async () => {
  const { db, calls } = fakeD1([validRow]);
  const reader = new D1GeneralLedgerAggregateReader(db);

  const result = await reader.aggregateGeneralLedger({
    tenant_id: "tenant-a",
    company: "ALUMDOOR",
    from_posting_date: "2026-07-01",
    to_posting_date: "2026-07-31",
    branch: "HN",
    currency: "VND",
    accounts: ["511", "131", "511"],
  });

  assert.deepEqual(calls.consistency, ["first-primary"]);
  assert.deepEqual(calls.params, [[
    "tenant-a",
    "ALUMDOOR",
    "2026-07-01",
    "2026-07-31",
    "HN",
    "VND",
    "131",
    "511",
  ]]);
  assert.match(calls.sql[0], /FROM gl_entries g/);
  assert.match(calls.sql[0], /INNER JOIN documents d/);
  assert.match(calls.sql[0], /g\.tenant_id=\?1/);
  assert.match(calls.sql[0], /json_extract\(d\.payload_json,'\$\.company'\)=\?2/);
  assert.match(calls.sql[0], /date\(g\.posting_at\)>=date\(\?3\)/);
  assert.match(calls.sql[0], /date\(g\.posting_at\)<=date\(\?4\)/);
  assert.match(calls.sql[0], /g\.account IN \(\?7,\?8\)/);

  assert.deepEqual(result, [{
    company: "ALUMDOOR",
    branch: "HN",
    account: "131",
    currency: "VND",
    currency_scale: 0,
    debit_minor: 250_000,
    credit_minor: 75_000,
    net_minor: 175_000,
    source_evidence: {
      source: "gl_entries",
      entry_count: 4,
      voucher_count: 3,
      first_posting_at: "2026-07-01T08:00:00.000Z",
      last_posting_at: "2026-07-31T17:00:00.000Z",
    },
  }]);
});

test("GL aggregate keeps optional scope explicit instead of turning empty filters into broad reads", async () => {
  const { db, calls } = fakeD1([]);
  const reader = new D1GeneralLedgerAggregateReader(db);

  await reader.aggregateGeneralLedger({
    tenant_id: "tenant-a",
    company: "ALUMDOOR",
    from_posting_date: "2026-01-01",
    to_posting_date: "2026-12-31",
  });

  assert.deepEqual(calls.params, [["tenant-a", "ALUMDOOR", "2026-01-01", "2026-12-31"]]);
  assert.doesNotMatch(calls.sql[0], /g\.account IN/);
  assert.doesNotMatch(calls.sql[0], /g\.currency=\?5/);

  await assert.rejects(
    () => reader.aggregateGeneralLedger({
      tenant_id: "tenant-a",
      company: "ALUMDOOR",
      from_posting_date: "2026-01-01",
      to_posting_date: "2026-12-31",
      accounts: [],
    }),
    /accounts must contain at least one account/,
  );
});

test("GL aggregate rejects invalid date scopes before issuing SQL", async () => {
  const { db, calls } = fakeD1([]);
  const reader = new D1GeneralLedgerAggregateReader(db);

  await assert.rejects(
    () => reader.aggregateGeneralLedger({
      tenant_id: "tenant-a",
      company: "ALUMDOOR",
      from_posting_date: "2026-02-31",
      to_posting_date: "2026-03-01",
    }),
    /not a valid calendar date/,
  );
  await assert.rejects(
    () => reader.aggregateGeneralLedger({
      tenant_id: "tenant-a",
      company: "ALUMDOOR",
      from_posting_date: "2026-08-02",
      to_posting_date: "2026-08-01",
    }),
    /must be on or before/,
  );
  assert.equal(calls.sql.length, 0);
});

test("GL aggregate bounds account fan-out", async () => {
  const { db } = fakeD1([]);
  const reader = new D1GeneralLedgerAggregateReader(db);
  await assert.rejects(
    () => reader.aggregateGeneralLedger({
      tenant_id: "tenant-a",
      company: "ALUMDOOR",
      from_posting_date: "2026-01-01",
      to_posting_date: "2026-12-31",
      accounts: Array.from({ length: 65 }, (_, index) => `ACC-${index}`),
    }),
    /64-account filter limit/,
  );
});

test("GL aggregate fails closed when fixed-point totals cannot be represented exactly", async () => {
  const { db } = fakeD1([{ ...validRow, debit_minor: Number.MAX_SAFE_INTEGER + 1 }]);
  const reader = new D1GeneralLedgerAggregateReader(db);
  await assert.rejects(
    () => reader.aggregateGeneralLedger({
      tenant_id: "tenant-a",
      company: "ALUMDOOR",
      from_posting_date: "2026-07-01",
      to_posting_date: "2026-07-31",
    }),
    /safe integer range/,
  );
});
