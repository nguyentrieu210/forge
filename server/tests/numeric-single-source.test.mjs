import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { divideRoundedBig, divideRoundedInt, roundTo, safeAddInt } from "../dist/packages/core/src/index.js";

/**
 * Làm tròn và cộng-chặn-tràn phải có đúng MỘT luật trong cả kho.
 *
 * Trước khi có test này, cùng một hàm được chép ra hàng chục nơi: 13 bản `round`,
 * 13 bản `divideRounded`, 26 bản `safeAdd`. Mỗi bản tự đúng với test của riêng nó nên
 * mọi cổng đều xanh, trong khi chúng đã lệch nhau thật:
 *
 *   - `storefront.ts` làm tròn 2 chữ số và KHÔNG cộng EPSILON, 12 bản còn lại 6 chữ số CÓ
 *     cộng — cùng tên `round`, hai kết quả khác nhau ở biên nửa-lên.
 *   - bốn file sản xuất chia bằng `(n + d/2) / d`; với BigInt phép này cắt số âm về 0 thay
 *     vì làm tròn ra xa 0 như `@cloudforge/money`.
 *
 * Test này ghim hai thứ: luật của bản dùng chung, và DANH SÁCH những nơi còn giữ bản riêng.
 * Mọc thêm một bản sao mới ở bất kỳ đâu là đỏ tại đây trước.
 */

const SERVER_ROOT = path.resolve(import.meta.dirname, "..");
const SCANNED = ["packages", "apps", "apps-src"];

// Nơi còn định nghĩa hàm cùng tên, kèm lý do. "adapter" = chỉ bọc lại luật dùng chung,
// giữ nguyên câu chữ lỗi của miền nghiệp vụ. "riêng" = còn luật riêng, chờ quyết định
// (xem docs/REFACTOR-FORGE-20260819.md mục 5).
const LEDGER = {
  round: {
    "packages/frappe-api/src/storefront.ts": "adapter",
  },
  divideRounded: {
    "packages/clouderp-core/src/controllers.ts": "adapter",
    "packages/clouderp-erpnext/src/controllers.ts": "adapter",
    "packages/clouderp-pricing/src/index.ts": "adapter",
    "packages/clouderp-stock/src/valuation.ts": "adapter",
    "packages/money/src/index.ts": "adapter",
    "packages/clouderp-core/src/supplier-policy.ts": "riêng",
    "packages/clouderp-erpnext/src/manufacturing-capacity.ts": "riêng",
    "packages/clouderp-erpnext/src/manufacturing-costing-read.ts": "riêng",
    "packages/clouderp-erpnext/src/manufacturing-lifecycle.ts": "riêng",
    "packages/clouderp-erpnext/src/manufacturing-mrp.ts": "riêng",
    "packages/clouderp-erpnext/src/manufacturing-stock-guard.ts": "riêng",
    "packages/clouderp-erpnext/src/manufacturing-work-order-guard.ts": "riêng",
    "packages/semantic/src/planning.ts": "riêng",
  },
  safeAdd: {
    "packages/clouderp-core/src/procurement-analytics.ts": "adapter",
    "packages/clouderp-core/src/procurement-landed-cost.ts": "adapter",
    "packages/clouderp-core/src/procurement-p2p-controllers.ts": "adapter",
    "packages/clouderp-core/src/procurement-p2p-rollout-controllers.ts": "adapter",
    "packages/clouderp-core/src/supplier-contract-enforcement.ts": "adapter",
    "packages/clouderp-core/src/supplier-policy.ts": "adapter",
    "packages/clouderp-erpnext/src/alumdoor-payroll-entry.ts": "riêng",
    "packages/clouderp-erpnext/src/enterprise-controllers.ts": "adapter",
    "packages/clouderp-erpnext/src/freight-controllers.ts": "adapter",
    "packages/clouderp-erpnext/src/hrm-payroll-rule.ts": "riêng",
    "packages/clouderp-erpnext/src/hrm-workforce-finance-controllers.ts": "riêng",
    "packages/clouderp-erpnext/src/manufacturing-capacity.ts": "adapter",
    "packages/clouderp-erpnext/src/manufacturing-costing-read.ts": "adapter",
    "packages/clouderp-erpnext/src/manufacturing-demand-read.ts": "adapter",
    "packages/clouderp-erpnext/src/manufacturing-genealogy.ts": "adapter",
    "packages/clouderp-erpnext/src/manufacturing-material-progress-row.ts": "adapter",
    "packages/clouderp-erpnext/src/manufacturing-material-status.ts": "adapter",
    "packages/clouderp-erpnext/src/manufacturing-mrp.ts": "adapter",
    "packages/clouderp-erpnext/src/manufacturing-sales-lineage.ts": "adapter",
    "packages/clouderp-erpnext/src/pos-session-hardening.ts": "adapter",
    "packages/clouderp-erpnext/src/suite-controllers.ts": "riêng",
    "packages/clouderp-selling/src/commercial-sales-order-controller.ts": "adapter",
    "packages/clouderp-selling/src/order-commercial-policy.ts": "riêng",
    "packages/clouderp-selling/src/sales-order-downstream.ts": "riêng",
    "packages/clouderp-stock/src/inventory-policy.ts": "riêng",
    "packages/clouderp-stock/src/valuation.ts": "adapter",
  },
};

const CORE_CALL = { round: "roundTo(", divideRounded: "divideRounded", safeAdd: "safeAddInt(" };

function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".ts")) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  for (const top of SCANNED) walk(path.join(SERVER_ROOT, top));
  return files;
}

function definitionsOf(helper) {
  const declaration = new RegExp(`^\\s*(?:export )?function ${helper}\\(`);
  const found = new Map();
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    if (text.split("\n").some((line) => declaration.test(line))) {
      found.set(path.relative(SERVER_ROOT, file).split(path.sep).join("/"), text);
    }
  }
  return found;
}

test("roundTo is half-up and compensates binary representation error", () => {
  assert.equal(roundTo(1.005, 2), 1.01, "1.005 phải lên 1.01, không phải 1.00");
  assert.equal(roundTo(2.5, 0), 3);
  assert.equal(roundTo(-2.5, 0), -2, "Math.round làm tròn về phía +vô cực ở đúng biên nửa");
  assert.equal(roundTo(1 / 3), 0.333333);
  assert.equal(roundTo(1234.5678, 2), 1234.57);
});

test("divideRounded rounds half away from zero on both int and bigint paths", () => {
  assert.equal(divideRoundedInt(5, 2), 3);
  assert.equal(divideRoundedInt(-5, 2), -3, "số âm phải làm tròn RA XA 0, không cắt về 0");
  assert.equal(divideRoundedInt(4, 2), 2);
  assert.equal(divideRoundedBig(5n, 2n), 3n);
  assert.equal(divideRoundedBig(-5n, 2n), -3n);
  assert.equal(divideRoundedBig(-3n, 4n), -1n, "-0.75 phải ra -1");
  // Hai đường phải cho cùng kết quả trên mọi cặp — đây chính là chỗ các bản sao lệch nhau.
  for (const numerator of [-9, -5, -3, -1, 0, 1, 3, 5, 9, 1000003]) {
    for (const denominator of [1, 2, 3, 4, 7, 1000]) {
      assert.equal(
        BigInt(divideRoundedInt(numerator, denominator)),
        divideRoundedBig(BigInt(numerator), BigInt(denominator)),
        `int và bigint lệch nhau tại ${numerator}/${denominator}`,
      );
    }
  }
});

test("guards reject unusable divisors and integer overflow with the caller's message", () => {
  assert.throws(() => divideRoundedInt(1, 0), /Arithmetic exceeds safe integer bounds/);
  assert.throws(() => divideRoundedInt(1, -2, "Pricing arithmetic exceeds safe integer bounds"), /Pricing/);
  assert.throws(() => divideRoundedBig(1n, 0n), /Decimal divisor must be positive/);
  assert.throws(() => safeAddInt(Number.MAX_SAFE_INTEGER, 2, "Tổng tiền vượt dải"), /Tổng tiền vượt dải/);
  assert.equal(safeAddInt(2, 3), 5);
});

test("no new private copy of a shared numeric rule appears anywhere in the server", () => {
  for (const [helper, ledger] of Object.entries(LEDGER)) {
    const found = definitionsOf(helper);
    const unexpected = [...found.keys()].filter((file) => !(file in ledger));
    assert.deepEqual(
      unexpected,
      [],
      `${helper}(): bản sao mới. Gọi hàm dùng chung của @cloudforge/core thay vì viết lại luật.`,
    );
    const vanished = Object.keys(ledger).filter((file) => !found.has(file));
    assert.deepEqual(vanished, [], `${helper}(): sổ còn ghi nơi này nhưng file không còn định nghĩa — cập nhật sổ.`);
    for (const [file, kind] of Object.entries(ledger)) {
      if (kind !== "adapter") continue;
      assert.ok(
        found.get(file).includes(CORE_CALL[helper]),
        `${file}: ghi là adapter thì phải gọi về luật dùng chung của @cloudforge/core.`,
      );
    }
  }
});
