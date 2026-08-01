-- Process 25.7 idempotency guards.
-- Business payload stays on canonical documents; these expression indexes only prevent
-- duplicate operational documents during retries/concurrent clicks.

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_note_daily_batch
ON documents(tenant_id, json_extract(payload_json, '$.delivery_batch_key'))
WHERE doctype='Delivery Note'
  AND docstatus<>2
  AND json_extract(payload_json, '$.delivery_batch_key') IS NOT NULL
  AND json_extract(payload_json, '$.delivery_batch_key')<>'';

CREATE UNIQUE INDEX IF NOT EXISTS uq_debit_note_warranty_claim
ON documents(tenant_id, json_extract(payload_json, '$.warranty_claim'))
WHERE doctype='Debit Note'
  AND docstatus<>2
  AND json_extract(payload_json, '$.warranty_claim') IS NOT NULL
  AND json_extract(payload_json, '$.warranty_claim')<>'';
