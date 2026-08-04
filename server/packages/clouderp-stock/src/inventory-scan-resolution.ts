import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { normalizeInventoryScan, type InventoryScanInput, type NormalizedInventoryScan } from "./inventory-scan.js";

export const INVENTORY_SCAN_DOCTYPES = ["Item", "Batch", "Serial No", "Warehouse"] as const;
export type InventoryScanDoctype = typeof INVENTORY_SCAN_DOCTYPES[number];

export interface InventoryScanCandidateRecord {
  doctype: InventoryScanDoctype;
  name: string;
  data: JsonObject;
}

export interface InventoryScanLookup {
  findCandidates(
    tenantId: string,
    value: string,
    expectedDoctype?: InventoryScanDoctype,
  ): Promise<InventoryScanCandidateRecord[]>;
}

export interface InventoryScanAccessPolicy {
  canRead(actor: Actor, tenantId: string, candidate: InventoryScanCandidateRecord): Promise<boolean>;
}

export interface InventoryScanResolutionInput {
  scan: InventoryScanInput;
  expected_doctype?: InventoryScanDoctype;
  company?: string;
  warehouse?: string;
}

export interface ResolvedInventoryScanCandidate extends JsonObject {
  doctype: InventoryScanDoctype;
  name: string;
  company?: string;
  item_code?: string;
  warehouse?: string;
  batch_no?: string;
  serial_no?: string;
  expiry_date?: string;
}

export interface InventoryScanResolution extends JsonObject {
  scan: NormalizedInventoryScan;
  status: "resolved" | "not_found" | "ambiguous";
  candidate?: ResolvedInventoryScanCandidate;
  candidates?: ResolvedInventoryScanCandidate[];
}

/**
 * Permission-aware server resolver for barcode / QR / mobile inventory scans.
 *
 * The client supplies only a scanned value and optional context/hint. The server owns
 * entity lookup, tenant scope and authorization. Ambiguous codes are never guessed.
 * This function is deliberately non-ledger: resolving a code cannot move or reserve stock.
 */
export async function resolveInventoryScan(
  actor: Actor,
  tenantId: string,
  input: InventoryScanResolutionInput,
  lookup: InventoryScanLookup,
  access: InventoryScanAccessPolicy,
): Promise<InventoryScanResolution> {
  const trustedTenant = text(tenantId);
  if (!trustedTenant) throw errors.authentication("Missing tenant context");
  const scan = normalizeInventoryScan(input.scan);
  const expected = input.expected_doctype;
  if (expected !== undefined && !isInventoryScanDoctype(expected)) {
    throw errors.validation(`Unsupported inventory scan doctype ${String(expected)}`);
  }
  const company = optionalText(input.company, "company");
  const warehouse = optionalText(input.warehouse, "warehouse");

  const raw = await lookup.findCandidates(trustedTenant, scan.value, expected);
  if (!Array.isArray(raw) || raw.length > 32) {
    throw errors.validation("Inventory scan lookup exceeded the bounded candidate budget");
  }

  const unique = new Map<string, InventoryScanCandidateRecord>();
  for (const candidate of raw) {
    if (!isInventoryScanDoctype(candidate.doctype)) continue;
    if (expected && candidate.doctype !== expected) continue;
    const name = text(candidate.name);
    if (!name || !candidate.data || typeof candidate.data !== "object" || Array.isArray(candidate.data)) continue;
    const normalized: InventoryScanCandidateRecord = { doctype: candidate.doctype, name, data: candidate.data };
    if (!withinContext(normalized, company, warehouse)) continue;
    if (!await access.canRead(actor, trustedTenant, normalized)) continue;
    unique.set(`${candidate.doctype}\u0000${name}`, normalized);
  }

  const candidates = [...unique.values()]
    .sort(compareCandidate)
    .map(projectCandidate);
  if (candidates.length === 0) return { scan, status: "not_found" };
  if (candidates.length > 1) return { scan, status: "ambiguous", candidates };
  return { scan, status: "resolved", candidate: candidates[0]! };
}

/** D1-backed lookup over the canonical tenant-scoped master-record authority. */
export class D1InventoryScanLookup implements InventoryScanLookup {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async findCandidates(
    tenantId: string,
    value: string,
    expectedDoctype?: InventoryScanDoctype,
  ): Promise<InventoryScanCandidateRecord[]> {
    const typeClause = expectedDoctype
      ? "record_type=?3"
      : "record_type IN ('Item','Batch','Serial No','Warehouse')";
    const sql = `SELECT record_type,name,data_json
      FROM master_records
      WHERE tenant_id=?1 AND disabled=0 AND ${typeClause}
        AND (
          name=?2
          OR (record_type='Item' AND (
            json_extract(data_json,'$.item_code')=?2
            OR json_extract(data_json,'$.barcode')=?2
            OR json_extract(data_json,'$.qr_code')=?2
            OR EXISTS (
              SELECT 1 FROM json_each(data_json,'$.barcodes') AS barcode
              WHERE barcode.value=?2 OR json_extract(barcode.value,'$.barcode')=?2
            )
          ))
          OR (record_type='Batch' AND (
            json_extract(data_json,'$.batch_id')=?2
            OR json_extract(data_json,'$.batch_no')=?2
            OR json_extract(data_json,'$.barcode')=?2
            OR json_extract(data_json,'$.qr_code')=?2
          ))
          OR (record_type='Serial No' AND (
            json_extract(data_json,'$.serial_no')=?2
            OR json_extract(data_json,'$.barcode')=?2
            OR json_extract(data_json,'$.qr_code')=?2
          ))
          OR (record_type='Warehouse' AND (
            json_extract(data_json,'$.warehouse_code')=?2
            OR json_extract(data_json,'$.barcode')=?2
            OR json_extract(data_json,'$.qr_code')=?2
          ))
        )
      ORDER BY CASE WHEN name=?2 THEN 0 ELSE 1 END,record_type,name
      LIMIT 33`;
    const statement = this.db.prepare(sql);
    const result = expectedDoctype
      ? await statement.bind(tenantId, value, expectedDoctype).all<{ record_type: string; name: string; data_json: string }>()
      : await statement.bind(tenantId, value).all<{ record_type: string; name: string; data_json: string }>();
    const rows = result.results ?? [];
    if (rows.length > 32) throw errors.validation("Inventory scan code matches too many master records");
    const candidates: InventoryScanCandidateRecord[] = [];
    for (const row of rows) {
      if (!isInventoryScanDoctype(row.record_type)) continue;
      const parsed = JSON.parse(row.data_json) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw errors.validation(`Invalid master record payload for ${row.record_type} ${row.name}`);
      }
      candidates.push({ doctype: row.record_type, name: row.name, data: parsed as JsonObject });
    }
    return candidates;
  }
}

function withinContext(candidate: InventoryScanCandidateRecord, company: string | undefined, warehouse: string | undefined): boolean {
  const dataCompany = optionalCandidateText(candidate.data.company);
  const dataWarehouse = optionalCandidateText(candidate.data.warehouse);
  if (company && dataCompany && dataCompany !== company) return false;
  if (warehouse) {
    if (candidate.doctype === "Warehouse" && candidate.name !== warehouse) return false;
    if (dataWarehouse && dataWarehouse !== warehouse) return false;
  }
  if (candidate.doctype === "Warehouse" && Number(candidate.data.is_group ?? 0) === 1) return false;
  return true;
}

function projectCandidate(candidate: InventoryScanCandidateRecord): ResolvedInventoryScanCandidate {
  const data = candidate.data;
  const output: ResolvedInventoryScanCandidate = {
    doctype: candidate.doctype,
    name: candidate.name,
  };
  copyText(output, "company", data.company);
  copyText(output, "item_code", data.item_code ?? (candidate.doctype === "Item" ? candidate.name : undefined));
  copyText(output, "warehouse", data.warehouse ?? (candidate.doctype === "Warehouse" ? candidate.name : undefined));
  copyText(output, "batch_no", data.batch_no ?? data.batch_id ?? (candidate.doctype === "Batch" ? candidate.name : undefined));
  copyText(output, "serial_no", data.serial_no ?? (candidate.doctype === "Serial No" ? candidate.name : undefined));
  copyText(output, "expiry_date", data.expiry_date);
  return output;
}

function compareCandidate(left: InventoryScanCandidateRecord, right: InventoryScanCandidateRecord): number {
  const rank = new Map<InventoryScanDoctype, number>([
    ["Serial No", 0],
    ["Batch", 1],
    ["Item", 2],
    ["Warehouse", 3],
  ]);
  return (rank.get(left.doctype)! - rank.get(right.doctype)!) || left.name.localeCompare(right.name);
}

function isInventoryScanDoctype(value: unknown): value is InventoryScanDoctype {
  return typeof value === "string" && (INVENTORY_SCAN_DOCTYPES as readonly string[]).includes(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation(`${field} must be a string`);
  const normalized = text(value);
  if (!normalized || normalized.length > 240) throw errors.validation(`${field} must be non-empty and at most 240 characters`);
  return normalized;
}

function optionalCandidateText(value: unknown): string | undefined {
  const normalized = text(value);
  return normalized || undefined;
}

function copyText(target: ResolvedInventoryScanCandidate, key: keyof ResolvedInventoryScanCandidate, value: unknown): void {
  const normalized = optionalCandidateText(value);
  if (normalized) (target as Record<string, unknown>)[key] = normalized;
}
