#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact match, found {count}")
    target.write_text(text.replace(old, new), encoding="utf-8")


replace_once(
    "server/packages/auth/src/user-store.ts",
    'import { errors } from "../../core/src/index.js";\n',
    'import { errors } from "../../core/src/index.js";\nimport { D1RbacAdministrationService } from "./rbac-administration.js";\n',
)
replace_once(
    "server/packages/auth/src/user-store.ts",
    '''export class D1UserStore {\n  private readonly db: D1Database | D1DatabaseSession;\n\n  constructor(db: D1Database) {\n    // Authentication must never read a stale replica: a just-revoked session or a\n    // just-changed password has to take effect immediately.\n    this.db = db.withSession?.("first-primary") ?? db;\n  }\n''',
    '''export class D1UserStore {\n  private readonly db: D1Database | D1DatabaseSession;\n  readonly administration: D1RbacAdministrationService;\n\n  constructor(db: D1Database) {\n    // Authentication must never read a stale replica: a just-revoked session or a\n    // just-changed password has to take effect immediately.\n    this.db = db.withSession?.("first-primary") ?? db;\n    this.administration = new D1RbacAdministrationService(db);\n  }\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''function requireMetadataAdmin(context: FrappeRouterContext): void {\n  const { user_id: userId, roles } = context.actor;\n  if (userId === "Administrator" || roles.includes("Administrator") || roles.includes("System Manager")) return;\n  throw errors.permission("System Manager is required to change metadata");\n}\n''',
    '''function requireMetadataAdmin(context: FrappeRouterContext): void {\n  const { user_id: userId, roles } = context.actor;\n  if (userId === "Administrator" || roles.includes("Administrator") || roles.includes("System Manager")) return;\n  throw errors.permission("System Manager is required to change metadata");\n}\n\nfunction rbacAudit(context: FrappeRouterContext, source: string, reason?: string) {\n  return {\n    actorUserId: context.actor.user_id,\n    traceId: context.traceId,\n    source,\n    ...(reason ? { reason } : {}),\n  };\n}\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''  const isDefault = args.bool("is_default", false);\n  const record = await context.access.putUserPermission?.(context.tenantId, {\n    user,\n    allow_doctype: allow,\n    allow_name: forValue,\n    applicable_for_doctype: applicable,\n    is_default: isDefault,\n    hide_descendants: false,\n    created_by: context.actor.user_id,\n    created_at: context.now(),\n  });\n  if (!record) throw errors.validation("User permissions are not writable on this deployment");\n''',
    '''  const isDefault = args.bool("is_default", false);\n  const now = context.now();\n  await context.users.administration.putUserPermission(\n    context.tenantId,\n    {\n      user,\n      allowDoctype: allow,\n      allowName: forValue,\n      ...(applicable ? { applicableForDoctype: applicable } : {}),\n      isDefault,\n      hideDescendants: false,\n      createdBy: context.actor.user_id,\n    },\n    rbacAudit(context, "metaforge.api.add_user_permission", args.text("reason")),\n    now,\n  );\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''  if (!context.access.deleteUserPermission) {\n    throw errors.validation("User permissions are not writable on this deployment");\n  }\n  await context.access.deleteUserPermission(\n    context.tenantId,\n    identity.user,\n    identity.allow,\n    identity.forValue,\n    identity.applicableFor ?? "",\n  );\n  return { id: userPermissionIdentity(identity), removed: true };\n''',
    '''  const removed = await context.users.administration.removeUserPermission(\n    context.tenantId,\n    {\n      user: identity.user,\n      allowDoctype: identity.allow,\n      allowName: identity.forValue,\n      ...(identity.applicableFor ? { applicableForDoctype: identity.applicableFor } : {}),\n    },\n    rbacAudit(context, "metaforge.api.remove_user_permission", args.text("reason")),\n    context.now(),\n  );\n  return { id: userPermissionIdentity(identity), removed };\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''  const roles = args.array<string>("roles") ?? [];\n  const applied = await context.users.setRoles(context.tenantId, user, roles.map((role) => String(role)), context.now());\n  return { user, roles: applied };\n''',
    '''  const roles = (args.array<string>("roles") ?? []).map((role) => String(role));\n  const applied = await context.users.administration.replaceRoles(\n    context.tenantId,\n    user,\n    roles,\n    rbacAudit(context, "metaforge.api.set_user_roles", args.text("reason")),\n    context.now(),\n  );\n  return { user, roles: applied };\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''  const now = context.now();\n  await context.users.upsert(context.tenantId, {\n    userId: user,\n    fullName: args.text("full_name") ?? user,\n    email: args.text("email") ?? (user.includes("@") ? user : ""),\n    enabled: args.bool("enabled", true),\n    userType: "System User",\n    passwordHash: await hashPassword(password),\n  }, now);\n\n  const roles = (args.array<string>("roles") ?? []).map((role) => String(role));\n  const applied = roles.length ? await context.users.setRoles(context.tenantId, user, roles, now) : [];\n  return { user, roles: applied as unknown as JsonValue, created: true };\n''',
    '''  const now = context.now();\n  const roles = (args.array<string>("roles") ?? []).map((role) => String(role));\n  const applied = await context.users.administration.createUserWithRoles(\n    context.tenantId,\n    {\n      userId: user,\n      fullName: args.text("full_name") ?? user,\n      email: args.text("email") ?? (user.includes("@") ? user : ""),\n      enabled: args.bool("enabled", true),\n      userType: "System User",\n      passwordHash: await hashPassword(password),\n    },\n    roles,\n    rbacAudit(context, "metaforge.api.create_user", args.text("reason")),\n    now,\n  );\n  return { user, roles: applied as unknown as JsonValue, created: true };\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''  if (user === context.actor.user_id && !enabled) {\n    throw errors.validation("Không tự khoá tài khoản của chính mình — sẽ không còn ai mở lại được.");\n  }\n  await context.users.setEnabled(context.tenantId, user, enabled, context.now());\n  return { user, enabled };\n''',
    '''  await context.users.administration.setUserEnabled(\n    context.tenantId,\n    user,\n    enabled,\n    rbacAudit(context, "metaforge.api.set_user_enabled", args.text("reason")),\n    context.now(),\n  );\n  return { user, enabled };\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''async function logoutOtherSessions(context: FrappeRouterContext): Promise<JsonObject> {\n  const epoch = await context.users.bumpSessionEpoch(context.tenantId, context.actor.user_id, context.now());\n  return { revoked: true, session_epoch: epoch, reauthenticate_required: true };\n}\n''',
    '''async function logoutOtherSessions(context: FrappeRouterContext): Promise<JsonObject> {\n  const epoch = await context.users.administration.revokeSessions(\n    context.tenantId,\n    context.actor.user_id,\n    rbacAudit(context, "metaforge.api.logout_other_sessions"),\n    context.now(),\n  );\n  return { revoked: true, session_epoch: epoch, reauthenticate_required: true };\n}\n''',
)

replace_once(
    "server/packages/frappe-api/src/router.ts",
    '''  const now = context.now();\n  await context.users.upsert(context.tenantId, { userId: targetUser, passwordHash: await hashPassword(newPassword) }, now);\n  // A password change must end every existing session, or a stolen one would keep\n  // working after the owner rotated their credential.\n  const epoch = await context.users.bumpSessionEpoch(context.tenantId, targetUser, now);\n  return { user: targetUser, session_epoch: epoch, reauthenticate_required: true };\n''',
    '''  const now = context.now();\n  const epoch = await context.users.administration.updatePasswordAndRevoke(\n    context.tenantId,\n    targetUser,\n    await hashPassword(newPassword),\n    isSelf ? "password.change" : "password.reset",\n    rbacAudit(context, "frappe.core.doctype.user.user.update_password", args.text("reason")),\n    now,\n  );\n  return { user: targetUser, session_epoch: epoch, reauthenticate_required: true };\n''',
)

replace_once(
    "server/tests/rbac-contract.test.mjs",
    '''function routeFixture() {\n  const permissions = [];\n  const permissionCalls = [];\n''',
    '''function routeFixture() {\n  const permissions = [];\n  const permissionCalls = [];\n  const administrationCalls = [];\n''',
)

replace_once(
    "server/tests/rbac-contract.test.mjs",
    '''    users: userStore(),\n''',
    '''    users: {\n      ...userStore(),\n      administration: {\n        async createUserWithRoles(tenantId, input, roles, auditContext, now) {\n          administrationCalls.push({ action: "createUserWithRoles", tenantId, input, roles, auditContext, now });\n          return [...new Set(roles)].sort();\n        },\n        async replaceRoles(tenantId, user, roles, auditContext, now) {\n          administrationCalls.push({ action: "replaceRoles", tenantId, user, roles, auditContext, now });\n          return [...new Set(roles)].sort();\n        },\n        async setUserEnabled(tenantId, user, enabled, auditContext, now) {\n          administrationCalls.push({ action: "setUserEnabled", tenantId, user, enabled, auditContext, now });\n        },\n        async revokeSessions(tenantId, user, auditContext, now) {\n          administrationCalls.push({ action: "revokeSessions", tenantId, user, auditContext, now });\n          return 1;\n        },\n        async updatePasswordAndRevoke(tenantId, user, passwordHash, eventType, auditContext, now) {\n          administrationCalls.push({ action: "updatePasswordAndRevoke", tenantId, user, passwordHash, eventType, auditContext, now });\n          return 1;\n        },\n        async putUserPermission(tenantId, input, auditContext, now) {\n          administrationCalls.push({ action: "putUserPermission", tenantId, input, auditContext, now });\n          const record = {\n            user: input.user,\n            allow_doctype: input.allowDoctype,\n            allow_name: input.allowName,\n            applicable_for_doctype: input.applicableForDoctype ?? "",\n            is_default: input.isDefault,\n            hide_descendants: input.hideDescendants,\n            created_by: input.createdBy,\n            created_at: now,\n          };\n          const index = permissions.findIndex((current) =>\n            current.user === record.user\n            && current.allow_doctype === record.allow_doctype\n            && current.allow_name === record.allow_name\n            && current.applicable_for_doctype === record.applicable_for_doctype);\n          if (index >= 0) permissions[index] = record;\n          else permissions.push(record);\n        },\n        async removeUserPermission(tenantId, input, auditContext, now) {\n          administrationCalls.push({ action: "removeUserPermission", tenantId, input, auditContext, now });\n          const index = permissions.findIndex((record) =>\n            record.user === input.user\n            && record.allow_doctype === input.allowDoctype\n            && record.allow_name === input.allowName\n            && record.applicable_for_doctype === (input.applicableForDoctype ?? ""));\n          if (index < 0) return false;\n          permissions.splice(index, 1);\n          return true;\n        },\n      },\n    },\n''',
)

replace_once(
    "server/tests/rbac-contract.test.mjs",
    '''  return { context, permissionCalls, permissions };\n''',
    '''  return { context, permissionCalls, permissions, administrationCalls };\n''',
)

contract_test = '''\n\ntest("admin account mutations use the atomic administration service with audit context", async () => {\n  const fixture = routeFixture();\n  const created = await callMethod("metaforge.api.create_user", {\n    user: "new.user@example.com",\n    password: "strong-password",\n    roles: JSON.stringify(["Stock User"]),\n  }, fixture.context, "POST");\n  assert.equal(created.response.status, 200);\n\n  await callMethod("metaforge.api.set_user_roles", {\n    user: USER.user_id,\n    roles: JSON.stringify(["Stock Manager"]),\n    reason: "promotion",\n  }, fixture.context, "POST");\n  await callMethod("metaforge.api.set_user_enabled", {\n    user: USER.user_id,\n    enabled: "0",\n  }, fixture.context, "POST");\n  await callMethod("metaforge.api.logout_other_sessions", {}, fixture.context, "POST");\n  await callMethod("frappe.core.doctype.user.user.update_password", {\n    user: USER.user_id,\n    new_password: "new-strong-password",\n  }, fixture.context, "POST");\n\n  assert.deepEqual(\n    fixture.administrationCalls.map((entry) => entry.action),\n    ["createUserWithRoles", "replaceRoles", "setUserEnabled", "revokeSessions", "updatePasswordAndRevoke"],\n  );\n  for (const entry of fixture.administrationCalls) {\n    assert.equal(entry.tenantId, "tenant-a");\n    assert.equal(entry.auditContext.actorUserId, ADMIN.user_id);\n    assert.equal(entry.auditContext.traceId, "trace-rbac");\n  }\n  const serialized = JSON.stringify(fixture.administrationCalls);\n  assert.equal(serialized.includes("strong-password"), false);\n  assert.equal(serialized.includes("new-strong-password"), false);\n  assert.equal(fixture.administrationCalls.at(-1).eventType, "password.reset");\n});\n\ntest("a non-admin cannot call account administration endpoints", async () => {\n  const fixture = routeFixture();\n  fixture.context.actor = USER;\n  const result = await callMethod("metaforge.api.create_user", {\n    user: "blocked@example.com",\n    password: "strong-password",\n    roles: JSON.stringify(["Stock User"]),\n  }, fixture.context, "POST");\n  assert.equal(result.response.status, 403);\n  assert.equal(fixture.administrationCalls.length, 0);\n});\n'''
path = ROOT / "server/tests/rbac-contract.test.mjs"
text = path.read_text(encoding="utf-8")
if contract_test.strip() in text:
    raise SystemExit("contract tests already appended")
path.write_text(text.rstrip() + contract_test, encoding="utf-8")

print("RBAC Slice B router wiring patch applied")
