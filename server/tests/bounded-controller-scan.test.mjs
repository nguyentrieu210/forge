import test from "node:test";
import assert from "node:assert/strict";
import {
  assertControllerDocumentScanCount,
  CONTROLLER_DOCUMENT_SCAN_LIMIT,
} from "../dist/packages/document-kernel/src/index.js";

test("controller scan accepts a complete result at the configured bound", () => {
  assert.doesNotThrow(() => assertControllerDocumentScanCount(
    CONTROLLER_DOCUMENT_SCAN_LIMIT,
    "Stock Reservation",
  ));
});

test("controller scan fails closed instead of silently truncating a larger tenant", () => {
  assert.throws(
    () => assertControllerDocumentScanCount(
      CONTROLLER_DOCUMENT_SCAN_LIMIT + 1,
      "Stock Reservation",
    ),
    (error) => error.code === "DATABASE_ERROR" && /targeted reader/i.test(error.message),
  );
});

test("controller scan rejects invalid count or limit configuration", () => {
  assert.throws(
    () => assertControllerDocumentScanCount(Number.NaN, "Stock Reservation"),
    (error) => error.code === "DATABASE_ERROR",
  );
  assert.throws(
    () => assertControllerDocumentScanCount(1, "Stock Reservation", 0),
    (error) => error.code === "DATABASE_ERROR",
  );
});
