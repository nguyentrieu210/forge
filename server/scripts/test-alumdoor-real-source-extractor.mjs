#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  parseAlumdoorIndexedMarkdownRows,
  parseAlumdoorSourceIndex,
  readAlumdoorCell,
} from "./lib/alumdoor-source-markdown.mjs";
import {
  resolveAlumdoorRealSellableGroup,
  resolveAlumdoorRealStockGroup,
} from "./lib/alumdoor-real-source-group.mjs";

const rows = parseAlumdoorIndexedMarkdownRows(`
# Sheet: ĐM

## Row 2
- [0] ĐỨC
- [1] 1
- [2] ĐỨC AL501N VK
- [3] TP-TD-AL501N VK
- [4] ĐỨC AL501N VK
- [6] M2
- [7] 1

## Row 3
- [3] NVL-TD-AL501N VK
- [4] AL501N VK
- [6] KG/M2
`);
assert.equal(rows.length, 2);
assert.equal(rows[0].source_row, 2);
assert.equal(readAlumdoorCell(rows[0], 3), "TP-TD-AL501N VK");
assert.equal(parseAlumdoorSourceIndex(readAlumdoorCell(rows[0], 1)), 1);
assert.equal(parseAlumdoorSourceIndex(readAlumdoorCell(rows[1], 1)), null);

assert.equal(resolveAlumdoorRealSellableGroup({
  category: "ĐỨC",
  item_code: "TP-TD-AL501N VK",
  item_name: "ĐỨC AL501N VK",
  source_uom: "M2",
}), "Cửa CN Đức");
assert.equal(resolveAlumdoorRealSellableGroup({
  category: "ÚC",
  item_code: "TP-UC KT 4D XN-VK",
  item_name: "CỬA ÚC 4D",
  source_uom: "M2",
}), "Cửa tấm liền Úc");
assert.equal(resolveAlumdoorRealSellableGroup({
  category: "MOTOR",
  item_code: "TP-MT-ALUMAX600KG",
  item_name: "MOTOR ALUMAX 600KG",
  source_uom: "CÁI",
}), "Motor");
assert.equal(resolveAlumdoorRealSellableGroup({
  category: "MOTOR",
  item_code: "TP_UPS-E800i",
  item_name: "BÌNH LƯU ĐIỆN E800I",
  source_uom: "CÁI",
}), "Bình lưu điện");
assert.equal(resolveAlumdoorRealStockGroup({
  category: "ĐỨC",
  item_code: "NVL-AL752-GS",
  item_name: "AL752",
}), "Nan/lá cửa");
assert.equal(resolveAlumdoorRealStockGroup({
  category: "ĐỨC",
  item_code: "NVL-TR114-1.8",
  item_name: "TRỤC 114 1.8LY",
}), "Ray và trục");
assert.equal(resolveAlumdoorRealStockGroup({
  category: "MOTOR",
  item_code: "NVL-THAN-MOTOR-YH500",
  item_name: "THÂN MOTOR YH 500",
}), "Linh kiện motor");

console.log("ALUMDOOR_REAL_SOURCE_EXTRACTOR_TEST_PASS");
