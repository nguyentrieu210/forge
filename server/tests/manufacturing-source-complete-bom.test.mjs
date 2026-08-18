import test from 'node:test';
import assert from 'node:assert/strict';
import { createO2CControllerRegistry } from '../dist/packages/clouderp-selling/src/index.js';
import { registerErpCoreControllers } from '../dist/packages/clouderp-core/src/index.js';
import { registerStockControllers } from '../dist/packages/clouderp-stock/src/index.js';
import { registerErpNextCoreControllers } from '../dist/packages/clouderp-erpnext/src/index.js';
import { DocumentKernel, InMemoryMutationStore } from '../dist/packages/document-kernel/src/index.js';
import { mutate } from './helpers.mjs';

const NOW = '2026-08-18T05:20:00.000Z';

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company:'Demo', customer:'CUST-1', currency:'USD', items:[], warehouses:['Raw'], accounts:[] });
  for (const code of ['RAW-1','RAW-2']) {
    store.seedMaster('Item', code, 'demo', {
      item_nature:'Hàng tồn kho', material_stage:'Nguyên vật liệu', supply_type:'Mua ngoài',
      is_stock_item:1, include_item_in_manufacturing:1, stock_uom:'Nos', valuation_method:'FIFO', standard_rate:'1.00',
    });
  }
  store.seedMaster('Item', 'FG', 'demo', {
    item_nature:'Hàng tồn kho', material_stage:'Thành phẩm', supply_type:'Tự sản xuất',
    is_stock_item:1, include_item_in_manufacturing:1, stock_uom:'Nos', valuation_method:'FIFO', standard_rate:'10.00',
  });
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel:new DocumentKernel(registry, store, undefined, () => NOW) };
}

test('source-complete Draft BOM retains a real component with unresolved qty/UOM without inventing values', async () => {
  const { store, kernel } = setup();
  const document = {
    company:'Demo', item:'FG', quantity:'1', bom_status:'Draft', output_uom:'Nos',
    items:[
      { row_id:'SRC-10', item_code:'RAW-1', qty:'2', uom:'Nos', source_value_status:'RESOLVED', source_row:10, source_sequence:1 },
      { row_id:'SRC-11', item_code:'RAW-2', qty:null, uom:null, conversion_factor:null, source_value_status:'PENDING', source_pending_reason:'missing_conversion', source_row:11, source_sequence:2 },
    ],
  };
  await mutate(kernel, { doctype:'Bill of Materials', name:'BOM-PENDING', document, commandId:'bom-pending-create', action:'create', expectedVersion:null });
  const bom = await store.getDocument('demo', 'Bill of Materials', 'BOM-PENDING');
  assert.equal(bom.docstatus, 0);
  assert.equal(bom.data.bom_status, 'Draft');
  assert.equal(bom.data.items.length, 2);
  assert.equal(bom.data.items[1].item_code, 'RAW-2');
  assert.equal(bom.data.items[1].qty, null);
  assert.equal(bom.data.items[1].uom, null);
  assert.equal(bom.data.items[1].conversion_factor, null);
  assert.equal(bom.data.items[1].source_value_status, 'PENDING');
  assert.equal(bom.data.items[1].source_pending_reason, 'missing_conversion');

  await assert.rejects(
    mutate(kernel, { doctype:'Bill of Materials', name:'BOM-PENDING', document:{...document,bom_status:'Active'}, commandId:'bom-pending-submit', action:'submit', expectedVersion:1 }),
    /source-pending component values remain/i,
  );
});
