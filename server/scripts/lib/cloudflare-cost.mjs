const n = (value, name) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative finite number`);
  return number;
};
const over = (usage, included) => Math.max(0, usage - included);
const money = (value) => Number(value.toFixed(6));

function component(name, usage, included, unitPrice, divisor = 1) {
  const billable = over(usage, included);
  return { name, usage, included, billable, unit_price_usd: unitPrice, cost_usd: money((billable / divisor) * unitPrice) };
}

export function estimateQueueOperations({ messages, average_payload_bytes, average_delivery_attempts = 1 }) {
  const count = n(messages, 'queue messages');
  const payload = n(average_payload_bytes, 'queue average_payload_bytes');
  const attempts = n(average_delivery_attempts, 'queue average_delivery_attempts');
  if (attempts < 1) throw new Error('queue average_delivery_attempts must be >= 1');
  const chunks = Math.max(1, Math.ceil((payload + 100) / 64_000));
  const operationUnitsPerMessage = chunks * (1 + attempts + 1);
  return {
    message_count: count,
    payload_bytes_with_metadata: payload + 100,
    chunks_per_operation: chunks,
    average_delivery_attempts: attempts,
    operation_units_per_message: operationUnitsPerMessage,
    operations: count * operationUnitsPerMessage,
  };
}

export function estimateCloudflareMonthlyCost({ usage = {}, rates }) {
  if (!rates || typeof rates !== 'object') throw new Error('rates are required');
  const mode = usage.workers_mode ?? 'standard';
  const workers = mode === 'workers_for_platforms' ? rates.workers_for_platforms : mode === 'standard' ? rates.workers_standard : null;
  const d1 = rates.d1_paid;
  const queues = rates.queues_paid;
  const kv = rates.kv_paid;
  const r2 = rates.r2_standard;
  if (!workers || !d1 || !queues || !kv || !r2) throw new Error('rates are incomplete or workers_mode is unsupported');

  const lines = [];
  lines.push({ name: `workers_subscription:${mode}`, cost_usd: n(workers.base_monthly_usd, 'workers base monthly') });
  lines.push(component('workers_requests', n(usage.workers_requests, 'workers_requests'), n(workers.requests_included, 'workers requests included'), n(workers.request_overage_per_million_usd, 'workers request price'), 1_000_000));
  lines.push(component('workers_cpu_ms', n(usage.workers_cpu_ms, 'workers_cpu_ms'), n(workers.cpu_ms_included, 'workers cpu included'), n(workers.cpu_overage_per_million_ms_usd, 'workers cpu price'), 1_000_000));
  if (mode === 'workers_for_platforms') {
    lines.push(component('worker_scripts', n(usage.worker_scripts, 'worker_scripts'), n(workers.scripts_included, 'workers scripts included'), n(workers.script_overage_usd, 'workers script price')));
  }

  lines.push(component('d1_rows_read', n(usage.d1_rows_read, 'd1_rows_read'), n(d1.rows_read_included, 'd1 rows read included'), n(d1.rows_read_overage_per_million_usd, 'd1 read price'), 1_000_000));
  lines.push(component('d1_rows_written', n(usage.d1_rows_written, 'd1_rows_written'), n(d1.rows_written_included, 'd1 rows written included'), n(d1.rows_written_overage_per_million_usd, 'd1 write price'), 1_000_000));
  lines.push(component('d1_storage_gb_month', n(usage.d1_storage_gb_month, 'd1_storage_gb_month'), n(d1.storage_gb_month_included, 'd1 storage included'), n(d1.storage_overage_per_gb_month_usd, 'd1 storage price')));

  let queueOperations = n(usage.queue_operations, 'queue_operations');
  let queueDerivation = null;
  if (usage.queue_messages !== undefined) {
    queueDerivation = estimateQueueOperations({
      messages: usage.queue_messages,
      average_payload_bytes: usage.queue_average_payload_bytes ?? 0,
      average_delivery_attempts: usage.queue_average_delivery_attempts ?? 1,
    });
    queueOperations += queueDerivation.operations;
  }
  lines.push(component('queue_operations', queueOperations, n(queues.operations_included, 'queue operations included'), n(queues.operations_overage_per_million_usd, 'queue price'), 1_000_000));

  lines.push(component('kv_reads', n(usage.kv_reads, 'kv_reads'), n(kv.reads_included, 'kv reads included'), n(kv.read_overage_per_million_usd, 'kv read price'), 1_000_000));
  lines.push(component('kv_writes', n(usage.kv_writes, 'kv_writes'), n(kv.writes_included, 'kv writes included'), n(kv.write_overage_per_million_usd, 'kv write price'), 1_000_000));
  lines.push(component('kv_deletes', n(usage.kv_deletes, 'kv_deletes'), n(kv.deletes_included, 'kv deletes included'), n(kv.delete_overage_per_million_usd, 'kv delete price'), 1_000_000));
  lines.push(component('kv_lists', n(usage.kv_lists, 'kv_lists'), n(kv.lists_included, 'kv lists included'), n(kv.list_overage_per_million_usd, 'kv list price'), 1_000_000));
  lines.push(component('kv_storage_gb_month', n(usage.kv_storage_gb_month, 'kv_storage_gb_month'), n(kv.storage_gb_month_included, 'kv storage included'), n(kv.storage_overage_per_gb_month_usd, 'kv storage price')));

  lines.push(component('r2_storage_gb_month', n(usage.r2_storage_gb_month, 'r2_storage_gb_month'), n(r2.storage_gb_month_included, 'r2 storage included'), n(r2.storage_per_gb_month_usd, 'r2 storage price')));
  lines.push(component('r2_class_a_ops', n(usage.r2_class_a_ops, 'r2_class_a_ops'), n(r2.class_a_included, 'r2 class A included'), n(r2.class_a_per_million_usd, 'r2 class A price'), 1_000_000));
  lines.push(component('r2_class_b_ops', n(usage.r2_class_b_ops, 'r2_class_b_ops'), n(r2.class_b_included, 'r2 class B included'), n(r2.class_b_per_million_usd, 'r2 class B price'), 1_000_000));

  const total = money(lines.reduce((sum, line) => sum + line.cost_usd, 0));
  return {
    format: 'forge-cloudflare-cost-projection/v1',
    checked_at: rates.checked_at,
    currency: 'USD',
    workers_mode: mode,
    usage,
    queue_derivation: queueDerivation,
    lines,
    total_monthly_usd: total,
    disclaimer: 'Engineering projection from source-locked public rates; not a customer price or invoice.',
  };
}
