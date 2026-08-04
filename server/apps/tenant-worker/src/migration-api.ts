import type { Actor, JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse } from "../../../packages/core/src/index.js";
import { D1MutationStore } from "../../../packages/document-kernel/src/index.js";
import { buildCommand } from "../../../packages/frappe-api/src/index.js";
import {
  D1DocumentAccessStore,
  D1MetadataStore,
  MetadataPermissionService,
  parseCsvImport,
} from "../../../packages/frappe-model/src/index.js";
import {
  buildMigrationPlan,
  D1MigrationJournal,
  executeDurableMigrationPlan,
  KernelMigrationApplyPort,
  type MigrationDuplicatePolicy,
  type MigrationPlannedRow,
} from "../../../packages/migration/src/public.js";

const IMPORT_APPLY_PATH = "/api/v1/import/apply";
const DUPLICATE_POLICIES = new Set<MigrationDuplicatePolicy>(["error", "skip", "update"]);

export interface MigrationApiContext {
  db: D1Database;
  tenantId: string;
  actor: Actor;
  traceId: string;
  runCommand(command: MutationCommand): Promise<MutationReceipt>;
}

export function isMigrationApiPath(pathname: string): boolean {
  return pathname === IMPORT_APPLY_PATH;
}

/**
 * Durable native CSV import seam.
 *
 * This replaces the main entrypoint's old row loop without creating another business
 * write authority. Planning/retry/recovery live in WS13; every document mutation still
 * returns to the canonical command endpoint supplied through `runCommand`.
 */
export async function routeMigrationApi(
  request: Request,
  url: URL,
  context: MigrationApiContext,
): Promise<Response | null> {
  if (!isMigrationApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") throw errors.validation("Import apply accepts POST");

  const doctype = url.searchParams.get("doctype")?.trim() ?? "";
  if (!doctype) throw errors.validation("doctype is required");
  const duplicatePolicy = parseDuplicatePolicy(url.searchParams.get("duplicate_policy"));
  const keyField = url.searchParams.get("key_field")?.trim() ?? "";
  if (keyField && keyField !== "name") {
    throw errors.validation("Native CSV import currently supports only name as key_field");
  }

  const sourceId = (
    url.searchParams.get("source_id")?.trim()
    || request.headers.get("x-forge-migration-source-id")?.trim()
    || `native-csv:${doctype}`
  );

  const metadata = new D1MetadataStore(context.db);
  const access = new D1DocumentAccessStore(context.db);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const documents = new D1MutationStore(context.db);

  await permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "import" });
  await permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "create" });
  const meta = await metadata.getDocType(context.tenantId, doctype);
  if (!meta || meta.is_child) throw errors.validation("Import requires an executable DocType");

  const preview = parseCsvImport(await readBoundedBodyText(request, 5_000_000), 100);
  if (preview.errors.length) {
    throw errors.validation("CSV contains invalid rows", { error_count: preview.errors.length });
  }
  if (duplicatePolicy !== "error" && !preview.headers.includes("name")) {
    throw errors.validation(`${duplicatePolicy} duplicate policy requires a name column`);
  }

  // Keep unknown-column failure row-local, matching the historical apply endpoint. The
  // migration plan may therefore carry the source headers; `coerceImportRow` remains the
  // authoritative field-shape preflight before a command is prepared.
  const targetFields = [...new Set([
    "name",
    ...meta.fields.map((field) => field.fieldname),
    ...preview.headers,
  ])];
  const plan = await buildMigrationPlan({
    source_id: sourceId,
    source_kind: "csv",
    target_doctype: doctype,
    headers: preview.headers,
    rows: preview.rows,
    target_fields: targetFields,
    duplicate_policy: duplicatePolicy,
    ...(keyField ? { key_field: keyField } : {}),
  });

  const journal = new D1MigrationJournal(context.db);
  const port = new KernelMigrationApplyPort({
    async lookup(_plan, row) {
      const targetName = rowTargetName(row);
      if (!targetName) return { exists: false };
      const existing = await documents.getDocument(context.tenantId, doctype, targetName);
      return existing ? { exists: true, target_name: targetName } : { exists: false };
    },

    async prepareCreate(_plan, row) {
      const document = coerceImportRow(row.document, meta.fields);
      let name = text(document.name);
      delete document.name;
      if (!name) {
        if (!meta.autoname) {
          throw errors.validation(`Row ${row.row_number} requires name because ${doctype} has no autoname`);
        }
        if (meta.autoname === "field:name") {
          throw errors.validation(`Row ${row.row_number} requires name for field:name autoname`);
        }
        name = await metadata.nextName(context.tenantId, doctype, meta.autoname, new Date().toISOString(), document);
      }
      return buildCommand({
        tenantId: context.tenantId,
        actor: context.actor,
        doctype,
        name,
        action: "create",
        expectedVersion: null,
        document,
      });
    },

    async prepareUpdate(_plan, row, targetName) {
      const current = await documents.getDocument(context.tenantId, doctype, targetName);
      if (!current) throw errors.version();
      await permissions.assert({
        actor: context.actor,
        tenantId: context.tenantId,
        doctype,
        name: current.name,
        owner: current.owner,
        data: current.data,
        action: "save",
      });
      const changes = coerceImportRow(row.document, meta.fields);
      delete changes.name;
      return buildCommand({
        tenantId: context.tenantId,
        actor: context.actor,
        doctype,
        name: current.name,
        action: "save",
        expectedVersion: current.version,
        document: { ...current.data, ...changes },
      });
    },

    runCommand: context.runCommand,
  });

  const summary = await executeDurableMigrationPlan({
    tenant_id: context.tenantId,
    actor: context.actor.user_id,
    now: () => new Date().toISOString(),
    plan,
    journal,
    port,
  });

  const rowNumbers = new Map(plan.rows.map((row) => [row.row_key, row.row_number]));
  const results = summary.outcomes.map((outcome) => ({
    row: rowNumbers.get(outcome.row_key) ?? null,
    ...(outcome.target_name ? { name: outcome.target_name } : {}),
    status: outcome.status,
    ...(outcome.error ? { error: { code: "MIGRATION_ROW_FAILED", message: outcome.error } } : {}),
  }));

  return jsonResponse({
    run_id: summary.run_id,
    imported: summary.imported,
    updated: summary.updated,
    skipped: summary.skipped,
    failed: summary.failed,
    recovered_from_receipt: summary.recovered_from_receipt,
    results,
  }, summary.failed ? 207 : 201, { "x-cloudforge-trace-id": context.traceId });
}

function parseDuplicatePolicy(raw: string | null): MigrationDuplicatePolicy {
  const policy = (raw?.trim().toLowerCase() || "error") as MigrationDuplicatePolicy;
  if (!DUPLICATE_POLICIES.has(policy)) {
    throw errors.validation("duplicate_policy must be error, skip or update");
  }
  return policy;
}

function rowTargetName(row: MigrationPlannedRow): string {
  return text(row.document.name);
}

function coerceImportRow(
  row: JsonObject,
  fields: Array<{ fieldname: string; fieldtype: string }>,
): JsonObject {
  const output: JsonObject = {};
  const types = new Map(fields.map((field) => [field.fieldname, field.fieldtype]));
  for (const [key, raw] of Object.entries(row)) {
    if (key === "name") {
      output.name = String(raw ?? "");
      continue;
    }
    const type = types.get(key);
    if (!type) throw errors.validation(`Unknown import column ${key}`);
    const value = String(raw ?? "").trim();
    if (value === "") continue;
    if (type === "Int") {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) throw errors.validation(`${key} must be an integer`);
      output[key] = parsed;
    } else if (type === "Check") {
      if (!["0", "1", "true", "false", "yes", "no"].includes(value.toLowerCase())) {
        throw errors.validation(`${key} must be a boolean`);
      }
      output[key] = ["1", "true", "yes"].includes(value.toLowerCase());
    } else if (["Table", "Table MultiSelect", "JSON"].includes(type)) {
      try {
        output[key] = JSON.parse(value) as JsonObject;
      } catch {
        throw errors.validation(`${key} must contain valid JSON`);
      }
    } else {
      output[key] = value;
    }
  }
  return output;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

async function readBoundedBodyText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw errors.validation("Request body exceeds size limit");
  if (!request.body) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw errors.validation("Request body exceeds size limit");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
