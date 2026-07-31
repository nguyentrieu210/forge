import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1RbacAdministrationService } from "../dist/packages/auth/src/rbac-administration.js";

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

const NOW = "2026-07-31T00:00:00.000Z";
const audit = (actorUserId, source = "test") => ({
  actorUserId,
  traceId: "trace-rbac-b",
  source,
});

function fixture() {
  const db = new D1Adapter();
  for (const tenant of ["tenant-a", "tenant-b"]) {
    for (const role of ["Administrator", "System Manager", "Stock User", "Stock Manager"]) {
      db.db.prepare("INSERT INTO roles(tenant_id,role,modified_at) VALUES(?,?,?)").run(tenant, role, NOW);
    }
  }
  return { db, service: new D1RbacAdministrationService(db) };
}

const input = (userId, passwordHash = "hash-value") => ({
  userId,
  fullName: userId,
  email: userId,
  enabled: true,
  userType: "System User",
  passwordHash,
});

test("invalid role leaves neither a user nor an audit event", async () => {
  const { db, service } = fixture();
  await assert.rejects(
    service.createUserWithRoles("tenant-a", input("bad@example.com"), ["Missing Role"], audit("admin"), NOW),
    /Unknown or disabled role/,
  );
  assert.equal(db.rows("SELECT * FROM users WHERE user_id='bad@example.com'").length, 0);
  assert.equal(db.rows("SELECT * FROM rbac_audit_events").length, 0);
});

test("user creation, grants and audit commit together", async () => {
  const { db, service } = fixture();
  const roles = await service.createUserWithRoles(
    "tenant-a",
    input("user@example.com"),
    ["Stock User", "Stock User"],
    audit("admin@example.com", "metaforge.api.create_user"),
    NOW,
  );
  assert.deepEqual(roles, ["Stock User"]);
  assert.deepEqual(await service.listRoles("tenant-a", "user@example.com"), ["Stock User"]);
  const rows = db.rows("SELECT event_type,before_json,after_json FROM rbac_audit_events");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, "user.create");
  assert.equal(rows[0].before_json, "null");
  assert.deepEqual(JSON.parse(rows[0].after_json).roles, ["Stock User"]);
});

test("a failed audit insert rolls back user creation and grants", async () => {
  const { db, service } = fixture();
  await assert.rejects(
    service.createUserWithRoles(
      "tenant-a",
      input("rollback@example.com"),
      ["Stock User"],
      { actorUserId: "admin@example.com", traceId: "trace-rbac-b", source: "" },
      NOW,
    ),
  );
  assert.equal(db.rows("SELECT * FROM users WHERE user_id='rollback@example.com'").length, 0);
  assert.equal(db.rows("SELECT * FROM user_roles WHERE user_id='rollback@example.com'").length, 0);
  assert.equal(db.rows("SELECT * FROM rbac_audit_events WHERE target_user_id='rollback@example.com'").length, 0);
});

test("last-admin guards are tenant scoped", async () => {
  const { db, service } = fixture();
  await service.createUserWithRoles("tenant-a", input("admin-a@example.com"), ["System Manager"], audit("seed"), NOW);
  await service.createUserWithRoles("tenant-b", input("admin-b@example.com"), ["System Manager"], audit("seed"), NOW);

  await assert.rejects(
    service.setUserEnabled("tenant-a", "admin-a@example.com", false, audit("operator@example.com"), NOW),
    /quản trị viên tenant cuối cùng/,
  );
  await assert.rejects(
    service.replaceRoles("tenant-a", "admin-a@example.com", ["Stock User"], audit("operator@example.com"), NOW),
    /quyền quản trị.*cuối cùng/,
  );
  assert.equal(db.rows("SELECT enabled FROM users WHERE tenant_id='tenant-a' AND user_id='admin-a@example.com'")[0].enabled, 1);
});

test("self-disable and self-demote are blocked even when another admin remains", async () => {
  const { service } = fixture();
  await service.createUserWithRoles("tenant-a", input("admin-a@example.com"), ["System Manager"], audit("seed"), NOW);
  await service.createUserWithRoles("tenant-a", input("admin-b@example.com"), ["System Manager"], audit("seed"), NOW);

  await assert.rejects(
    service.setUserEnabled("tenant-a", "admin-a@example.com", false, audit("admin-a@example.com"), NOW),
    /Không tự khoá/,
  );
  await assert.rejects(
    service.replaceRoles("tenant-a", "admin-a@example.com", ["Stock User"], audit("admin-a@example.com"), NOW),
    /Không tự hạ quyền/,
  );
});

test("admin role transition inserts replacement before deleting the previous grant", async () => {
  const { service } = fixture();
  await service.createUserWithRoles("tenant-a", input("admin@example.com"), ["System Manager"], audit("seed"), NOW);
  assert.deepEqual(
    await service.replaceRoles("tenant-a", "admin@example.com", ["Administrator"], audit("operator@example.com"), NOW),
    ["Administrator"],
  );
});

test("password and session audit never contains hashes, tokens or secrets", async () => {
  const { db, service } = fixture();
  await service.createUserWithRoles("tenant-a", input("user@example.com"), ["Stock User"], audit("seed"), NOW);
  const secretHash = "SECRET_HASH_MUST_NOT_APPEAR";
  assert.equal(
    await service.updatePasswordAndRevoke(
      "tenant-a",
      "user@example.com",
      secretHash,
      "password.reset",
      audit("admin@example.com", "reset"),
      NOW,
    ),
    1,
  );
  assert.equal(await service.revokeSessions("tenant-a", "user@example.com", audit("admin@example.com", "revoke"), NOW), 2);
  const serialized = JSON.stringify(db.rows("SELECT * FROM rbac_audit_events"));
  assert.equal(serialized.includes(secretHash), false);
  assert.equal(/password_hash|token|cookie|secret/i.test(serialized), false);
});

test("User Permission add/remove is audited, tenant scoped and idempotent", async () => {
  const { db, service } = fixture();
  const record = {
    user: "user@example.com",
    allowDoctype: "Warehouse",
    allowName: "KHO-1",
    applicableForDoctype: "Stock Entry",
    isDefault: false,
    hideDescendants: false,
    createdBy: "admin@example.com",
  };
  await service.putUserPermission("tenant-a", record, audit("admin@example.com", "add-scope"), NOW);
  assert.equal(db.rows("SELECT * FROM user_permissions WHERE tenant_id='tenant-a'").length, 1);
  assert.equal(db.rows("SELECT * FROM user_permissions WHERE tenant_id='tenant-b'").length, 0);
  assert.equal(await service.removeUserPermission("tenant-a", record, audit("admin@example.com", "remove-scope"), NOW), true);
  assert.equal(await service.removeUserPermission("tenant-a", record, audit("admin@example.com", "remove-scope"), NOW), false);
  assert.deepEqual(
    db.rows("SELECT event_type FROM rbac_audit_events WHERE event_type LIKE 'user_permission.%' ORDER BY event_type")
      .map((row) => row.event_type),
    ["user_permission.remove", "user_permission.upsert"],
  );
});
