import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICING_MATRIX_SOURCE,
  commitItemPriceMatrix,
  createPriceList,
  readItemPriceMatrix,
} from '../dist/packages/clouderp-pricing/src/matrix.js';
import { CloudForgeError, errors } from '../dist/packages/core/src/index.js';

const actor = { user_id: 'u1', roles: ['Sales Master Manager'] };
const clone = (value) => structuredClone(value);
const key = (tenant, doctype, name) => `${tenant}|${doctype}|${name}`;

function record(name, data, version = 1) {
  return { name, version, modifiedAt: `2026-08-03T00:00:0${version}Z`, data: clone(data) };
}

function authority(seed = [], options = {}) {
  const rows = new Map();
  for (const [tenant, doctype, name, data, version = 1] of seed) rows.set(key(tenant, doctype, name), record(name, data, version));
  const denied = new Set(options.denied ?? []);
  const receipts = new Map();
  const mutationCalls = [];
  let failOnceDoctype = options.failOnceDoctype ?? '';

  const findRows = (tenant, doctype) => [...rows.entries()]
    .filter(([entryKey]) => entryKey.startsWith(`${tenant}|${doctype}|`))
    .map(([, value]) => clone(value));

  const context = {
    tenantId: options.tenantId ?? 'tenant-a',
    actor,
    records: {
      async get({ tenantId, doctype, name }) {
        const found = rows.get(key(tenantId, doctype, name));
        return found ? clone(found) : null;
      },
      async list({ tenantId, doctype, filters = {}, search, limit, cursor }) {
        let result = findRows(tenantId, doctype);
        result = result.filter((entry) => Object.entries(filters).every(([field, expected]) => entry.data[field] === expected));
        if (search) {
          const query = String(search).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          result = result.filter((entry) => JSON.stringify(entry.data).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query) || entry.name.toLowerCase().includes(query));
        }
        result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        const start = cursor ? Number(cursor) : 0;
        const sliced = result.slice(start, start + limit);
        const next = start + limit < result.length ? String(start + limit) : undefined;
        return { rows: sliced, ...(next ? { nextCursor: next } : {}) };
      },
    },
    permissions: {
      async assert({ doctype, action }) {
        if (denied.has(`${doctype}:${action}`)) throw errors.permission(`${doctype} ${action} denied`);
      },
      async can({ doctype, action }) {
        return !denied.has(`${doctype}:${action}`);
      },
    },
    mutations: {
      async create(input) {
        const fingerprint = JSON.stringify({ op: 'create', doctype: input.doctype, document: input.document });
        const prior = receipts.get(input.idempotencyKey);
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw errors.idempotency();
          return { record: clone(prior.record), replayed: true };
        }
        if (failOnceDoctype && input.doctype === failOnceDoctype) {
          failOnceDoctype = '';
          throw new CloudForgeError('INJECTED_FAILURE', 'injected mutation failure', 503, true);
        }
        let name;
        if (input.doctype === 'Item Price') name = `${input.document.price_list}:${input.document.item_code}:${input.document.uom}`;
        else if (input.doctype === 'Price List') name = String(input.document.price_list_name);
        else throw new Error(`fake create naming missing for ${input.doctype}`);
        const storageKey = key(input.tenantId, input.doctype, name);
        if (rows.has(storageKey)) throw errors.exists(`${input.doctype} ${name} exists`);
        const next = record(name, input.document, 1);
        rows.set(storageKey, clone(next));
        receipts.set(input.idempotencyKey, { fingerprint, record: clone(next) });
        mutationCalls.push(input.idempotencyKey);
        return { record: clone(next) };
      },
      async update(input) {
        const fingerprint = JSON.stringify({ op: 'update', doctype: input.doctype, name: input.name, expectedVersion: input.expectedVersion, patch: input.patch });
        const prior = receipts.get(input.idempotencyKey);
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw errors.idempotency();
          return { record: clone(prior.record), replayed: true };
        }
        if (failOnceDoctype && input.doctype === failOnceDoctype) {
          failOnceDoctype = '';
          throw new CloudForgeError('INJECTED_FAILURE', 'injected mutation failure', 503, true);
        }
        const storageKey = key(input.tenantId, input.doctype, input.name);
        const current = rows.get(storageKey);
        if (!current) throw errors.notFound(`${input.doctype} ${input.name} missing`);
        if (current.version !== input.expectedVersion) throw errors.version(current.version);
        const next = {
          name: current.name,
          version: current.version + 1,
          modifiedAt: `2026-08-03T00:01:${String(current.version + 1).padStart(2, '0')}Z`,
          data: { ...clone(current.data), ...clone(input.patch) },
        };
        rows.set(storageKey, clone(next));
        receipts.set(input.idempotencyKey, { fingerprint, record: clone(next) });
        mutationCalls.push(input.idempotencyKey);
        return { record: clone(next) };
      },
    },
  };
  return { context, rows, mutationCalls };
}

function baseSeed() {
  return [
    ['tenant-a', 'Currency', 'VND', { currency_scale: 0 }],
    ['tenant-a', 'Currency', 'USD', { currency_scale: 2 }],
    ['tenant-a', 'UOM', 'Cái', { uom_name: 'Cái', disabled: 0 }],
    ['tenant-a', 'UOM', 'Thùng', { uom_name: 'Thùng', disabled: 0 }],
    ['tenant-a', 'UOM', 'Kiện', { uom_name: 'Kiện', disabled: 0 }],
    ['tenant-a', 'Item Group', 'Nhôm', { item_group_name: 'Nhôm', is_group: 0 }],
    ['tenant-a', 'Item', 'ITEM-1', {
      item_name: 'Thanh nhôm', item_group: 'Nhôm', stock_uom: 'Cái', default_sales_uom: 'Thùng', default_purchase_uom: 'Thùng',
      uom_conversions: [{ uom: 'Thùng', conversion_factor: 10 }], disabled: 0,
    }, 4],
    ['tenant-a', 'Price List', 'BÁN LẺ', { price_list_name: 'Bán lẻ', currency: 'VND', effective_date: '2026-08-01', disabled: 0 }],
    ['tenant-a', 'Price List', 'USD', { price_list_name: 'USD', currency: 'USD', effective_date: '2026-08-01', disabled: 0 }],
    ['tenant-a', 'Price List', 'CŨ', { price_list_name: 'Cũ', currency: 'VND', effective_date: '2025-01-01', disabled: 1 }],
    ['tenant-a', 'Item Price', 'IP-THUNG', { item_code: 'ITEM-1', price_list: 'BÁN LẺ', uom: 'Thùng', currency: 'VND', rate: 1000000, disabled: 0 }, 7],
  ];
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof CloudForgeError && error.code === code);
}

test('read projection is permission-aware, bounded, sparse and returns OCC/capabilities', async () => {
  const seed = baseSeed();
  for (let index = 2; index <= 205; index += 1) seed.push(['tenant-a', 'Item', `ITEM-${index}`, { item_name: `Thanh ${index}`, item_group: 'Nhôm', stock_uom: 'Cái', disabled: 0 }]);
  const { context } = authority(seed, { denied: ['Price List:create'] });
  const result = await readItemPriceMatrix(context, { itemCode: 'ITEM-1', itemSearch: 'Thanh', itemLimit: 200 });
  assert.equal(result.source, PRICING_MATRIX_SOURCE);
  assert.equal(result.navigation.items.length, 200);
  assert.equal(result.navigation.next_cursor, '200');
  assert.equal(result.cells.length, 1);
  assert.equal(result.cells[0].name, 'IP-THUNG');
  assert.equal(result.occ.item_version, 4);
  assert.equal(result.occ.item_price_versions['IP-THUNG'], 7);
  assert.equal(result.capabilities.commit, true);
  assert.equal(result.capabilities.create_price_list, false);
  assert.deepEqual(result.configured_uoms.map((row) => row.uom), ['Cái', 'Thùng']);
});

test('read fails closed when any required projection permission is missing', async () => {
  const { context } = authority(baseSeed(), { denied: ['Item Price:read'] });
  await rejectsCode(readItemPriceMatrix(context, { itemCode: 'ITEM-1' }), 'PERMISSION_DENIED');
});

test('trusted tenant context prevents cross-tenant reads', async () => {
  const other = baseSeed().map(([, doctype, name, data, version]) => ['tenant-b', doctype, name, data, version]);
  const { context } = authority(other, { tenantId: 'tenant-a' });
  await rejectsCode(readItemPriceMatrix(context, { itemCode: 'ITEM-1' }), 'DOCUMENT_NOT_FOUND');
});

test('commit rejects stale Item OCC before any write', async () => {
  const { context, mutationCalls } = authority(baseSeed());
  await rejectsCode(commitItemPriceMatrix(context, {
    requestId: 'req-stale-item', itemCode: 'ITEM-1', itemVersion: 3,
    upsertUoms: [{ uom: 'Thùng', conversionFactor: 12 }],
  }), 'VERSION_CONFLICT');
  assert.equal(mutationCalls.length, 0);
});

test('commit rejects zero/negative conversions and negative prices', async () => {
  const { context } = authority(baseSeed());
  await rejectsCode(commitItemPriceMatrix(context, {
    requestId: 'req-zero-uom', itemCode: 'ITEM-1', itemVersion: 4,
    upsertUoms: [{ uom: 'Kiện', conversionFactor: 0 }],
  }), 'VALIDATION_ERROR');
  await rejectsCode(commitItemPriceMatrix(context, {
    requestId: 'req-negative-price', itemCode: 'ITEM-1', itemPriceVersions: { 'IP-THUNG': 7 },
    prices: [{ priceList: 'BÁN LẺ', uom: 'Thùng', enabled: true, rate: -1, recordName: 'IP-THUNG' }],
  }), 'VALIDATION_ERROR');
});

test('disabled Price List cannot be enabled through a matrix price cell', async () => {
  const { context } = authority(baseSeed());
  await rejectsCode(commitItemPriceMatrix(context, {
    requestId: 'req-disabled-list', itemCode: 'ITEM-1',
    prices: [{ priceList: 'CŨ', uom: 'Thùng', enabled: true, rate: 1 }],
  }), 'VALIDATION_ERROR');
});

test('one change set can add a UOM and create its price with server-derived currency precision', async () => {
  const { context, rows } = authority(baseSeed());
  const result = await commitItemPriceMatrix(context, {
    requestId: 'req-add-uom-price', itemCode: 'ITEM-1', itemVersion: 4,
    upsertUoms: [{ uom: 'Kiện', conversionFactor: '25.5' }],
    prices: [{ priceList: 'USD', uom: 'Kiện', enabled: true, rate: '12.345' }],
  });
  assert.equal(result.consistency, 'preflight_then_ordered_idempotent');
  assert.deepEqual(result.operations.map((entry) => entry.effect), ['updated', 'created']);
  const item = rows.get(key('tenant-a', 'Item', 'ITEM-1'));
  assert.equal(item.version, 5);
  assert.deepEqual(item.data.uom_conversions, [
    { uom: 'Thùng', conversion_factor: 10 },
    { uom: 'Kiện', conversion_factor: 25.5 },
  ]);
  const price = rows.get(key('tenant-a', 'Item Price', 'USD:ITEM-1:Kiện'));
  assert.equal(price.data.currency, 'USD');
  assert.equal(price.data.rate, '12.35');
});

test('removing a UOM clears defaults and disables affected active Item Prices', async () => {
  const { context, rows } = authority(baseSeed());
  const result = await commitItemPriceMatrix(context, {
    requestId: 'req-remove-uom', itemCode: 'ITEM-1', itemVersion: 4,
    itemPriceVersions: { 'IP-THUNG': 7 }, removeUoms: ['Thùng'],
  });
  assert.deepEqual(result.operations.map((entry) => entry.effect), ['updated', 'updated']);
  const item = rows.get(key('tenant-a', 'Item', 'ITEM-1'));
  assert.deepEqual(item.data.uom_conversions, []);
  assert.equal(item.data.default_sales_uom, '');
  assert.equal(item.data.default_purchase_uom, '');
  assert.equal(rows.get(key('tenant-a', 'Item Price', 'IP-THUNG')).data.disabled, 1);
});

test('existing price update requires exact OCC and updates without creating a duplicate', async () => {
  const { context, rows } = authority(baseSeed());
  await rejectsCode(commitItemPriceMatrix(context, {
    requestId: 'req-stale-price', itemCode: 'ITEM-1', itemPriceVersions: { 'IP-THUNG': 6 },
    prices: [{ priceList: 'BÁN LẺ', uom: 'Thùng', enabled: true, rate: 1250000, recordName: 'IP-THUNG' }],
  }), 'VERSION_CONFLICT');
  const result = await commitItemPriceMatrix(context, {
    requestId: 'req-update-price', itemCode: 'ITEM-1', itemPriceVersions: { 'IP-THUNG': 7 },
    prices: [{ priceList: 'BÁN LẺ', uom: 'Thùng', enabled: true, rate: 1250000, recordName: 'IP-THUNG' }],
  });
  assert.equal(result.operations[0].effect, 'updated');
  assert.equal(rows.get(key('tenant-a', 'Item Price', 'IP-THUNG')).data.rate, '1250000');
  assert.equal([...rows.keys()].filter((entry) => entry.includes('|Item Price|')).length, 1);
});

test('retry after an explicit partial failure continues safely without duplicating already-applied effects', async () => {
  const { context, rows, mutationCalls } = authority(baseSeed(), { failOnceDoctype: 'Item Price' });
  const payload = {
    requestId: 'req-retry', itemCode: 'ITEM-1', itemVersion: 4,
    upsertUoms: [{ uom: 'Kiện', conversionFactor: 5 }],
    prices: [{ priceList: 'USD', uom: 'Kiện', enabled: true, rate: 9.5 }],
  };
  await assert.rejects(commitItemPriceMatrix(context, payload), (error) => {
    assert.equal(error.code, 'PRICING_MATRIX_PARTIAL_FAILURE');
    assert.equal(error.retryable, true);
    assert.equal(error.details.applied_operations.length, 1);
    return true;
  });
  assert.equal(rows.get(key('tenant-a', 'Item', 'ITEM-1')).version, 5);
  const retried = await commitItemPriceMatrix(context, payload);
  assert.equal(retried.operations.length, 1);
  assert.equal(retried.operations[0].effect, 'created');
  assert.equal(rows.get(key('tenant-a', 'Item', 'ITEM-1')).version, 5);
  assert.equal(rows.get(key('tenant-a', 'Item Price', 'USD:ITEM-1:Kiện')).data.rate, '9.50');
  assert.equal(mutationCalls.length, 2);
});

test('replaying the same desired price is a no-op even with the original OCC token', async () => {
  const { context, mutationCalls } = authority(baseSeed());
  const payload = {
    requestId: 'req-idempotent-update', itemCode: 'ITEM-1', itemPriceVersions: { 'IP-THUNG': 7 },
    prices: [{ priceList: 'BÁN LẺ', uom: 'Thùng', enabled: true, rate: 1200000, recordName: 'IP-THUNG' }],
  };
  const first = await commitItemPriceMatrix(context, payload);
  assert.equal(first.operations[0].effect, 'updated');
  const second = await commitItemPriceMatrix(context, payload);
  assert.equal(second.operations[0].effect, 'unchanged');
  assert.equal(mutationCalls.length, 1);
});

test('duplicate active records for one business cell fail instead of creating a second source of truth', async () => {
  const seed = baseSeed();
  seed.push(['tenant-a', 'Item Price', 'IP-THUNG-2', { item_code: 'ITEM-1', price_list: 'BÁN LẺ', uom: 'Thùng', currency: 'VND', rate: 999999, disabled: 0 }, 2]);
  const { context } = authority(seed);
  await rejectsCode(commitItemPriceMatrix(context, {
    requestId: 'req-dup', itemCode: 'ITEM-1', prices: [],
  }), 'VALIDATION_ERROR');
});

test('createPriceList uses caller-selected currency and validates reference without hardcoded VND', async () => {
  const { context, rows } = authority(baseSeed());
  const result = await createPriceList(context, { requestId: 'req-list', name: 'Xuất khẩu', currency: 'USD', effectiveDate: '2026-08-03' });
  assert.equal(result.price_list, 'Xuất khẩu');
  const created = rows.get(key('tenant-a', 'Price List', 'Xuất khẩu'));
  assert.equal(created.data.currency, 'USD');
  assert.equal(created.data.effective_date, '2026-08-03');
});

test('createPriceList retry is served by mutation idempotency before duplicate-name rejection', async () => {
  const { context, mutationCalls } = authority(baseSeed());
  const payload = { requestId: 'req-list-retry', name: 'Đại lý', currency: 'VND', effectiveDate: '2026-08-03' };
  const first = await createPriceList(context, payload);
  const second = await createPriceList(context, payload);
  assert.equal(first.price_list, 'Đại lý');
  assert.equal(second.price_list, 'Đại lý');
  assert.equal(mutationCalls.length, 1);
});
