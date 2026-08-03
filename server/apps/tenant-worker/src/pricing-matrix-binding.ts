import type { Actor, CanonicalDocument, JsonObject, JsonValue } from "../../../packages/contracts/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import type { DocumentListService, D1MutationStore } from "../../../packages/document-kernel/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import {
  PRICING_MATRIX_COMMIT_ACTION,
  PRICING_MATRIX_SOURCE,
  PRICING_PRICE_LIST_CREATE_ACTION,
  commitItemPriceMatrix,
  createPriceList,
  readItemPriceMatrix,
  type ItemPriceMatrixCommitInput,
  type ItemPriceMatrixReadResult,
  type PricingMatrixAuthorityContext,
  type PricingMatrixPermissionAction,
  type PricingMatrixRecord,
} from "../../../packages/clouderp-pricing/src/matrix.js";
import type { MatrixSourceActionRegistry } from "./matrix-api.js";

const PAGE_SIZE = 100;
const FRAMEWORK_FIELDS = new Set(["name", "version", "modified_at", "owner", "status", "docstatus", "created_at"]);

const LIST_FIELDS: Record<string, string[]> = {
  "Price List": ["name", "version", "modified_at", "price_list_name", "currency", "effective_date", "disabled"],
  "Item Group": ["name", "version", "modified_at", "item_group_name", "parent_item_group", "is_group"],
  Item: ["name", "version", "modified_at", "item_name", "item_group", "stock_uom", "default_purchase_uom", "default_sales_uom", "disabled"],
  UOM: ["name", "version", "modified_at", "uom_name", "disabled"],
  "Item Price": ["name", "version", "modified_at", "price_list", "item_code", "uom", "rate", "currency", "disabled"],
  Currency: ["name", "version", "modified_at", "currency_scale", "disabled"],
};

export interface PricingMatrixBindingContext {
  tenantId: string;
  actor: Actor;
  permissions: Pick<MetadataPermissionService, "assert" | "getReadScope">;
  documents: Pick<D1MutationStore, "getDocument">;
  listService: Pick<DocumentListService, "list">;
  createDocument(input: {
    doctype: string;
    document: JsonObject;
    idempotencyKey: string;
  }): Promise<PricingMatrixRecord>;
  updateDocument(input: {
    doctype: string;
    name: string;
    expectedVersion: number;
    patch: JsonObject;
    idempotencyKey: string;
  }): Promise<PricingMatrixRecord>;
}

/** Registers the first domain reference without teaching the generic Matrix bridge any pricing nouns. */
export function registerPricingMatrixBindings(
  registry: MatrixSourceActionRegistry,
  binding: PricingMatrixBindingContext,
): MatrixSourceActionRegistry {
  const authority = pricingAuthority(binding);
  registry.registerSource(PRICING_MATRIX_SOURCE, async (input) => {
    const result = await readItemPriceMatrix(authority, readInput(input));
    return genericSnapshot(result);
  });
  registry.registerAction(PRICING_MATRIX_COMMIT_ACTION, async (input) => {
    return await commitItemPriceMatrix(authority, commitInput(input));
  });
  registry.registerAction(PRICING_PRICE_LIST_CREATE_ACTION, async (input) => {
    return await createPriceList(authority, {
      requestId: requiredText(input.request_id ?? input.requestId, "request_id"),
      name: requiredText(input.name, "name"),
      currency: requiredText(input.currency, "currency"),
      ...(optionalText(input.effective_date ?? input.effectiveDate) ? { effectiveDate: optionalText(input.effective_date ?? input.effectiveDate)! } : {}),
    });
  });
  return registry;
}

function pricingAuthority(binding: PricingMatrixBindingContext): PricingMatrixAuthorityContext {
  return {
    tenantId: binding.tenantId,
    actor: binding.actor,
    records: {
      get: async ({ doctype, name }) => await getRecord(binding, doctype, name),
      list: async (query) => await listRecords(binding, query.doctype, {
        filters: query.filters,
        search: query.search,
        limit: query.limit,
        cursor: query.cursor,
      }),
    },
    permissions: {
      assert: async ({ doctype, action, name }) => assertPermission(binding, doctype, action, name),
      can: async ({ doctype, action, name }) => {
        try { await assertPermission(binding, doctype, action, name); return true; }
        catch { return false; }
      },
    },
    mutations: {
      create: async ({ doctype, document, idempotencyKey }) => ({
        record: await binding.createDocument({ doctype, document, idempotencyKey }),
      }),
      update: async ({ doctype, name, expectedVersion, patch, idempotencyKey }) => ({
        record: await binding.updateDocument({ doctype, name, expectedVersion, patch, idempotencyKey }),
      }),
    },
  };
}

async function getRecord(
  binding: PricingMatrixBindingContext,
  doctype: string,
  name: string,
): Promise<PricingMatrixRecord | null> {
  const document = await binding.documents.getDocument<JsonObject>(binding.tenantId, doctype, name);
  if (!document) return null;
  await binding.permissions.assert({
    actor: binding.actor,
    tenantId: binding.tenantId,
    doctype,
    name,
    owner: document.owner,
    data: hydratedData(document),
    action: "read",
  });
  return canonicalRecord(document);
}

async function listRecords(
  binding: PricingMatrixBindingContext,
  doctype: string,
  options: { filters?: Record<string, JsonValue>; search?: string; limit: number; cursor?: string },
): Promise<{ rows: PricingMatrixRecord[]; nextCursor?: string }> {
  const fields = LIST_FIELDS[doctype];
  if (!fields) throw errors.misconfigured(`Pricing Matrix list projection is not declared for ${doctype}`);
  const target = Math.max(1, Math.min(Number(options.limit) || PAGE_SIZE, 5_000));
  const rows: PricingMatrixRecord[] = [];
  let cursor = optionalText(options.cursor) ?? null;
  let nextCursor: string | undefined;

  while (rows.length < target) {
    const limit = Math.min(PAGE_SIZE, target - rows.length);
    const page = await binding.listService.list(binding.actor, binding.tenantId, {
      doctype,
      fields,
      ...(options.filters ? {
        filters: Object.entries(options.filters).map(([field, value]) => ({ field, operator: "eq", value })) as unknown as JsonValue,
      } : {}),
      ...(optionalText(options.search) ? { search: optionalText(options.search)! } : {}),
      limit,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...page.rows.map(listRowRecord));
    nextCursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    if (!nextCursor || page.rows.length === 0) break;
    cursor = nextCursor;
  }
  return { rows, ...(nextCursor ? { nextCursor } : {}) };
}

async function assertPermission(
  binding: PricingMatrixBindingContext,
  doctype: string,
  action: PricingMatrixPermissionAction,
  name?: string,
): Promise<void> {
  const mapped = action === "write" ? "save" : action;
  if (action === "read" && !name) {
    await binding.permissions.getReadScope(binding.actor, binding.tenantId, doctype);
    return;
  }
  if (name) {
    const document = await binding.documents.getDocument<JsonObject>(binding.tenantId, doctype, name);
    if (!document) throw errors.notFound(`${doctype} ${name} was not found`);
    await binding.permissions.assert({
      actor: binding.actor,
      tenantId: binding.tenantId,
      doctype,
      name,
      owner: document.owner,
      data: hydratedData(document),
      action: mapped,
    });
    return;
  }
  await binding.permissions.assert({
    actor: binding.actor,
    tenantId: binding.tenantId,
    doctype,
    action: mapped,
    owner: binding.actor.user_id,
  });
}

function canonicalRecord(document: CanonicalDocument<JsonObject>): PricingMatrixRecord {
  return {
    name: document.name,
    version: document.version,
    modifiedAt: document.modified_at,
    data: hydratedData(document),
  };
}

function hydratedData(document: CanonicalDocument<JsonObject>): JsonObject {
  const data: JsonObject = { ...document.data };
  const byField = new Map<string, JsonObject[]>();
  for (const child of [...document.children].sort((left, right) => left.idx - right.idx)) {
    const rows = byField.get(child.fieldname) ?? [];
    rows.push({
      name: child.row_id,
      doctype: child.child_doctype,
      idx: child.idx,
      ...child.data,
    });
    byField.set(child.fieldname, rows);
  }
  for (const [fieldname, rows] of byField) data[fieldname] = rows;
  return data;
}

function listRowRecord(row: Record<string, JsonValue>): PricingMatrixRecord {
  const name = requiredText(row.name, "record name");
  const version = integer(row.version, `version for ${name}`);
  const modifiedAt = requiredText(row.modified_at, `modified_at for ${name}`);
  const data: JsonObject = {};
  for (const [key, value] of Object.entries(row)) {
    if (!FRAMEWORK_FIELDS.has(key)) data[key] = value;
  }
  return { name, version, modifiedAt, data };
}

function readInput(input: JsonObject) {
  const search = isObject(input.search) ? input.search : undefined;
  const scope = optionalText(search?.scope);
  const query = optionalText(search?.query);
  return {
    ...(optionalText(input.selected_id ?? input.item_code) ? { itemCode: optionalText(input.selected_id ?? input.item_code)! } : {}),
    ...(query && (scope === "navigator" || scope === "rows") ? { itemSearch: query } : {}),
    ...(optionalText(input.item_group) ? { itemGroup: optionalText(input.item_group)! } : {}),
    ...(input.limit !== undefined ? { itemLimit: positiveInteger(input.limit, "limit") } : {}),
    ...(optionalText(input.cursor) ? { itemCursor: optionalText(input.cursor)! } : {}),
  };
}

/** Convert pricing-owned nouns into the renderer's business-neutral Matrix snapshot. */
function genericSnapshot(result: ItemPriceMatrixReadResult): JsonObject {
  const selected = result.selected_item && isObject(result.selected_item) ? result.selected_item : null;
  const stockUom = selected ? optionalText(selected.stock_uom) ?? "" : "";
  const nodes = navigatorNodes(result.navigation);
  const rows = result.configured_uoms.map((candidate) => {
    const row = isObject(candidate) ? candidate : {};
    const uom = requiredText(row.uom, "configured UOM");
    const factor = row.conversion_factor ?? "";
    return {
      id: uom,
      label: uom,
      is_primary: uom === stockUom,
      values: { conversion_factor: factor, is_primary: uom === stockUom },
    } as JsonObject;
  });
  const columns = result.price_lists.map((price) => ({
    id: price.name,
    label: price.label || price.name,
    subtitle: price.effective_date || price.currency,
    disabled: price.disabled,
    metadata: { currency: price.currency, version: price.version, effective_date: price.effective_date },
  } as JsonObject));
  const disabledColumns = new Set(result.price_lists.filter((price) => price.disabled).map((price) => price.name));
  const cells = result.cells.map((cell) => ({
    row_id: cell.uom,
    column_id: cell.price_list,
    value: cell.rate,
    enabled: !cell.disabled,
    read_only: disabledColumns.has(cell.price_list),
    record_id: cell.name,
    version: cell.version,
    metadata: { currency: cell.currency },
  } as JsonObject));
  const recordVersions: JsonObject = {};
  for (const cell of result.cells) recordVersions[cell.name] = cell.version;
  const capabilities = isObject(result.capabilities) ? result.capabilities : {};

  return {
    contract_version: 1,
    source: PRICING_MATRIX_SOURCE,
    action: PRICING_MATRIX_COMMIT_ACTION,
    subject: selected ? {
      id: requiredText(selected.name, "selected item"),
      label: optionalText(selected.item_name) ?? requiredText(selected.name, "selected item"),
      subtitle: [optionalText(selected.item_group), optionalText(selected.stock_uom)].filter(Boolean).join(" · "),
      version: integer(selected.version, "selected item version"),
    } : null,
    navigator: {
      label: "Danh mục",
      nodes,
      ...(selected ? { selected_id: requiredText(selected.name, "selected item") } : {}),
      ...(isObject(result.navigation) && optionalText(result.navigation.next_cursor) ? { next_cursor: optionalText(result.navigation.next_cursor)! } : {}),
    },
    rows,
    columns,
    cells,
    available_rows: result.available_uoms.map((candidate) => isObject(candidate) ? candidate : {}),
    record_versions: recordVersions,
    capabilities: {
      save: Boolean(capabilities.commit),
      remove_row: Boolean(capabilities.update_item_uom),
      create_row: Boolean(capabilities.update_item_uom),
      create_column: Boolean(capabilities.create_price_list),
    },
  };
}

function navigatorNodes(navigation: JsonObject): JsonObject[] {
  const groups = Array.isArray(navigation.groups) ? navigation.groups.filter(isObject) : [];
  const items = Array.isArray(navigation.items) ? navigation.items.filter(isObject) : [];
  const byParent = new Map<string, JsonObject[]>();
  const groupNames = new Set(groups.map((group) => requiredText(group.name, "item group")));

  for (const group of groups) {
    const name = requiredText(group.name, "item group");
    const parent = optionalText(group.parent_item_group);
    const key = parent && groupNames.has(parent) ? parent : "";
    const children = byParent.get(key) ?? [];
    children.push({ id: `group:${name}`, label: optionalText(group.label) ?? name, selectable: false, group_name: name });
    byParent.set(key, children);
  }
  for (const item of items) {
    const group = optionalText(item.item_group) ?? "";
    const children = byParent.get(group) ?? [];
    const name = requiredText(item.name, "item");
    children.push({
      id: name,
      label: optionalText(item.item_name) ?? name,
      subtitle: optionalText(item.stock_uom) ?? "",
      selectable: true,
      disabled: Boolean(item.disabled),
    });
    byParent.set(group, children);
  }

  const buildGroup = (node: JsonObject): JsonObject => {
    const groupName = requiredText(node.group_name, "group_name");
    const children = (byParent.get(groupName) ?? []).map((child) => optionalText(child.group_name) ? buildGroup(child) : child);
    const output = { ...node, ...(children.length ? { children } : {}) };
    delete output.group_name;
    return output;
  };
  return (byParent.get("") ?? []).map((node) => optionalText(node.group_name) ? buildGroup(node) : node);
}

function commitInput(input: JsonObject): ItemPriceMatrixCommitInput {
  const cells = arrayObjects(input.cells, "cells");
  const rowChanges = arrayObjects(input.row_changes, "row_changes");
  const versions = isObject(input.record_versions) ? input.record_versions : {};
  const itemPriceVersions: Record<string, number> = {};
  for (const [name, version] of Object.entries(versions)) itemPriceVersions[name] = integer(version, `record_versions.${name}`);
  return {
    requestId: requiredText(input.request_id ?? input.requestId, "request_id"),
    itemCode: requiredText(input.subject_id ?? input.itemCode, "subject_id"),
    ...(input.subject_version !== undefined ? { itemVersion: integer(input.subject_version, "subject_version") } : {}),
    itemPriceVersions,
    upsertUoms: rowChanges.map((row, index) => {
      const values = isObject(row.values) ? row.values : {};
      return {
        uom: requiredText(row.row_id, `row_changes[${index}].row_id`),
        conversionFactor: requiredScalar(values.conversion_factor, `row_changes[${index}].values.conversion_factor`),
      };
    }),
    removeUoms: stringArray(input.row_removals, "row_removals"),
    prices: cells.map((cell, index) => ({
      priceList: requiredText(cell.column_id, `cells[${index}].column_id`),
      uom: requiredText(cell.row_id, `cells[${index}].row_id`),
      enabled: Boolean(cell.enabled),
      ...(cell.enabled ? { rate: requiredScalar(cell.value, `cells[${index}].value`) } : {}),
      ...(optionalText(cell.record_id) ? { recordName: optionalText(cell.record_id)! } : {}),
    })),
  };
}

function arrayObjects(value: JsonValue | undefined, field: string): JsonObject[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => !isObject(entry))) throw errors.validation(`${field} must be an array of objects`);
  return value as JsonObject[];
}

function stringArray(value: JsonValue | undefined, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw errors.validation(`${field} must be an array`);
  return value.map((entry, index) => requiredText(entry, `${field}[${index}]`));
}

function requiredScalar(value: JsonValue | undefined, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be a string or number`);
  return value;
}

function integer(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw errors.validation(`${field} must be a non-negative integer`);
  return parsed;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = integer(value, field);
  if (parsed < 1) throw errors.validation(`${field} must be greater than zero`);
  return parsed;
}

function requiredText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).normalize("NFC").trim();
  return normalized || undefined;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
