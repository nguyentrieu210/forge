-- R8-B reusable customer-credit allocation.
--
-- Payment Allocation already consumes negative Payment Entry advances through the
-- canonical Payment Ledger. Customer Credit Notes are the same signed-source model:
-- a negative Receivable balance against the Credit Note can move only toward zero.
-- Migration 0155 owns the Credit Note source guard; migration 0031 owns the target
-- invoice guard. This migration exposes that authority in Payment Allocation metadata
-- without creating a wallet or shadow balance.

UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.fields[' || (
        SELECT key FROM json_each(metadata_json,'$.fields')
        WHERE json_extract(value,'$.fieldname')='source_payment_entry' LIMIT 1
      ) || '].required',
      json('false')
    ),
    revision=revision+1,
    modified_by='migration-0156',
    modified_at='2026-10-02T00:00:00.000Z'
WHERE doctype='Payment Allocation'
  AND EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='source_payment_entry'
  );

UPDATE doctype_definitions
SET metadata_json=json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"source_credit_note","label":"Source Customer Credit","fieldtype":"Link","options":"Credit Note","in_list_view":true,"search_index":true}')
    ),
    revision=revision+1,
    modified_by='migration-0156',
    modified_at='2026-10-02T00:00:00.000Z'
WHERE doctype='Payment Allocation'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='source_credit_note'
  );
