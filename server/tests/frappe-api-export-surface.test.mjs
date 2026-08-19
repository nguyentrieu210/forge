import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../dist/packages/frappe-api/src/index.js";
import * as router from "../dist/packages/frappe-api/src/router.js";

/**
 * Cắt nhỏ một file lớn hay làm rơi mất bề mặt export của nó.
 *
 * Chuyện đã xảy ra hai lần trong đúng đợt refactor này: `deriveLinearSalesBasis` rời
 * `alumdoor-worker/index.ts`, rồi `hasRequiredNavRole` và `resolveContextDimensionValue`
 * rời `router.ts` — mỗi lần TypeScript vẫn xanh, chỉ có test import từ `dist` mới đỏ, và
 * đỏ ở dạng khó đọc (`does not provide an export named ...`).
 *
 * Danh sách dưới đây là những gì bên ngoài đang thật sự dùng. Dời hàm đi đâu cũng được,
 * miễn là nó vẫn ra khỏi cùng cửa — và nếu cố ý bỏ một cái, phải sửa danh sách này trước,
 * tức là phải nhìn thấy mình đang phá hợp đồng gì.
 */

const CONSUMED = [
  "PASSWORD_ITERATIONS", "RECENT_SECURITY_AUTH_MAX_AGE_SECONDS", "assertCsrf",
  "assertExactUserPermission", "assertModifiedMatches", "assertRecentSecurityAuthentication",
  "buildCommand", "classifySecurityAuditEvent", "clearedSessionCookie", "establishSession",
  "evaluatePermissionCapabilities", "faultResponse", "fromFrappeDatetime", "fromFrappeDoc",
  "hasRequiredNavRole", "hashPassword", "listSecurityAlerts", "maskedFieldNames",
  "methodResponse", "mintSession", "parsePasswordHash", "parseUserPermissionIdentity",
  "readFrappeArgs", "readSid", "requiresRecentSecurityAuthentication",
  "requiresRecentSecurityAuthenticationForResource", "resolveAccessInspectionActor",
  "resolveContextDimensionValue", "routeFrappeApi", "routeFrappeAuth",
  "routeSessionManagementApi", "slideSession", "stripServerOwnedFields", "toFrappeDatetime",
  "toFrappeDoc", "toFrappeDocType", "toFrappeMetaBundle", "toFrappeModified",
  "toKernelFilters", "toKernelSearch", "toKernelSort", "userPermissionIdentity",
  "verifyPassword", "verifySession",
];

// Hai thứ này được import THẲNG từ `router.js`, không qua barrel — nên phải còn ở đó.
const FROM_ROUTER = ["routeFrappeApi", "isFrappePath", "hasRequiredNavRole", "resolveContextDimensionValue"];

test("the frappe-api barrel still exports everything its consumers import", () => {
  const missing = CONSUMED.filter((name) => api[name] === undefined);
  assert.deepEqual(
    missing,
    [],
    "tách module xong mà quên re-export: bên ngoài đang import những tên này từ @cloudforge/frappe-api.",
  );
});

test("router.js keeps the surface imported straight from it", () => {
  const missing = FROM_ROUTER.filter((name) => router[name] === undefined);
  assert.deepEqual(missing, [], "có test/module import thẳng từ router.js — dời hàm thì nhớ re-export.");
});
