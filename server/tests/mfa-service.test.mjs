import test from "node:test";
import assert from "node:assert/strict";
import { D1MfaService } from "../dist/packages/auth/src/index.js";

const TENANT = "tenant-a";
const USER = "user@example.com";
const NOW = "2026-08-03T03:00:00.000Z";
const NOW_SECONDS = Math.floor(Date.parse(NOW) / 1000);
const KEYS = { current: { keyId: "mfa-k1", kekBase64: Buffer.alloc(32, 7).toString("base64") } };
const AUDIT = { actorUserId: USER, traceId: "trace-mfa", source: "mfa-self-service" };

function fakeDb() {
  const state = { factor: null, recovery: new Map(), audits: [] };

  function statement(sql, values = []) {
    return {
      sql,
      values,
      bind(...bound) { return statement(sql, bound); },
      async first() {
        if (sql.includes("SELECT 1 AS enabled FROM user_mfa_factors")) {
          return state.factor?.status === "enabled" ? { enabled: 1 } : null;
        }
        if (sql.includes("SELECT COUNT(*) AS total FROM user_mfa_recovery_codes")) {
          return { total: [...state.recovery.values()].filter((entry) => !entry.used_at).length };
        }
        if (sql.includes("FROM user_mfa_factors") && sql.includes("status IN ('pending','enabled')")) {
          return state.factor && ["pending", "enabled"].includes(state.factor.status) ? { ...state.factor } : null;
        }
        if (sql.includes("UPDATE user_mfa_factors SET last_used_step")) {
          const step = values[3];
          if (!state.factor || state.factor.status !== "enabled") return null;
          if (state.factor.last_used_step !== null && state.factor.last_used_step >= step) return null;
          state.factor.last_used_step = step;
          return { factor_id: state.factor.factor_id };
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 0 } }; },
    };
  }

  async function apply(prepared) {
    const { sql, values } = prepared;
    if (sql.includes("DELETE FROM user_mfa_factors") && sql.includes("status='pending'")) {
      const changed = state.factor?.status === "pending" ? 1 : 0;
      if (changed) state.factor = null;
      return { success: true, meta: { changes: changed } };
    }
    if (sql.includes("INSERT INTO user_mfa_factors")) {
      const [tenant, user, factorId, ciphertext, keyId, createdAt] = values;
      assert.equal(tenant, TENANT); assert.equal(user, USER);
      state.factor = {
        factor_id: factorId,
        factor_type: "totp",
        status: "pending",
        secret_ciphertext: ciphertext,
        kek_id: keyId,
        created_at: createdAt,
        confirmed_at: null,
        disabled_at: null,
        last_used_step: null,
      };
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes("SET status='enabled'")) {
      const [, , factorId, confirmedAt, eventId, step] = values;
      if (!state.factor || state.factor.factor_id !== factorId || state.factor.status !== "pending") {
        return { success: true, meta: { changes: 0 } };
      }
      Object.assign(state.factor, { status: "enabled", confirmed_at: confirmedAt, activation_event_id: eventId, last_used_step: step });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO user_mfa_recovery_codes")) {
      const [, , factorId, hash, createdAt, eventId] = values;
      if (state.factor?.factor_id === factorId && state.factor.activation_event_id === eventId) {
        state.recovery.set(hash, { hash, created_at: createdAt, used_at: null, use_event_id: null });
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (sql.includes("UPDATE user_mfa_recovery_codes")) {
      const [, , factorId, hash, usedAt, eventId] = values;
      const row = state.recovery.get(hash);
      if (!row || state.factor?.factor_id !== factorId || row.used_at) return { success: true, meta: { changes: 0 } };
      row.used_at = usedAt; row.use_event_id = eventId;
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes("SET status='disabled'")) {
      const [, , factorId, disabledAt, eventId] = values;
      if (!state.factor || state.factor.factor_id !== factorId || state.factor.status !== "enabled") {
        return { success: true, meta: { changes: 0 } };
      }
      Object.assign(state.factor, { status: "disabled", disabled_at: disabledAt, disable_event_id: eventId });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO rbac_audit_events")) {
      state.audits.push({ sql, values });
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 0 } };
  }

  return {
    state,
    withSession() { return this; },
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      const results = [];
      for (const prepared of statements) results.push(await apply(prepared));
      return results;
    },
  };
}

test("TOTP enrollment stores only an AES-GCM envelope and confirms with independent RFC6238 output", async () => {
  const db = fakeDb();
  const service = new D1MfaService(db, KEYS);
  const enrollment = await service.beginTotpEnrollment(TENANT, USER, NOW, "Forge Test");
  assert.match(enrollment.secret_base32, /^[A-Z2-7]+$/);
  assert.match(enrollment.otpauth_uri, /^otpauth:\/\/totp\//);
  assert.equal(db.state.factor.secret_ciphertext.includes(enrollment.secret_base32), false);
  const envelope = JSON.parse(db.state.factor.secret_ciphertext);
  assert.equal(envelope.algorithm, "AES-GCM");
  assert.equal(db.state.factor.kek_id, "mfa-k1");

  const code = await independentTotp(enrollment.secret_base32, NOW_SECONDS);
  const confirmed = await service.confirmTotpEnrollment(TENANT, USER, code, AUDIT, NOW);
  assert.equal(confirmed.enabled, true);
  assert.equal(confirmed.recovery_codes.length, 10);
  assert.equal(new Set(confirmed.recovery_codes).size, 10);
  assert.equal(db.state.factor.status, "enabled");
  assert.equal(db.state.recovery.size, 10);
  assert.ok(db.state.audits.some((entry) => entry.sql.includes("'mfa.enable'")));
});

test("a TOTP timestep used to confirm enrollment cannot be replayed for login", async () => {
  const db = fakeDb();
  const service = new D1MfaService(db, KEYS);
  const enrollment = await service.beginTotpEnrollment(TENANT, USER, NOW);
  const code = await independentTotp(enrollment.secret_base32, NOW_SECONDS);
  await service.confirmTotpEnrollment(TENANT, USER, code, AUDIT, NOW);
  await assert.rejects(
    service.verifySecondFactor(TENANT, USER, code, AUDIT, NOW),
    /invalid or already used/,
  );

  const nextNow = new Date((NOW_SECONDS + 30) * 1000).toISOString();
  const nextCode = await independentTotp(enrollment.secret_base32, NOW_SECONDS + 30);
  assert.deepEqual(
    await service.verifySecondFactor(TENANT, USER, nextCode, AUDIT, nextNow),
    { method: "totp" },
  );
});

test("a recovery code succeeds exactly once and creates credential-security audit evidence", async () => {
  const db = fakeDb();
  const service = new D1MfaService(db, KEYS);
  const enrollment = await service.beginTotpEnrollment(TENANT, USER, NOW);
  const code = await independentTotp(enrollment.secret_base32, NOW_SECONDS);
  const confirmed = await service.confirmTotpEnrollment(TENANT, USER, code, AUDIT, NOW);
  const recovery = confirmed.recovery_codes[0];

  assert.deepEqual(
    await service.verifySecondFactor(TENANT, USER, recovery, AUDIT, new Date((NOW_SECONDS + 31) * 1000).toISOString()),
    { method: "recovery" },
  );
  await assert.rejects(
    service.verifySecondFactor(TENANT, USER, recovery, AUDIT, new Date((NOW_SECONDS + 32) * 1000).toISOString()),
    /invalid or already used/,
  );
  assert.ok(db.state.audits.some((entry) => entry.sql.includes("'mfa.recovery_used'")));
});

test("an enabled factor fails closed when its key generation is unavailable", async () => {
  const db = fakeDb();
  const configured = new D1MfaService(db, KEYS);
  const enrollment = await configured.beginTotpEnrollment(TENANT, USER, NOW);
  const code = await independentTotp(enrollment.secret_base32, NOW_SECONDS);
  await configured.confirmTotpEnrollment(TENANT, USER, code, AUDIT, NOW);

  const missingKeys = new D1MfaService(db);
  const nextCode = await independentTotp(enrollment.secret_base32, NOW_SECONDS + 30);
  await assert.rejects(
    missingKeys.verifySecondFactor(TENANT, USER, nextCode, AUDIT, new Date((NOW_SECONDS + 30) * 1000).toISOString()),
    /MFA encryption key generation is unavailable/,
  );
});

async function independentTotp(secretBase32, nowSeconds) {
  const secret = decodeBase32(secretBase32);
  const step = BigInt(Math.floor(nowSeconds / 30));
  const counter = new Uint8Array(8);
  let value = step;
  for (let index = 7; index >= 0; index -= 1) {
    counter[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = digest.at(-1) & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let buffer = 0;
  let bits = 0;
  const output = [];
  for (const character of value) {
    const index = alphabet.indexOf(character);
    assert.notEqual(index, -1);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}
