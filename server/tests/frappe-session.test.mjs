import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCsrf,
  clearedSessionCookie,
  establishSession,
  hashPassword,
  mintSession,
  parsePasswordHash,
  readSid,
  routeFrappeAuth,
  verifyPassword,
  verifySession,
  slideSession,
} from "../dist/packages/frappe-api/src/index.js";

const SECRET = "platform-session-secret-value";
const TENANT = "acme";
// Real work factor is 210k; tests use a smaller one so the suite stays fast. The
// count is stored per hash, which is exactly why this is safe to vary.
const TEST_ITERATIONS = 1_000;

// ---- password hashing -------------------------------------------------------

test("a password verifies against its own hash and nothing else", async () => {
  const hash = await hashPassword("correct horse battery", TEST_ITERATIONS);
  assert.equal(await verifyPassword("correct horse battery", hash), true);
  assert.equal(await verifyPassword("correct horse batteryX", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("each hash gets a fresh salt, so identical passwords do not collide", async () => {
  const [a, b] = await Promise.all([
    hashPassword("same password", TEST_ITERATIONS),
    hashPassword("same password", TEST_ITERATIONS),
  ]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same password", a), true);
  assert.equal(await verifyPassword("same password", b), true);
});

test("the work factor is stored per hash so it can be raised without invalidating old credentials", async () => {
  const parsed = parsePasswordHash(await hashPassword("abcdefgh", TEST_ITERATIONS));
  assert.equal(parsed.algorithm, "pbkdf2-sha256");
  assert.equal(parsed.iterations, TEST_ITERATIONS);
});

test("a malformed or truncated stored hash fails closed instead of throwing", async () => {
  for (const stored of ["", "garbage", "pbkdf2-sha256$abc$x$y", "md5$1$a$b", "pbkdf2-sha256$1000$only-three"]) {
    assert.equal(await verifyPassword("anything", stored), false, stored);
  }
});

test("passwords that cannot be hashed meaningfully are refused at the boundary", async () => {
  await assert.rejects(() => hashPassword("short", TEST_ITERATIONS), /at least 8/);
  await assert.rejects(() => hashPassword("x".repeat(257), TEST_ITERATIONS), /at most 256/);
});

// ---- session tokens ---------------------------------------------------------

test("a minted session verifies and carries its user, roles and csrf nonce", async () => {
  const minted = await mintSession({ tenantId: TENANT, userId: "u@example.com", roles: ["Sales User"], epoch: 3, secret: SECRET });
  const session = await verifySession(minted.sid, TENANT, SECRET);
  assert.equal(session.actor.user_id, "u@example.com");
  assert.deepEqual(session.actor.roles, ["Sales User"]);
  assert.equal(session.epoch, 3);
  assert.equal(session.csrfToken, minted.csrfToken);
});

test("a tampered payload or signature is rejected", async () => {
  const minted = await mintSession({ tenantId: TENANT, userId: "u@example.com", roles: ["Sales User"], epoch: 1, secret: SECRET });
  const [payload, signature] = minted.sid.split(".");

  // Re-encoding the payload with elevated roles must not verify.
  const forged = Buffer.from(JSON.stringify({ v: 1, t: TENANT, u: "u@example.com", r: ["System Manager"], e: 1, x: 4e9, c: "x" }))
    .toString("base64url");
  await assert.rejects(() => verifySession(`${forged}.${signature}`, TENANT, SECRET), /invalid/i);
  await assert.rejects(() => verifySession(`${payload}.${signature.slice(0, -2)}xy`, TENANT, SECRET), /invalid/i);
  await assert.rejects(() => verifySession(payload, TENANT, SECRET), /invalid/i);
  await assert.rejects(() => verifySession("", TENANT, SECRET), /invalid/i);
});

test("a session for one tenant cannot be replayed against another", async () => {
  const minted = await mintSession({ tenantId: TENANT, userId: "u@example.com", roles: [], epoch: 1, secret: SECRET });
  // The signing key is tenant-derived, so this fails on the signature; the
  // explicit tenant check inside keeps a future key change from opening it.
  await assert.rejects(() => verifySession(minted.sid, "other-tenant", SECRET), /invalid|does not belong/i);
});

test("a session signed with a different platform secret is rejected", async () => {
  const minted = await mintSession({ tenantId: TENANT, userId: "u@example.com", roles: [], epoch: 1, secret: SECRET });
  await assert.rejects(() => verifySession(minted.sid, TENANT, "another-secret"), /invalid/i);
});

test("an expired session is rejected even though its signature is valid", async () => {
  const past = Math.floor(Date.now() / 1000) - 10_000;
  const minted = await mintSession({ tenantId: TENANT, userId: "u@example.com", roles: [], epoch: 1, secret: SECRET, ttlSeconds: 60, now: past });
  await assert.rejects(() => verifySession(minted.sid, TENANT, SECRET), /expired/i);
});

test("the session cookie is HttpOnly, Secure and scoped, so injected script cannot read it", async () => {
  const minted = await mintSession({ tenantId: TENANT, userId: "u@example.com", roles: [], epoch: 1, secret: SECRET });
  assert.match(minted.cookie, /^sid=/);
  assert.match(minted.cookie, /HttpOnly/);
  assert.match(minted.cookie, /Secure/);
  assert.match(minted.cookie, /SameSite=Lax/);
  assert.match(minted.cookie, /Path=\//);
  assert.match(clearedSessionCookie(), /Max-Age=0/);
});

test("reading the sid ignores other cookies and treats Guest as no session", () => {
  const withSid = new Request("https://x/", { headers: { cookie: "theme=dark; sid=abc.def; other=1" } });
  assert.equal(readSid(withSid), "abc.def");
  assert.equal(readSid(new Request("https://x/", { headers: { cookie: "sid=Guest" } })), null);
  assert.equal(readSid(new Request("https://x/", { headers: { cookie: "notsid=abc" } })), null);
  assert.equal(readSid(new Request("https://x/")), null);
});

// ---- CSRF -------------------------------------------------------------------

test("CSRF is enforced on writes and exempt on reads", async () => {
  const minted = await mintSession({ tenantId: TENANT, userId: "u@example.com", roles: [], epoch: 1, secret: SECRET });
  const session = await verifySession(minted.sid, TENANT, SECRET);

  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.doesNotThrow(() => assertCsrf(new Request("https://x/", { method }), session));
  }

  const post = (headers) => new Request("https://x/", { method: "POST", headers });
  assert.doesNotThrow(() => assertCsrf(post({ "x-frappe-csrf-token": session.csrfToken }), session));
  // A cross-site form can send the cookie but cannot read the nonce.
  assert.throws(() => assertCsrf(post({}), session), /CSRF/);
  // And unlike plain double-submit, it cannot substitute a nonce of its own:
  // the value must match the one sealed inside this exact session.
  assert.throws(() => assertCsrf(post({ "x-frappe-csrf-token": "attacker-chosen" }), session), /CSRF/);
});

test("two sessions get different csrf nonces, so one cannot be used to write as the other", async () => {
  const a = await mintSession({ tenantId: TENANT, userId: "a@example.com", roles: [], epoch: 1, secret: SECRET });
  const b = await mintSession({ tenantId: TENANT, userId: "b@example.com", roles: [], epoch: 1, secret: SECRET });
  assert.notEqual(a.csrfToken, b.csrfToken);
  const sessionB = await verifySession(b.sid, TENANT, SECRET);
  assert.throws(() => assertCsrf(new Request("https://x/", { method: "POST", headers: { "x-frappe-csrf-token": a.csrfToken } }), sessionB), /CSRF/);
});

// ---- login / logout --------------------------------------------------------

/** Minimal stand-in for the D1-backed directory. */
function userStore(users) {
  return {
    async findByLogin(_tenant, login) {
      const key = login.trim().toLowerCase();
      const found = users.find((user) => user.user_id.toLowerCase() === key || (user.email ?? "").toLowerCase() === key);
      return found ? { user: found, passwordHash: found.password_hash } : null;
    },
    async get(_tenant, userId) {
      return users.find((user) => user.user_id === userId) ?? null;
    },
    async listRoles(_tenant, userId) {
      return users.find((user) => user.user_id === userId)?.roles ?? [];
    },
    async assertSessionStillValid(tenant, userId, epoch) {
      const user = await this.get(tenant, userId);
      if (!user) throw Object.assign(new Error("Session user no longer exists"), { code: "AUTHENTICATION_REQUIRED", status: 401 });
      if (!user.enabled) throw Object.assign(new Error("Account is disabled"), { code: "AUTHENTICATION_REQUIRED", status: 401 });
      if (user.session_epoch !== epoch) throw Object.assign(new Error("Session has been revoked"), { code: "AUTHENTICATION_REQUIRED", status: 401 });
      return { ...user, roles: user.roles ?? [] };
    },
    async recordLogin() { this.loginRecorded = true; },
  };
}

async function makeUser(overrides = {}) {
  return {
    user_id: "sales@example.com",
    email: "sales@example.com",
    full_name: "Sales Person",
    enabled: true,
    user_type: "System User",
    session_epoch: 1,
    language: "vi",
    time_zone: "Asia/Ho_Chi_Minh",
    roles: ["Sales User"],
    password_hash: await hashPassword("supersecret1", TEST_ITERATIONS),
    ...overrides,
  };
}

function authContext(users) {
  return { tenantId: TENANT, users, sessionSecret: SECRET, traceId: "trace-1", now: () => "2026-07-26T12:00:00.000Z" };
}

function loginRequest(body) {
  return new Request("https://x/api/method/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("a correct login sets an HttpOnly cookie and returns the csrf token", async () => {
  const store = userStore([await makeUser()]);
  const request = loginRequest({ usr: "sales@example.com", pwd: "supersecret1" });
  const response = await routeFrappeAuth(request, new URL(request.url), authContext(store));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: "Logged In" });
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^sid=/);
  assert.match(cookie, /HttpOnly/);
  assert.ok(response.headers.get("x-frappe-csrf-token"));
  assert.equal(store.loginRecorded, true);
});

test("login is accepted by email as well as by user id", async () => {
  const store = userStore([await makeUser({ user_id: "u-001", email: "sales@example.com" })]);
  const request = loginRequest({ usr: "SALES@EXAMPLE.COM", pwd: "supersecret1" });
  const response = await routeFrappeAuth(request, new URL(request.url), authContext(store));
  assert.equal(response.status, 200);
});

test("a wrong password, an unknown user and a disabled account are indistinguishable", async () => {
  // Any difference in status, message or shape here is a user-enumeration oracle.
  const cases = [
    [[await makeUser()], { usr: "sales@example.com", pwd: "wrong-password" }],
    [[await makeUser()], { usr: "nobody@example.com", pwd: "supersecret1" }],
    [[await makeUser({ enabled: false })], { usr: "sales@example.com", pwd: "supersecret1" }],
    [[await makeUser({ password_hash: "" })], { usr: "sales@example.com", pwd: "supersecret1" }],
    [[await makeUser()], { usr: "", pwd: "" }],
  ];
  const seen = new Set();
  for (const [users, body] of cases) {
    const request = loginRequest(body);
    const response = await routeFrappeAuth(request, new URL(request.url), authContext(userStore(users)));
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.exc_type, "AuthenticationError");
    assert.equal(response.headers.get("set-cookie"), null, "a failed login must not set a session");
    seen.add(`${response.status}|${payload.exc_type}|${payload.message}`);
  }
  assert.equal(seen.size, 1, "every failure mode must be reported identically");
});

test("login refuses anything but POST, so a link cannot log someone in", async () => {
  const store = userStore([await makeUser()]);
  const url = new URL("https://x/api/method/login?usr=sales@example.com&pwd=supersecret1");
  const response = await routeFrappeAuth(new Request(url, { method: "GET" }), url, authContext(store));
  assert.equal(response.status, 417);
});

test("logout clears the cookie and works even when the session is already unusable", async () => {
  const store = userStore([await makeUser()]);
  const url = new URL("https://x/api/method/logout");
  for (const cookie of ["sid=garbage", "sid=Guest", ""]) {
    const response = await routeFrappeAuth(new Request(url, { method: "POST", headers: cookie ? { cookie } : {} }), url, authContext(store));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  }
});

// ---- session establishment on an authenticated request ----------------------

test("no cookie means no session, which is different from a broken one", async () => {
  const store = userStore([await makeUser()]);
  assert.equal(await establishSession(new Request("https://x/api/method/anything"), authContext(store)), null);
});

test("roles come from the directory, so revoking a role takes effect immediately", async () => {
  const user = await makeUser();
  const store = userStore([user]);
  const minted = await mintSession({ tenantId: TENANT, userId: user.user_id, roles: ["Sales User", "Sales Manager"], epoch: 1, secret: SECRET });
  const request = new Request("https://x/api/method/anything", { headers: { cookie: `sid=${minted.sid}` } });

  // The token still claims Sales Manager; the directory no longer grants it.
  user.roles = ["Sales User"];
  const established = await establishSession(request, authContext(store));
  assert.deepEqual(established.actor.roles, ["Sales User"]);
  assert.equal(established.actor.locale, "vi");
});

test("bumping the epoch revokes every outstanding session", async () => {
  const user = await makeUser();
  const store = userStore([user]);
  const minted = await mintSession({ tenantId: TENANT, userId: user.user_id, roles: user.roles, epoch: 1, secret: SECRET });
  const request = new Request("https://x/api/method/anything", { headers: { cookie: `sid=${minted.sid}` } });

  assert.ok(await establishSession(request, authContext(store)));
  user.session_epoch = 2;
  await assert.rejects(() => establishSession(request, authContext(store)), /revoked/i);
});

test("a session for a deleted or disabled user stops working despite a valid signature", async () => {
  const user = await makeUser();
  const store = userStore([user]);
  const minted = await mintSession({ tenantId: TENANT, userId: user.user_id, roles: user.roles, epoch: 1, secret: SECRET });
  const request = new Request("https://x/api/method/anything", { headers: { cookie: `sid=${minted.sid}` } });

  user.enabled = false;
  await assert.rejects(() => establishSession(request, authContext(store)), /disabled/i);

  const empty = userStore([]);
  await assert.rejects(() => establishSession(request, authContext(empty)), /no longer exists/i);
});

test("the cookie slides only near expiry, so an active user is not re-cookied on every request", async () => {
  const user = await makeUser();
  const store = userStore([user]);
  const context = authContext(store);
  const now = Math.floor(Date.now() / 1000);

  const fresh = await mintSession({ tenantId: TENANT, userId: user.user_id, roles: user.roles, epoch: 1, secret: SECRET, now });
  const freshSession = await verifySession(fresh.sid, TENANT, SECRET);
  assert.equal(await slideSession({ session: freshSession, user: { ...user, roles: user.roles }, actor: {} }, context, now), null);

  const nearlyDone = await mintSession({ tenantId: TENANT, userId: user.user_id, roles: user.roles, epoch: 1, secret: SECRET, ttlSeconds: 600, now });
  const nearSession = await verifySession(nearlyDone.sid, TENANT, SECRET);
  const slid = await slideSession({ session: nearSession, user: { ...user, roles: user.roles }, actor: {} }, context, now);
  assert.match(slid, /^sid=/);
  assert.match(slid, /HttpOnly/);
});
