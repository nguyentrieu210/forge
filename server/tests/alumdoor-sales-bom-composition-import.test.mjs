import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSalesBomCompositionTemplates,
  isFullSetCompositionParent,
  salesBomCompositionSignature,
} from '../scripts/lib/alumdoor-sales-bom-composition.mjs';

test('composition import keeps only full-set parents and every child row', () => {
  const templates = buildSalesBomCompositionTemplates({
    format: 'alumdoor-canonical-bom-importable/v2',
    source: { workbook: 'Alumdoor source.xlsx' },
    boms: [
      { item: 'TP-THUONG', lines: [{ item_code: 'IGNORED' }] },
      {
        item: 'TP-CUA-TRỌN BỘ',
        lines: [
          { item_code: 'NVL-RAY', qty: 99, stock_uom: 'Kg' },
          { item_code: 'NVL-RAY', qty: null, stock_uom: 'Kg' },
          { item_code: 'NVL-TRUC', quantity_formula_json: '{"base":{"kind":"FIELD"}}' },
        ],
      },
    ],
  });

  assert.equal(templates.length, 1);
  assert.equal(templates[0].item_code, 'TP-CUA-TRỌN BỘ');
  assert.equal(templates[0].source_status, 'COMPOSITION');
  assert.deepEqual(templates[0].component_rules.map((row) => [row.component_key, row.item_code]), [
    ['ROW-001', 'NVL-RAY'],
    ['ROW-002', 'NVL-RAY'],
    ['ROW-003', 'NVL-TRUC'],
  ]);
  assert.equal(templates[0].component_rules.some((row) => 'stock_uom' in row), false);
  assert.deepEqual(JSON.parse(templates[0].required_component_keys_json), ['ROW-001', 'ROW-002', 'ROW-003']);
});

test('composition signature ignores production formulas but detects child membership changes', () => {
  const source = {
    format: 'alumdoor-canonical-bom-importable/v2',
    boms: [{ item: 'TP-CUA-TRONBO', lines: [{ item_code: 'NVL-A', qty: 1 }] }],
  };
  const first = buildSalesBomCompositionTemplates(source)[0];
  const sameMembership = buildSalesBomCompositionTemplates({
    ...source,
    boms: [{ item: 'TP-CUA-TRONBO', lines: [{ item_code: 'NVL-A', qty: 999, stock_uom: 'Kg' }] }],
  })[0];
  const changedMembership = buildSalesBomCompositionTemplates({
    ...source,
    boms: [{ item: 'TP-CUA-TRONBO', lines: [{ item_code: 'NVL-B', qty: 1 }] }],
  })[0];

  assert.equal(salesBomCompositionSignature(first), salesBomCompositionSignature(sameMembership));
  assert.notEqual(salesBomCompositionSignature(first), salesBomCompositionSignature(changedMembership));
});

test('full-set detection accepts Vietnamese and ASCII spellings only', () => {
  assert.equal(isFullSetCompositionParent('TP-CUA-TRONBO_3-4m²'), true);
  assert.equal(isFullSetCompositionParent('TP-CỬA-TRỌN BỘ'), true);
  assert.equal(isFullSetCompositionParent('TP-CỬA-LÁ'), false);
});
