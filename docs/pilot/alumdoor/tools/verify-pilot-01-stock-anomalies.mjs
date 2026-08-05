#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(readFileSync(path.resolve(here, "../PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json"), "utf8"));

function fail(message) { throw new Error(message); }

if (evidence.format !== "forge-alumdoor-pilot-01-stock-anomaly-disposition/v1") fail("unexpected stock anomaly evidence format");
if (evidence.status !== "PARTIAL_LOCK_PREVIEW_ONLY") fail("stock anomaly disposition status drift");
if (evidence.future_date_anomalies.row_count !== 2) fail("expected exactly two future-dated source rows");
if (evidence.future_date_anomalies.piece_qty !== 157) fail("future-dated source piece total drift");
if (evidence.future_date_anomalies.history_evidence.safe_replacement_date_proven !== false) fail("a corrected date must not be asserted without new source evidence");
if (evidence.future_date_anomalies.opening_eligible !== false) fail("future-dated rows must remain quarantined from opening");
if (evidence.future_date_anomalies.date_rewritten !== false) fail("source dates must not be silently rewritten");
if (evidence.source_status_totals.available_rows_before_quarantine - evidence.source_status_totals.quarantined_rows !== evidence.source_status_totals.opening_eligible_physical_rows_after_quarantine) fail("quarantine row arithmetic drift");
if (evidence.source_status_totals.available_piece_qty_before_quarantine - evidence.source_status_totals.quarantined_piece_qty !== evidence.source_status_totals.opening_eligible_piece_qty_after_quarantine) fail("quarantine piece arithmetic drift");
if (evidence.scope_drift.opening_scope_complete !== false) fail("stock source scope must remain incomplete until external evidence resolves it");
if (evidence.production_write_authorized !== false || evidence.production_data_mutated !== false) fail("stock anomaly disposition must remain preview-only");

process.stdout.write(`${JSON.stringify({
  status: evidence.status,
  quarantined_rows: evidence.future_date_anomalies.row_count,
  quarantined_piece_qty: evidence.future_date_anomalies.piece_qty,
  eligible_physical_rows: evidence.source_status_totals.opening_eligible_physical_rows_after_quarantine,
  eligible_piece_qty: evidence.source_status_totals.opening_eligible_piece_qty_after_quarantine,
  stock_scope_complete: false,
  production_write_authorized: false,
})}\n`);
