-- Alumdoor V2 inventory completion.
--
-- 1. Catch-weight must be visible in the same reports as quantity and value.
--    The views were created before 0024 added actual_weight_micros, so CREATE VIEW IF NOT EXISTS
--    cannot evolve them. Recreate both explicitly.
CREATE TABLE IF NOT EXISTS maintenance_runs (
  tenant_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  last_started_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  PRIMARY KEY (tenant_id,job_name)
);

CREATE TABLE IF NOT EXISTS ai_logs (
  tenant_id TEXT NOT NULL,
  log_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  context_json TEXT NOT NULL CHECK (json_valid(context_json)),
  answer TEXT NOT NULL,
  model_family TEXT NOT NULL DEFAULT 'workers-ai',
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,log_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_logs_user_created
  ON ai_logs(tenant_id,user_id,created_at DESC);

ALTER TABLE accounting_period_locks ADD COLUMN modified_by TEXT NOT NULL DEFAULT '';
ALTER TABLE accounting_period_locks ADD COLUMN reason TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS accounting_period_lock_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  company TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('Lock','Unlock')),
  lock_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,event_id)
);
CREATE INDEX IF NOT EXISTS idx_period_lock_events_company
  ON accounting_period_lock_events(tenant_id,company,occurred_at DESC);

DROP VIEW IF EXISTS stock_ledger_report;
CREATE VIEW stock_ledger_report AS
SELECT tenant_id,posting_at,voucher_type,voucher_no,item_code,warehouse,batch_no,serial_no,currency,currency_scale,
       CAST(actual_qty_micros AS REAL)/1000000.0 AS actual_qty,
       CASE WHEN actual_weight_micros IS NULL THEN NULL
            ELSE CAST(actual_weight_micros AS REAL)/1000000.0 END AS actual_weight,
       CAST(valuation_rate_minor AS REAL)/CASE currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS valuation_rate,
       CAST(stock_value_difference_minor AS REAL)/CASE currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS stock_value_difference
FROM stock_ledger_entries;

DROP VIEW IF EXISTS batch_stock_balance;
CREATE VIEW batch_stock_balance AS
SELECT tenant_id,item_code,warehouse,batch_no,currency,currency_scale,
       SUM(actual_qty_micros) AS actual_qty_micros,
       CAST(SUM(actual_qty_micros) AS REAL)/1000000.0 AS actual_qty,
       CASE WHEN COUNT(actual_weight_micros)=0 THEN NULL ELSE SUM(actual_weight_micros) END AS actual_weight_micros,
       CASE WHEN COUNT(actual_weight_micros)=0 THEN NULL
            ELSE CAST(SUM(actual_weight_micros) AS REAL)/1000000.0 END AS actual_weight,
       SUM(stock_value_difference_minor) AS stock_value_minor,
       CAST(SUM(stock_value_difference_minor) AS REAL)/CASE currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS stock_value
FROM stock_ledger_entries WHERE batch_no IS NOT NULL
GROUP BY tenant_id,item_code,warehouse,batch_no,currency,currency_scale;

-- Batch and Warehouse can be installed as fixtures (master_records) or created through
-- the normal Desk resource API (documents). Prefer the live document when both exist.
DROP VIEW IF EXISTS alumdoor_available_stock_by_length;
CREATE VIEW alumdoor_available_stock_by_length AS
WITH batch_meta AS (
  SELECT d.tenant_id,d.name,d.payload_json AS data_json
  FROM documents d
  WHERE d.doctype='Batch' AND d.docstatus<>2
  UNION ALL
  SELECT m.tenant_id,m.name,m.data_json
  FROM master_records m
  WHERE m.record_type='Batch' AND m.disabled=0
    AND NOT EXISTS (
      SELECT 1 FROM documents d
      WHERE d.tenant_id=m.tenant_id AND d.doctype='Batch' AND d.name=m.name AND d.docstatus<>2
    )
),
warehouse_meta AS (
  SELECT d.tenant_id,d.name,d.payload_json AS data_json
  FROM documents d
  WHERE d.doctype='Warehouse' AND d.docstatus<>2
  UNION ALL
  SELECT m.tenant_id,m.name,m.data_json
  FROM master_records m
  WHERE m.record_type='Warehouse' AND m.disabled=0
    AND NOT EXISTS (
      SELECT 1 FROM documents d
      WHERE d.tenant_id=m.tenant_id AND d.doctype='Warehouse' AND d.name=m.name AND d.docstatus<>2
    )
),
batch_positions AS (
  SELECT s.tenant_id,s.item_code,s.warehouse,s.batch_no,
         CAST(json_extract(b.data_json,'$.length_m') AS REAL) AS length_m,
         COALESCE(json_extract(b.data_json,'$.color'),'') AS color,
         COALESCE(json_extract(b.data_json,'$.condition'),'') AS condition,
         SUM(s.actual_qty_micros) AS qty_micros,
         CASE WHEN COUNT(s.actual_weight_micros)=0 THEN NULL
              ELSE SUM(s.actual_weight_micros) END AS weight_micros
  FROM stock_ledger_entries s
  JOIN batch_meta b
    ON b.tenant_id=s.tenant_id AND b.name=s.batch_no
  JOIN warehouse_meta w
    ON w.tenant_id=s.tenant_id AND w.name=s.warehouse
  WHERE s.batch_no IS NOT NULL
    AND json_extract(w.data_json,'$.stock_role')='Kho chính'
  GROUP BY s.tenant_id,s.item_code,s.warehouse,s.batch_no,b.data_json
  HAVING SUM(s.actual_qty_micros)>0
),
thresholds AS (
  SELECT DISTINCT tenant_id,item_code,warehouse,color,condition,length_m
  FROM batch_positions
  WHERE length_m>0
),
availability AS (
  SELECT t.tenant_id,t.item_code,t.warehouse,t.color,t.condition,t.length_m AS min_length_m,
         COALESCE((
           SELECT SUM(p.qty_micros) FROM batch_positions p
           WHERE p.tenant_id=t.tenant_id AND p.item_code=t.item_code AND p.warehouse=t.warehouse
             AND p.color=t.color AND p.condition=t.condition AND p.length_m>=t.length_m
         ),0) AS total_qty_micros,
         COALESCE((
           SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.qty_reserved_micros'),
             ROUND(CAST(json_extract(r.payload_json,'$.qty_reserved') AS REAL)*1000000.0)) AS INTEGER))
           FROM documents r
           WHERE r.tenant_id=t.tenant_id AND r.doctype='Stock Reservation'
             AND json_extract(r.payload_json,'$.state')='Đang giữ'
             AND (COALESCE(json_extract(r.payload_json,'$.expires_at'),'')=''
                  OR json_extract(r.payload_json,'$.expires_at')>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
             AND json_extract(r.payload_json,'$.item_code')=t.item_code
             AND CAST(json_extract(r.payload_json,'$.min_length_m') AS REAL)>=t.length_m
             AND (COALESCE(json_extract(r.payload_json,'$.warehouse'),'')=''
                  OR json_extract(r.payload_json,'$.warehouse')=t.warehouse)
             AND (COALESCE(json_extract(r.payload_json,'$.color'),'')=''
                  OR json_extract(r.payload_json,'$.color')=t.color)
             AND (COALESCE(json_extract(r.payload_json,'$.condition'),'')=''
                  OR json_extract(r.payload_json,'$.condition')=t.condition)
         ),0) AS reserved_qty_micros
  FROM thresholds t
)
SELECT tenant_id,item_code,warehouse,color,condition,min_length_m,
       total_qty_micros,
       CAST(total_qty_micros AS REAL)/1000000.0 AS total_qty,
       reserved_qty_micros,
       CAST(reserved_qty_micros AS REAL)/1000000.0 AS reserved_qty,
       total_qty_micros-reserved_qty_micros AS available_qty_micros,
       CAST(total_qty_micros-reserved_qty_micros AS REAL)/1000000.0 AS available_qty
FROM availability;

-- 2. The controller gives a Vietnamese error with total/reserved/available figures. This trigger is
--    the final concurrency guard: two production orders may both read the same availability before
--    either commits, but only the first commit is allowed to consume that availability.
CREATE TRIGGER IF NOT EXISTS stock_reservation_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Stock Reservation'
 AND json_extract(NEW.payload_json,'$.state')='Đang giữ'
BEGIN
  SELECT CASE WHEN
    CAST(COALESCE(json_extract(NEW.payload_json,'$.qty_reserved_micros'),
      ROUND(CAST(json_extract(NEW.payload_json,'$.qty_reserved') AS REAL)*1000000.0)) AS INTEGER)
    >
    COALESCE((
      SELECT SUM(s.actual_qty_micros)
      FROM stock_ledger_entries s
      JOIN (
        SELECT d.tenant_id,d.name,d.payload_json AS data_json FROM documents d
        WHERE d.doctype='Batch' AND d.docstatus<>2
        UNION ALL
        SELECT m.tenant_id,m.name,m.data_json FROM master_records m
        WHERE m.record_type='Batch' AND m.disabled=0
          AND NOT EXISTS (
            SELECT 1 FROM documents d
            WHERE d.tenant_id=m.tenant_id AND d.doctype='Batch' AND d.name=m.name AND d.docstatus<>2
          )
      ) b ON b.tenant_id=s.tenant_id AND b.name=s.batch_no
      JOIN (
        SELECT d.tenant_id,d.name,d.payload_json AS data_json FROM documents d
        WHERE d.doctype='Warehouse' AND d.docstatus<>2
        UNION ALL
        SELECT m.tenant_id,m.name,m.data_json FROM master_records m
        WHERE m.record_type='Warehouse' AND m.disabled=0
          AND NOT EXISTS (
            SELECT 1 FROM documents d
            WHERE d.tenant_id=m.tenant_id AND d.doctype='Warehouse' AND d.name=m.name AND d.docstatus<>2
          )
      ) w ON w.tenant_id=s.tenant_id AND w.name=s.warehouse
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(NEW.payload_json,'$.item_code')
        AND CAST(json_extract(b.data_json,'$.length_m') AS REAL)
            >= CAST(json_extract(NEW.payload_json,'$.min_length_m') AS REAL)
        AND json_extract(w.data_json,'$.stock_role')='Kho chính'
        AND (COALESCE(json_extract(NEW.payload_json,'$.warehouse'),'')=''
             OR s.warehouse=json_extract(NEW.payload_json,'$.warehouse'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.color'),'')=''
             OR json_extract(b.data_json,'$.color')=json_extract(NEW.payload_json,'$.color'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.condition'),'')=''
             OR json_extract(b.data_json,'$.condition')=json_extract(NEW.payload_json,'$.condition'))
    ),0)
    -
    COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(d.payload_json,'$.qty_reserved_micros'),
        ROUND(CAST(json_extract(d.payload_json,'$.qty_reserved') AS REAL)*1000000.0)) AS INTEGER))
      FROM documents d
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Stock Reservation'
        AND d.doc_key<>NEW.doc_key
        AND json_extract(d.payload_json,'$.state')='Đang giữ'
        AND (COALESCE(json_extract(d.payload_json,'$.expires_at'),'')=''
             OR json_extract(d.payload_json,'$.expires_at')>NEW.modified_at)
        AND json_extract(d.payload_json,'$.item_code')=json_extract(NEW.payload_json,'$.item_code')
        AND CAST(json_extract(d.payload_json,'$.min_length_m') AS REAL)
            >= CAST(json_extract(NEW.payload_json,'$.min_length_m') AS REAL)
        AND (COALESCE(json_extract(NEW.payload_json,'$.warehouse'),'')=''
             OR COALESCE(json_extract(d.payload_json,'$.warehouse'),'')=''
             OR json_extract(d.payload_json,'$.warehouse')=json_extract(NEW.payload_json,'$.warehouse'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.color'),'')=''
             OR COALESCE(json_extract(d.payload_json,'$.color'),'')=''
             OR json_extract(d.payload_json,'$.color')=json_extract(NEW.payload_json,'$.color'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.condition'),'')=''
             OR COALESCE(json_extract(d.payload_json,'$.condition'),'')=''
             OR json_extract(d.payload_json,'$.condition')=json_extract(NEW.payload_json,'$.condition'))
    ),0)
    THEN RAISE(ABORT,'STOCK_RESERVATION_EXCEEDED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS stock_reservation_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Stock Reservation'
 AND json_extract(NEW.payload_json,'$.state')='Đang giữ'
BEGIN
  SELECT CASE WHEN
    CAST(COALESCE(json_extract(NEW.payload_json,'$.qty_reserved_micros'),
      ROUND(CAST(json_extract(NEW.payload_json,'$.qty_reserved') AS REAL)*1000000.0)) AS INTEGER)
    >
    COALESCE((
      SELECT SUM(s.actual_qty_micros)
      FROM stock_ledger_entries s
      JOIN (
        SELECT d.tenant_id,d.name,d.payload_json AS data_json FROM documents d
        WHERE d.doctype='Batch' AND d.docstatus<>2
        UNION ALL
        SELECT m.tenant_id,m.name,m.data_json FROM master_records m
        WHERE m.record_type='Batch' AND m.disabled=0
          AND NOT EXISTS (
            SELECT 1 FROM documents d
            WHERE d.tenant_id=m.tenant_id AND d.doctype='Batch' AND d.name=m.name AND d.docstatus<>2
          )
      ) b ON b.tenant_id=s.tenant_id AND b.name=s.batch_no
      JOIN (
        SELECT d.tenant_id,d.name,d.payload_json AS data_json FROM documents d
        WHERE d.doctype='Warehouse' AND d.docstatus<>2
        UNION ALL
        SELECT m.tenant_id,m.name,m.data_json FROM master_records m
        WHERE m.record_type='Warehouse' AND m.disabled=0
          AND NOT EXISTS (
            SELECT 1 FROM documents d
            WHERE d.tenant_id=m.tenant_id AND d.doctype='Warehouse' AND d.name=m.name AND d.docstatus<>2
          )
      ) w ON w.tenant_id=s.tenant_id AND w.name=s.warehouse
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(NEW.payload_json,'$.item_code')
        AND CAST(json_extract(b.data_json,'$.length_m') AS REAL)
            >= CAST(json_extract(NEW.payload_json,'$.min_length_m') AS REAL)
        AND json_extract(w.data_json,'$.stock_role')='Kho chính'
        AND (COALESCE(json_extract(NEW.payload_json,'$.warehouse'),'')=''
             OR s.warehouse=json_extract(NEW.payload_json,'$.warehouse'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.color'),'')=''
             OR json_extract(b.data_json,'$.color')=json_extract(NEW.payload_json,'$.color'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.condition'),'')=''
             OR json_extract(b.data_json,'$.condition')=json_extract(NEW.payload_json,'$.condition'))
    ),0)
    -
    COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(d.payload_json,'$.qty_reserved_micros'),
        ROUND(CAST(json_extract(d.payload_json,'$.qty_reserved') AS REAL)*1000000.0)) AS INTEGER))
      FROM documents d
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Stock Reservation'
        AND d.doc_key<>NEW.doc_key
        AND json_extract(d.payload_json,'$.state')='Đang giữ'
        AND (COALESCE(json_extract(d.payload_json,'$.expires_at'),'')=''
             OR json_extract(d.payload_json,'$.expires_at')>NEW.modified_at)
        AND json_extract(d.payload_json,'$.item_code')=json_extract(NEW.payload_json,'$.item_code')
        AND CAST(json_extract(d.payload_json,'$.min_length_m') AS REAL)
            >= CAST(json_extract(NEW.payload_json,'$.min_length_m') AS REAL)
        AND (COALESCE(json_extract(NEW.payload_json,'$.warehouse'),'')=''
             OR COALESCE(json_extract(d.payload_json,'$.warehouse'),'')=''
             OR json_extract(d.payload_json,'$.warehouse')=json_extract(NEW.payload_json,'$.warehouse'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.color'),'')=''
             OR COALESCE(json_extract(d.payload_json,'$.color'),'')=''
             OR json_extract(d.payload_json,'$.color')=json_extract(NEW.payload_json,'$.color'))
        AND (COALESCE(json_extract(NEW.payload_json,'$.condition'),'')=''
             OR COALESCE(json_extract(d.payload_json,'$.condition'),'')=''
             OR json_extract(d.payload_json,'$.condition')=json_extract(NEW.payload_json,'$.condition'))
    ),0)
    THEN RAISE(ABORT,'STOCK_RESERVATION_EXCEEDED')
  END;
END;
