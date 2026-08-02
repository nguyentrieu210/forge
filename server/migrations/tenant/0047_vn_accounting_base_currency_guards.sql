-- Base ledgers are single-currency per legal entity once VN Accounting Policy is active.
-- Foreign currency remains in document snapshots and payment subledger.

DROP TRIGGER IF EXISTS vn_gl_company_currency_guard;
CREATE TRIGGER vn_gl_company_currency_guard
BEFORE INSERT ON gl_entries
WHEN EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
    AND EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
        AND date(NEW.posting_at)>=date(json_extract(p.payload_json,'$.effective_from'))
        AND date(NEW.posting_at)<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
    )
)
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT json_extract(c.data_json,'$.default_currency')
      FROM documents d
      JOIN master_records c ON c.tenant_id=d.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(d.payload_json,'$.company') AND c.disabled=0
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
      LIMIT 1
    ),'')=''
    THEN RAISE(ABORT,'COMPANY_DEFAULT_CURRENCY_REQUIRED')
    WHEN NEW.currency<>(
      SELECT json_extract(c.data_json,'$.default_currency')
      FROM documents d
      JOIN master_records c ON c.tenant_id=d.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(d.payload_json,'$.company') AND c.disabled=0
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
      LIMIT 1
    )
    THEN RAISE(ABORT,'GL_COMPANY_CURRENCY_MISMATCH')
    WHEN NEW.currency_scale<>COALESCE((
      SELECT CAST(json_extract(cur.data_json,'$.currency_scale') AS INTEGER)
      FROM documents d
      JOIN master_records c ON c.tenant_id=d.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(d.payload_json,'$.company') AND c.disabled=0
      JOIN master_records cur ON cur.tenant_id=d.tenant_id AND cur.record_type='Currency'
        AND cur.name=json_extract(c.data_json,'$.default_currency') AND cur.disabled=0
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
      LIMIT 1
    ),-1)
    THEN RAISE(ABORT,'GL_COMPANY_CURRENCY_SCALE_MISMATCH')
  END;
END;

DROP TRIGGER IF EXISTS vn_stock_company_currency_guard;
CREATE TRIGGER vn_stock_company_currency_guard
BEFORE INSERT ON stock_ledger_entries
WHEN EXISTS(
  SELECT 1 FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
    AND EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
        AND date(NEW.posting_at)>=date(json_extract(p.payload_json,'$.effective_from'))
        AND date(NEW.posting_at)<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
    )
)
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT json_extract(c.data_json,'$.default_currency')
      FROM documents d
      JOIN master_records c ON c.tenant_id=d.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(d.payload_json,'$.company') AND c.disabled=0
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
      LIMIT 1
    ),'')=''
    THEN RAISE(ABORT,'COMPANY_DEFAULT_CURRENCY_REQUIRED')
    WHEN NEW.currency<>(
      SELECT json_extract(c.data_json,'$.default_currency')
      FROM documents d
      JOIN master_records c ON c.tenant_id=d.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(d.payload_json,'$.company') AND c.disabled=0
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
      LIMIT 1
    )
    THEN RAISE(ABORT,'STOCK_COMPANY_CURRENCY_MISMATCH')
    WHEN NEW.currency_scale<>COALESCE((
      SELECT CAST(json_extract(cur.data_json,'$.currency_scale') AS INTEGER)
      FROM documents d
      JOIN master_records c ON c.tenant_id=d.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(d.payload_json,'$.company') AND c.disabled=0
      JOIN master_records cur ON cur.tenant_id=d.tenant_id AND cur.record_type='Currency'
        AND cur.name=json_extract(c.data_json,'$.default_currency') AND cur.disabled=0
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
      LIMIT 1
    ),-1)
    THEN RAISE(ABORT,'STOCK_COMPANY_CURRENCY_SCALE_MISMATCH')
  END;
END;
