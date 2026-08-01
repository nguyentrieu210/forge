-- Finance advances and append-only Payment Allocation.
--
-- A Payment Entry advance is represented by a negative Payment Ledger balance
-- against the Payment Entry itself. A later Payment Allocation consumes that
-- source with a positive row and reduces an invoice with a negative row.
-- No mutable outstanding/advance balance is stored.

DROP TRIGGER IF EXISTS receivable_outstanding_guard;
DROP TRIGGER IF EXISTS receivable_base_outstanding_guard;

CREATE TRIGGER payment_invoice_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type IN ('Sales Invoice','Purchase Invoice','Salary Slip')
 AND COALESCE((
   SELECT SUM(amount_minor) FROM payment_ledger_entries
   WHERE tenant_id=NEW.tenant_id
     AND against_voucher_type=NEW.against_voucher_type
     AND against_voucher_no=NEW.against_voucher_no
 ),0) + NEW.amount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'OUTSTANDING_EXCEEDED');
END;

CREATE TRIGGER payment_invoice_base_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type IN ('Sales Invoice','Purchase Invoice','Salary Slip')
 AND COALESCE((
   SELECT SUM(base_amount_minor) FROM payment_ledger_entries
   WHERE tenant_id=NEW.tenant_id
     AND against_voucher_type=NEW.against_voucher_type
     AND against_voucher_no=NEW.against_voucher_no
 ),0) + NEW.base_amount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'BASE_OUTSTANDING_EXCEEDED');
END;

-- Advance source balances start negative. Consumption/reversal may move them
-- toward zero, but never above zero.
CREATE TRIGGER payment_advance_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type='Payment Entry'
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT SUM(amount_minor) FROM payment_ledger_entries
      WHERE tenant_id=NEW.tenant_id
        AND against_voucher_type='Payment Entry'
        AND against_voucher_no=NEW.against_voucher_no
    ),0) + NEW.amount_minor > 0
      THEN RAISE(ABORT, 'PAYMENT_ADVANCE_EXCEEDED')
    WHEN EXISTS(
      SELECT 1 FROM payment_ledger_entries
      WHERE tenant_id=NEW.tenant_id
        AND against_voucher_type='Payment Entry'
        AND against_voucher_no=NEW.against_voucher_no
        AND (party_type<>NEW.party_type OR party<>NEW.party OR account<>NEW.account
             OR currency<>NEW.currency OR currency_scale<>NEW.currency_scale
             OR account_type<>NEW.account_type)
    ) THEN RAISE(ABORT, 'PAYMENT_ADVANCE_CONTEXT_MISMATCH')
  END;
END;

CREATE TRIGGER payment_advance_base_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type='Payment Entry'
 AND COALESCE((
   SELECT SUM(base_amount_minor) FROM payment_ledger_entries
   WHERE tenant_id=NEW.tenant_id
     AND against_voucher_type='Payment Entry'
     AND against_voucher_no=NEW.against_voucher_no
 ),0) + NEW.base_amount_minor > 0
 -- If transaction-currency outstanding is also exceeded, let the amount guard
 -- own that error deterministically. The base guard is only for base-only drift.
 AND COALESCE((
   SELECT SUM(amount_minor) FROM payment_ledger_entries
   WHERE tenant_id=NEW.tenant_id
     AND against_voucher_type='Payment Entry'
     AND against_voucher_no=NEW.against_voucher_no
 ),0) + NEW.amount_minor <= 0
BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_ADVANCE_BASE_EXCEEDED');
END;

CREATE VIEW finance_advance_balance AS
SELECT
  p.tenant_id,
  p.party_type,
  p.party,
  p.account,
  p.currency,
  p.currency_scale,
  p.against_voucher_no AS source_payment_entry,
  MIN(CASE WHEN p.voucher_type='Payment Entry' THEN p.posting_at END) AS source_posting_at,
  -SUM(CASE WHEN p.voucher_type='Payment Entry' AND p.amount_minor<0 THEN p.amount_minor ELSE 0 END) AS original_advance_minor,
  SUM(CASE WHEN p.voucher_type='Payment Allocation' AND p.amount_minor>0 THEN p.amount_minor ELSE 0 END) AS allocated_amount_minor,
  -SUM(p.amount_minor) AS remaining_advance_minor,
  -SUM(p.base_amount_minor) AS remaining_base_advance_minor,
  CAST(-SUM(p.amount_minor) AS REAL) / CASE p.currency_scale
    WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
    WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS remaining_advance
FROM payment_ledger_entries p
WHERE p.against_voucher_type='Payment Entry'
GROUP BY p.tenant_id,p.party_type,p.party,p.account,p.currency,p.currency_scale,p.against_voucher_no
HAVING SUM(p.amount_minor)<0;

-- Payment Entry may now hold an advance without invoice references.
UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.fields[' || (
        SELECT key FROM json_each(metadata_json,'$.fields')
        WHERE json_extract(value,'$.fieldname')='references' LIMIT 1
      ) || '].required',
      json('false')
    ),
    revision=revision+1,
    modified_by='migration',
    modified_at='2026-08-01T00:00:00.000Z'
WHERE doctype='Payment Entry'
  AND EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='references'
  );

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"paid_from","label":"Paid From","fieldtype":"Link","options":"Account","required":true,"in_list_view":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-01T00:00:00.000Z'
WHERE doctype='Payment Entry' AND NOT EXISTS(
  SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='paid_from'
);
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"paid_to","label":"Paid To","fieldtype":"Link","options":"Account","required":true,"in_list_view":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-01T00:00:00.000Z'
WHERE doctype='Payment Entry' AND NOT EXISTS(
  SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='paid_to'
);
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"received_amount","label":"Received/Paid in Company Currency","fieldtype":"Currency","required":true,"in_list_view":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-01T00:00:00.000Z'
WHERE doctype='Payment Entry' AND NOT EXISTS(
  SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='received_amount'
);
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"unallocated_amount","label":"Unallocated Amount","fieldtype":"Currency","read_only":true,"in_list_view":true,"in_standard_filter":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-01T00:00:00.000Z'
WHERE doctype='Payment Entry' AND NOT EXISTS(
  SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='unallocated_amount'
);

INSERT OR IGNORE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
)
SELECT tenant_id,'Payment Allocation','Accounts',0,1,0,1,
json('{"name":"Payment Allocation","module":"Accounts","is_submittable":true,"track_changes":true,"autoname":"PA-.YYYY.-#####","title_field":"party","search_fields":["party","source_payment_entry"],"sort_field":"posting_at","sort_order":"DESC","revision":1,"fields":[{"fieldname":"company","label":"Company","fieldtype":"Link","options":"Company","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"party_type","label":"Party Type","fieldtype":"Select","options":"Customer\nSupplier","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"party","label":"Party","fieldtype":"Dynamic Link","options":"party_type","required":true,"in_list_view":true,"search_index":true},{"fieldname":"party_account","label":"Party Account","fieldtype":"Link","options":"Account","required":true,"in_list_view":true},{"fieldname":"currency","label":"Currency","fieldtype":"Link","options":"Currency","required":true,"in_list_view":true},{"fieldname":"posting_at","label":"Posting At","fieldtype":"Datetime","required":true,"in_list_view":true},{"fieldname":"source_payment_entry","label":"Source Payment Entry","fieldtype":"Link","options":"Payment Entry","required":true,"in_list_view":true,"search_index":true},{"fieldname":"reason","label":"Reason","fieldtype":"Small Text"},{"fieldname":"references","label":"Invoice Allocations","fieldtype":"Table","options":"Payment Allocation Reference","required":true},{"fieldname":"total_allocated_amount","label":"Total Allocated","fieldtype":"Currency","read_only":true,"in_list_view":true}],"permissions":[{"role":"Accounts Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"email":true,"report":true,"export":true,"share":true},{"role":"Accounts User","read":true,"write":true,"create":true,"submit":false,"cancel":false,"print":true,"email":true,"report":true,"export":true,"share":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"email":true,"report":true,"export":true,"share":true}],"custom":false}'),
0,'migration','2026-08-01T00:00:00.000Z'
FROM (SELECT DISTINCT tenant_id FROM doctype_definitions);

INSERT OR IGNORE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
)
SELECT tenant_id,'Payment Allocation Reference','Accounts',0,0,1,1,
json('{"name":"Payment Allocation Reference","module":"Accounts","is_child":true,"revision":1,"fields":[{"fieldname":"reference_doctype","label":"Reference Type","fieldtype":"Select","options":"Sales Invoice\nPurchase Invoice","required":true,"in_list_view":true},{"fieldname":"reference_name","label":"Invoice","fieldtype":"Dynamic Link","options":"reference_doctype","required":true,"in_list_view":true},{"fieldname":"allocated_amount","label":"Allocated Amount","fieldtype":"Currency","required":true,"in_list_view":true},{"fieldname":"base_allocated_amount","label":"Base Allocated Amount","fieldtype":"Currency","read_only":true,"in_list_view":true}],"permissions":[],"custom":false}'),
0,'migration','2026-08-01T00:00:00.000Z'
FROM (SELECT DISTINCT tenant_id FROM doctype_definitions);
