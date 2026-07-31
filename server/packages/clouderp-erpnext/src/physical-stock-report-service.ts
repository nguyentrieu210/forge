import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  buildPhysicalStockPage,
  reconcilePhysicalStockPage,
  type PhysicalStockBalance,
  type PhysicalStockFilters,
  type PhysicalStockLedgerRow,
  type PhysicalStockLineageEvent,
  type PhysicalStockPage,
} from "./physical-stock-read-model.js";

export interface PhysicalStockLedgerQuery {
  tenant_id: string;
  company: string;
}

export interface PhysicalStockLedgerReader {
  list(query: PhysicalStockLedgerQuery): Promise<readonly PhysicalStockLedgerRow[]>;
}

export interface PhysicalStockAccessScope {
  companies: "*" | readonly string[];
  warehouses?: readonly string[];
  warehouse_roles?: readonly string[];
  max_rows?: number;
  can_view_lineage?: boolean;
  can_export?: boolean;
}

export interface PhysicalStockAccessPolicy {
  getScope(actor: Actor, tenantId: string): Promise<PhysicalStockAccessScope>;
}

export interface PhysicalStockReportRequest extends Omit<PhysicalStockFilters, "tenant_id"> {
  include_lineage?: boolean;
}

export interface PhysicalStockReportBalance extends Omit<PhysicalStockBalance, "lineage"> {
  lineage?: PhysicalStockLineageEvent[];
}

export interface PhysicalStockReportPage extends Omit<PhysicalStockPage, "rows"> {
  rows: PhysicalStockReportBalance[];
  lineage_redacted: boolean;
}

export interface PhysicalStockCsvExport {
  filename: string;
  content_type: "text/csv; charset=utf-8";
  content: string;
  row_count: number;
}

/**
 * Authenticated service boundary for Slice D stock reports.
 *
 * The caller supplies the authenticated tenant separately. The request shape has no
 * tenant_id field, and every row returned by the reader is checked again before use.
 */
export class PhysicalStockReportService {
  constructor(
    private readonly reader: PhysicalStockLedgerReader,
    private readonly access: PhysicalStockAccessPolicy,
  ) {}

  async run(
    actor: Actor,
    tenantId: string,
    request: PhysicalStockReportRequest,
  ): Promise<PhysicalStockReportPage> {
    const tenant = requireText(tenantId, "tenantId", 160);
    const company = requireText(request.company, "company", 240);
    const scope = normalizeScope(await this.access.getScope(actor, tenant));
    assertCompanyScope(scope, company);
    assertRequestedScope(scope, request);

    const sourceRows = await this.reader.list({ tenant_id: tenant, company });
    for (const row of sourceRows) {
      if (row.tenant_id !== tenant || row.company !== company) {
        throw errors.misconfigured("Physical stock reader returned data outside the authenticated scope");
      }
    }

    const scopedRows = sourceRows.filter((row) => rowAllowed(scope, row));
    const limit = Math.min(request.limit ?? scope.max_rows, scope.max_rows);
    const page = buildPhysicalStockPage(scopedRows, {
      ...request,
      tenant_id: tenant,
      company,
      limit,
    });
    reconcilePhysicalStockPage(page);

    const showLineage = scope.can_view_lineage && request.include_lineage !== false;
    return {
      ...page,
      rows: page.rows.map((row) => showLineage ? row : redactLineage(row)),
      lineage_redacted: !showLineage,
    };
  }

  async exportCsv(
    actor: Actor,
    tenantId: string,
    request: Omit<PhysicalStockReportRequest, "cursor" | "limit" | "include_lineage">,
  ): Promise<PhysicalStockCsvExport> {
    const tenant = requireText(tenantId, "tenantId", 160);
    const scope = normalizeScope(await this.access.getScope(actor, tenant));
    if (!scope.can_export) throw errors.permission("Physical stock export is not permitted");

    const page = await this.run(actor, tenant, {
      ...request,
      limit: scope.max_rows,
      include_lineage: false,
    });
    if (page.next_cursor) throw errors.validation(`Physical stock export exceeds the ${scope.max_rows} row limit`);

    const fields = [
      "item_code", "warehouse", "warehouse_role", "inventory_mode", "measurement_profile",
      "color", "condition", "generation", "length_micros", "width_micros", "height_micros",
      "thickness_micros", "batch_no", "serial_no", "quantity_micros", "value_micros",
      "physical_count_micros", "first_posting_at", "last_posting_at",
    ];
    return {
      filename: `physical-stock-${safeFilename(request.company)}.csv`,
      content_type: "text/csv; charset=utf-8",
      content: `\uFEFF${encodeCsv(fields, page.rows)}`,
      row_count: page.rows.length,
    };
  }
}

function normalizeScope(input: PhysicalStockAccessScope): Required<PhysicalStockAccessScope> {
  const maxRows = input.max_rows ?? 200;
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 500) {
    throw errors.misconfigured("Physical stock access max_rows must be from 1 to 500");
  }
  return {
    companies: input.companies,
    warehouses: uniqueText(input.warehouses ?? []),
    warehouse_roles: uniqueText(input.warehouse_roles ?? []),
    max_rows: maxRows,
    can_view_lineage: input.can_view_lineage === true,
    can_export: input.can_export === true,
  };
}

function assertCompanyScope(scope: Required<PhysicalStockAccessScope>, company: string): void {
  if (scope.companies !== "*" && !scope.companies.includes(company)) {
    throw errors.permission("Physical stock company scope is not permitted");
  }
}

function assertRequestedScope(
  scope: Required<PhysicalStockAccessScope>,
  request: PhysicalStockReportRequest,
): void {
  if (request.warehouse && scope.warehouses.length && !scope.warehouses.includes(request.warehouse)) {
    throw errors.permission("Physical stock warehouse scope is not permitted");
  }
  if (request.warehouse_role && scope.warehouse_roles.length && !scope.warehouse_roles.includes(request.warehouse_role)) {
    throw errors.permission("Physical stock warehouse role scope is not permitted");
  }
  if (request.limit !== undefined && (!Number.isSafeInteger(request.limit) || request.limit < 1)) {
    throw errors.validation("Physical stock limit must be a positive integer");
  }
}

function rowAllowed(scope: Required<PhysicalStockAccessScope>, row: PhysicalStockLedgerRow): boolean {
  return (!scope.warehouses.length || scope.warehouses.includes(row.warehouse))
    && (!scope.warehouse_roles.length || scope.warehouse_roles.includes(text(row.warehouse_role)));
}

function redactLineage(row: PhysicalStockBalance): PhysicalStockReportBalance {
  const { lineage: _lineage, ...safe } = row;
  return safe;
}

function uniqueText(values: readonly string[]): string[] {
  const output = new Set<string>();
  for (const value of values) {
    const normalized = text(value);
    if (normalized) output.add(normalized);
  }
  return [...output];
}

function encodeCsv(fields: string[], rows: PhysicalStockReportBalance[]): string {
  const escape = (value: unknown): string => {
    const raw = value === undefined || value === null ? "" : String(value);
    const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [
    fields.map(escape).join(","),
    ...rows.map((row) => fields.map((field) => escape(row[field as keyof PhysicalStockReportBalance])).join(",")),
  ].join("\r\n");
}

function requireText(value: unknown, field: string, max: number): string {
  const normalized = text(value);
  if (!normalized || normalized.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
  return normalized;
}

function safeFilename(value: string): string {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 120);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
