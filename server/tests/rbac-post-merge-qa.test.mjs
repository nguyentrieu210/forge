import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1UserStore } from "../dist/packages/auth/src/index.js";

class StatementAdapter {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  parameters() {
    if (!/\?\d+/.test(this.sql)) return this.args;
    return Object.fromEntries(this.args.map((value, index) => [String(index + 1), value]));
  }

  async first() {
    const parameters = this.parameters();
    return (Array.isArray(parameters)
      ? this.db.prepare(this.sql).get(...parameters)
      : this.db.prepare(this.sql).get(parameters)) ?? null;
  }

  async all() {
    const parameters = this.parameters();
    return {
      results: Array.isArray(parameters)
        ? this.db.prepare(this.sql).all(...parameters)
        : this.db.prepare(this.sql).all(parameters),
    };
  }

  async run() {
    const parameters = this.parameters();
    const result = Array.isArray(parameters)
      ? this.db.prepare(this.sql).run(...parameters)
      : this.db.prepare(this.sql).run(parameters);
    return { meta: { changes: Number(result.changes ?? 0) } };
  }
}

class D1Adapter {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(`
      CREATE TABLE users(
        tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,full_name TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,user_type TEXT NOT NULL DEFAULT 'System User',password_hash TEXT NOT NULL DEFAULT '',
        session_epoch INTEGER NOT NULL DEFAULT 0,language TEXT NOT NULL DEFAULT '',time_zone TEXT NOT NULL DEFAULT '',
        last_login_at TEXT,created_at TEXT NOT NULL,modified_at TEXT NOT NULL,PRIMARY KEY(tenant_id,user_id)
      );
      CREATE TABLE roles(
        tenant_id TEXT NOT NULL,role TEXT NOT NULL,desk_access INTEGER NOT NULL DEFAULT 1,
        is_standard INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,modified_at TEXT NOT NULL,
        PRIMARY KEY(tenant_id,role)
      );
      CREATE TABLE user_roles(
        tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,
        PRIMARY KEY(tenant_id,user_id,role)
      );
      CREATE TABLE user_permissions(
        tenant_id TEXT NOT NULL,user TEXT NOT NULL,allow_doctype TEXT NOT NULL,allow_name TEXT NOT NULL,
        applicable_for_doctype TEXT NOT NULL DEFAULT '',is_default INTEGER NOT NULL DEFAULT 0,
        hide_descendants INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
        PRIMARY KEY(tenant_id,user,allow_doctype,allow_name,applicable_for_doctype)
      );
    `);
    const migration = readFileSync(new URL("../migrations/tenant/0030_rbac_audit.sql", import.meta.url), "utf8");
    this.db.exec(migration);
  }

  withSession() {
    return this;
  }

  prepare(sql) {
    return new StatementAdapter(this.db, sql);
  }

  async batch(statements) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  rows(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }
}

const NOW = "2026-07-31T12:00:00.000Z";
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const audit = (actorUserId, source, reason) => ({
  actorUserId,
  traceId: `trace-${source}`,
  source,
  ...(reason ? { reason } : {}),
});
const input = (userId, passwordHash) => ({
  userId,
  fullName: userId,
  email: userId,
  enabled: true,
  userType: "System User",
  passwordHash,
});

function fixture() {
  const db = new D1Adapter();
  for (const tenantId of [TENANT_A, TENANT_B]) {
    for (const role of ["Administrator", "System Manager", "Stock User", "Stock Manager"]) {
      db.db.prepare("INSERT INTO roles(tenant_id,role,modified_at) VALUES(?,?,?)").run(tenantId, role, NOW);
    }
  }
  return { db, store: new D1UserStore(db) };
}

test("post-merge login, role refresh and session revocation work together", async () => {
  const { db, store } = fixture();
  const administration = store.administration;

  await administration.createUserWithRoles(
    TENANT_A,
    input("admin-a@example.com", "admin-hash"),
    ["System Manager"],
    audit("seed", "seed-admin"),
    NOW,
  );
  await administration.createUserWithRoles(
    TENANT_A,
    input("worker@example.com", "worker-hash-v1"),
    ["Stock User"],
    audit("admin-a@example.com", "create-worker"),
    NOW,
  );

  const login = await store.findByLogin(TENANT_A, "WORKER@example.com");
  assert.ok(login);
  assert.equal(login.passwordHash, "worker-hash-v1");
  assert.equal(login.user.enabled, true);
  assert.equal(login.user.session_epoch, 0);

  await store.recordLogin(TENANT_A, "worker@example.com", NOW);
  assert.equal(
    db.rows("SELECT last_login_at FROM users WHERE tenant_id=? AND user_id=?", TENANT_A, "worker@example.com")[0].last_login_at,
    NOW,
  );

  assert.deepEqual(
    (await store.assertSessionStillValid(TENANT_A, "worker@example.com", 0)).roles,
    ["Stock User"],
  );

  await administration.replaceRoles(
    TENANT_A,
    "worker@example.com",
    ["Stock Manager"],
    audit("admin-a@example.com", "replace-worker-roles", "promotion"),
    NOW,
  );
  assert.deepEqual(
    (await store.assertSessionStillValid(TENANT_A, "worker@example.com", 0)).roles,
    ["Stock Manager"],
  );

  const nextEpoch = await administration.updatePasswordAndRevoke(
    TENANT_A,
    "worker@example.com",
    "worker-hash-v2-secret",
    "password.reset",
    audit("admin-a@example.com", "reset-worker-password"),
    NOW,
  );
  assert.equal(nextEpoch, 1);
  await assert.rejects(
    store.assertSessionStillValid(TENANT_A, "worker@example.com", 0),
    /Session has been revoked/,
  );
  assert.deepEqual(
    (await store.assertSessionStillValid(TENANT_A, "worker@example.com", 1)).roles,
    ["Stock Manager"],
  );
  assert.equal((await store.findByLogin(TENANT_A, "worker@example.com")).passwordHash, "worker-hash-v2-secret");

  await administration.setUserEnabled(
    TENANT_A,
    "worker@example.com",
    false,
    audit("admin-a@example.com", "disable-worker"),
    NOW,
  );
  await assert.rejects(
    store.assertSessionStillValid(TENANT_A, "worker@example.com", 1),
    /Account is disabled/,
  );
  assert.equal((await store.findByLogin(TENANT_A, "worker@example.com")).user.enabled, false);

  const auditJson = JSON.stringify(db.rows(
    "SELECT event_type,actor_user_id,target_user_id,before_json,after_json,reason,source FROM rbac_audit_events WHERE tenant_id=? ORDER BY created_at,event_type",
    TENANT_A,
  ));
  for (const eventType of ["user.create", "roles.replace", "password.reset", "user.disable"]) {
    assert.equal(auditJson.includes(eventType), true, `missing ${eventType}`);
  }
  assert.equal(auditJson.includes("worker-hash-v1"), false);
  assert.equal(auditJson.includes("worker-hash-v2-secret"), false);
  assert.equal(/password_hash|token|cookie|trusted identity/i.test(auditJson), false);
});

test("admin safeguards and User Permission scope remain tenant isolated", async () => {
  const { db, store } = fixture();
  const administration = store.administration;

  await administration.createUserWithRoles(
    TENANT_A,
    input("admin-a@example.com", "hash-a"),
    ["System Manager"],
    audit("seed", "seed-admin-a"),
    NOW,
  );
  await administration.createUserWithRoles(
    TENANT_A,
    input("admin-b@example.com", "hash-b"),
    ["System Manager"],
    audit("seed", "seed-admin-b"),
    NOW,
  );
  await administration.createUserWithRoles(
    TENANT_A,
    input("scoped@example.com", "hash-scoped"),
    ["Stock User"],
    audit("admin-a@example.com", "create-scoped"),
    NOW,
  );
  await administration.createUserWithRoles(
    TENANT_B,
    input("scoped@example.com", "hash-other-tenant"),
    ["Stock User"],
    audit("seed", "create-other-tenant-user"),
    NOW,
  );

  await assert.rejects(
    administration.setUserEnabled(
      TENANT_A,
      "admin-a@example.com",
      false,
      audit("admin-a@example.com", "self-disable"),
      NOW,
    ),
    /Không tự khoá/,
  );
  await assert.rejects(
    administration.replaceRoles(
      TENANT_A,
      "admin-a@example.com",
      ["Stock User"],
      audit("admin-a@example.com", "self-demote"),
      NOW,
    ),
    /Không tự hạ quyền/,
  );

  await administration.replaceRoles(
    TENANT_A,
    "admin-a@example.com",
    ["Stock User"],
    audit("admin-b@example.com", "demote-other-admin"),
    NOW,
  );
  await assert.rejects(
    administration.setUserEnabled(
      TENANT_A,
      "admin-b@example.com",
      false,
      audit("operator@example.com", "disable-last-admin"),
      NOW,
    ),
    /quản trị viên tenant cuối cùng/,
  );

  const permission = {
    user: "scoped@example.com",
    allowDoctype: "Warehouse",
    allowName: "KHO-NVL",
    applicableForDoctype: "Stock Entry",
    isDefault: false,
    hideDescendants: false,
    createdBy: "admin-b@example.com",
  };
  await administration.putUserPermission(
    TENANT_A,
    permission,
    audit("admin-b@example.com", "add-warehouse-scope"),
    NOW,
  );

  assert.equal(db.rows("SELECT * FROM user_permissions WHERE tenant_id=?", TENANT_A).length, 1);
  assert.equal(db.rows("SELECT * FROM user_permissions WHERE tenant_id=?", TENANT_B).length, 0);
  assert.equal(
    await administration.removeUserPermission(
      TENANT_A,
      permission,
      audit("admin-b@example.com", "remove-warehouse-scope"),
      NOW,
    ),
    true,
  );
  assert.equal(db.rows("SELECT * FROM user_permissions WHERE tenant_id=?", TENANT_A).length, 0);

  const tenantAEvents = db.rows("SELECT event_type FROM rbac_audit_events WHERE tenant_id=?", TENANT_A)
    .map((row) => row.event_type);
  const tenantBEvents = db.rows("SELECT event_type FROM rbac_audit_events WHERE tenant_id=?", TENANT_B)
    .map((row) => row.event_type);
  assert.ok(tenantAEvents.includes("roles.replace"));
  assert.ok(tenantAEvents.includes("user_permission.upsert"));
  assert.ok(tenantAEvents.includes("user_permission.remove"));
  assert.deepEqual(tenantBEvents, ["user.create"]);
});
