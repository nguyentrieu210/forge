import test from "node:test";
import assert from "node:assert/strict";
import { asCloudForgeError } from "../dist/packages/core/src/index.js";

test("asCloudForgeError reconstructs a CloudForgeError flattened across a Durable Object RPC boundary", () => {
  // Crossing a DO RPC boundary strips the class identity but keeps own enumerable
  // fields. The prose message does NOT contain the code, so message-matching alone
  // would misclassify these as INTERNAL_ERROR (HTTP 500) instead of 409/422.
  const versionConflict = { name: "CloudForgeError", code: "VERSION_CONFLICT", status: 409, retryable: false, message: "The document changed after it was loaded" };
  assert.equal(asCloudForgeError(versionConflict).code, "VERSION_CONFLICT");
  assert.equal(asCloudForgeError(versionConflict).status, 409);

  const reference = { name: "CloudForgeError", code: "REFERENCE_VALIDATION_FAILED", status: 422, message: "Quantity delivered for ITEM-1 exceeds Sales Order quantity" };
  assert.equal(asCloudForgeError(reference).status, 422);

  const idempotency = { name: "CloudForgeError", code: "IDEMPOTENCY_KEY_REUSED", status: 422, message: "Command ID was reused with a different payload" };
  assert.equal(asCloudForgeError(idempotency).code, "IDEMPOTENCY_KEY_REUSED");

  // A genuine internal error (no structured fields) still falls back to 500 and
  // does not leak its raw message to the client.
  const internal = asCloudForgeError(new Error("sqlite: near \"FROM\": syntax error in tenant table"));
  assert.equal(internal.status, 500);
  assert.equal(internal.code, "INTERNAL_ERROR");
  assert.equal(internal.message, "Internal error");
});
