import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCloudflareMonthlyCost, estimateQueueOperations } from '../scripts/lib/cloudflare-cost.mjs';

const rates = {
  checked_at: '2026-08-04',
  workers_standard: { base_monthly_usd: 5, requests_included: 10_000_000, request_overage_per_million_usd: 0.30, cpu_ms_included: 30_000_000, cpu_overage_per_million_ms_usd: 0.02 },
  workers_for_platforms: { base_monthly_usd: 25, requests_included: 20_000_000, request_overage_per_million_usd: 0.30, cpu_ms_included: 60_000_000, cpu_overage_per_million_ms_usd: 0.02, scripts_included: 1000, script_overage_usd: 0.02 },
  d1_paid: { rows_read_included: 25_000_000_000, rows_read_overage_per_million_usd: 0.001, rows_written_included: 50_000_000, rows_written_overage_per_million_usd: 1, storage_gb_month_included: 5, storage_overage_per_gb_month_usd: 0.75 },
  queues_paid: { operations_included: 1_000_000, operations_overage_per_million_usd: 0.40 },
  kv_paid: { reads_included: 10_000_000, read_overage_per_million_usd: 0.50, writes_included: 1_000_000, write_overage_per_million_usd: 5, deletes_included: 1_000_000, delete_overage_per_million_usd: 5, lists_included: 1_000_000, list_overage_per_million_usd: 5, storage_gb_month_included: 1, storage_overage_per_gb_month_usd: 0.50 },
  r2_standard: { storage_gb_month_included: 10, storage_per_gb_month_usd: 0.015, class_a_included: 1_000_000, class_a_per_million_usd: 4.50, class_b_included: 10_000_000, class_b_per_million_usd: 0.36 },
};

test('projection charges only usage above included paid/free allowances', () => {
  const result = estimateCloudflareMonthlyCost({ usage: {
    workers_mode: 'standard', workers_requests: 15_000_000, workers_cpu_ms: 105_000_000,
    d1_rows_read: 30_000_000_000, d1_rows_written: 55_000_000, d1_storage_gb_month: 7,
    queue_operations: 4_000_000,
    kv_reads: 12_000_000, kv_writes: 2_000_000,
    r2_storage_gb_month: 20, r2_class_a_ops: 2_000_000, r2_class_b_ops: 20_000_000,
  }, rates });
  assert.equal(result.total_monthly_usd, 34.95);
});

test('queue operation derivation applies 64KB chunk billing and retries', () => {
  const small = estimateQueueOperations({ messages: 1000, average_payload_bytes: 1000, average_delivery_attempts: 1 });
  assert.equal(small.operations, 3000);
  const large = estimateQueueOperations({ messages: 10, average_payload_bytes: 65_000, average_delivery_attempts: 2 });
  assert.equal(large.chunks_per_operation, 2);
  assert.equal(large.operations, 80);
});

test('workers for platforms adds script overage and its own base plan', () => {
  const result = estimateCloudflareMonthlyCost({ usage: { workers_mode: 'workers_for_platforms', worker_scripts: 1200 }, rates });
  assert.equal(result.total_monthly_usd, 29);
});

test('R2 overage rounds up to provider billing units', () => {
  const result = estimateCloudflareMonthlyCost({ usage: {
    r2_storage_gb_month: 11.1,
    r2_class_a_ops: 1_000_001,
    r2_class_b_ops: 10_000_001,
  }, rates });
  const line = (name) => result.lines.find((entry) => entry.name === name);
  assert.equal(line('r2_storage_gb_month').billable, 2);
  assert.equal(line('r2_class_a_ops').billable, 1_000_000);
  assert.equal(line('r2_class_b_ops').billable, 1_000_000);
});

test('negative usage is rejected', () => {
  assert.throws(() => estimateCloudflareMonthlyCost({ usage: { workers_requests: -1 }, rates }), /non-negative/);
});
