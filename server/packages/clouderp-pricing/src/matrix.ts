import type { Actor, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { CloudForgeError, errors, sha256Hex } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";

export const PRICING_MATRIX_SOURCE = "pricing.item_price_matrix.read";
export const PRICING_MATRIX_COMMIT_ACTION = "pricing.item_price_matrix.commit";
export const PRICING_PRICE_LIST_CREATE_ACTION = "pricing.price_list.create";

export type PricingMatrixPermissionAction = "read" | "create" | "write";

export interface PricingMatrixRecord {
  name: string;
  version: number;
  modifiedAt: string;
  data: JsonObject;
}

export interface PricingMatrixRecordPage {
  rows: PricingMatrixRecord[];
  nextCursor?: string;
}

export interface PricingMatrixRecordQuery {
  tenantId: string;
  actor: Actor;
  doctype: string;
  filters?: Record<string, JsonValue>;
  search?: string;
  limit: number;
  cursor?: string;
}

/**
 * Permission-aware, tenant-bound query boundary supplied by the platform/API layer.
 * Implementations must never trust a tenant or actor supplied by a renderer and must
 * apply row-level/read-scope rules before returning records.
 */
export interface PricingMatrixRecordPort {
  get(input: { tenantId: string; actor: Actor; doctype: string; name: string }): Promise<PricingMatrixRecord | null>;
  list(input: PricingMatrixRecordQuery): Promise<PricingMatrixRecordPage>;
}

export interface PricingMatrixPermissionPort {
  assert(input: {
    tenantId: string;
    actor: Actor;
    doctype: string;
    action: PricingMatrixPermissionAction;
    name?: string;
  }): Promise<void>;
  can(input: {
    tenantId: string;
    actor: Actor;
    doctype: string;
    action: PricingMatrixPermissionAction;
    name?: string;
  }): Promise<boolean>;
}

export interface PricingMatrixMutationReceipt {
  record: PricingMatrixRecord;
  replayed?: boolean;
}

/**
 * The mutation adapter must route writes through the canonical Document kernel.
 * `update` is PATCH-shaped at this boundary but the adapter is responsible for
 * reloading/merging the complete authoritative document before issuing a kernel
 * command. `idempotencyKey` must be enforced against payload reuse.
 */
export interface PricingMatrixMutationPort {
  create(input: {
    tenantId: string;
    actor: Actor;
    doctype: string;
    document: JsonObject;
    idempotencyKey: string;
  }): Promise<PricingMatrixMutationReceipt>;
  update(input: {
    tenantId: string;
    actor: Actor;
    doctype: string;
    name: string;
    expectedVersion: number;
    patch: JsonObject;
    idempotencyKey: string;
  }): Promise<PricingMatrixMutationReceipt>;
}

export interface PricingMatrixAuthorityContext {
  tenantId: string;
  actor: Actor;
  records: PricingMatrixRecordPort;
  permissions: PricingMatrixPermissionPort;
  mutations: PricingMatrixMutationPort;
}

export interface ItemPriceMatrixReadInput {
  itemCode?: string;
  itemSearch?: string;
  itemGroup?: string;
  itemLimit?: number;
  itemCursor?: string;
}

export interface ItemPriceMatrixPriceListAxis extends JsonObject {
  name: string;
  label: string;
  currency: string;
  effective_date: string;
  disabled: boolean;
  version: number;
  modified_at: string;
}

export interface ItemPriceMatrixCell extends JsonObject {
  name: string;
  price_list: string;
  uom: string;
  rate: string;
  currency: string;
  disabled: boolean;
  version: number;
  modified_at: string;
}

export interface ItemPriceMatrixReadResult extends JsonObject {
  contract_version: 1;
  source: typeof PRICING_MATRIX_SOURCE;
  price_lists: ItemPriceMatrixPriceListAxis[];
  navigation: JsonObject;
  selected_item: JsonObject | null;
  configured_uoms: JsonObject[];
  available_uoms: JsonObject[];
  cells: ItemPriceMatrixCell[];
  occ: JsonObject;
  capabilities: JsonObject;
}

export interface ItemPriceMatrixUomUpsert {
  uom: string;
  conversionFactor: string | number;
}

export interface ItemPriceMatrixPriceChange {
  priceList: string;
  uom: string;
  enabled: boolean;
  rate?: string | number;
  recordName?: string;
}

export interface ItemPriceMatrixCommitInput {
  requestId: string;
  itemCode: string;
  itemVersion?: number;
  itemPriceVersions?: Record<string, number>;
  upsertUoms?: ItemPriceMatrixUomUpsert[];
  removeUoms?: string[];
  prices?: ItemPriceMatrixPriceChange[];
}

export interface PricingMatrixOperation extends JsonObject {
  id: string;
  doctype: string;
  name: string;
  effect: "created" | "updated" | "unchanged";
  version?: number;
}

export interface ItemPriceMatrixCommitResult extends JsonObject {
  contract_version: 1;
  action: typeof PRICING_MATRIX_COMMIT_ACTION;
  request_id: string;
  item_code: string;
  consistency: "preflight_then_ordered_idempotent";
  operations: PricingMatrixOperation[];
}

export interface CreatePriceListInput {
  requestId: string;
  name: string;
  currency: string;
  effectiveDate?: string;
}

const MAX_PRICE_LISTS = 200;
const MAX_GROUPS = 500;
const MAX_UOMS = 500;
const MAX_ITEM_PRICES = 2_000;
const DEFAULT_ITEM_LIMIT = 100;
const MAX_ITEM_LIMIT = 200;
const UOM_SCALE = 6;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function bool(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

function isDisabled(data: JsonObject): boolean {
  if (data.disabled !== undefined) return bool(data.disabled);
  if (data.enabled !== undefined) return !bool(data.enabled);
  return false;
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function assertRequestId(value: string): string {
  const requestId = text(value);
  if (!requestId || requestId.length > 160) throw errors.validation("pricing matrix requestId is required and must be at most 160 characters");
  return requestId;
}

function assertName(value: string, field: string): string {
  const name = text(value);
  if (!name) throw errors.validation(`${field} is required`);
  if (name.length > 320) throw errors.validation(`${field} is too long`);
  return name;
}

async function assertPermission(
  context: PricingMatrixAuthorityContext,
  doctype: string,
  action: PricingMatrixPermissionAction,
  name?: string,
): Promise<void> {
  await context.permissions.assert({
    tenantId: context.tenantId,
    actor: context.actor,
    doctype,
    action,
    ...(name ? { name } : {}),
  });
}

async function can(
  context: PricingMatrixAuthorityContext,
  doctype: string,
  action: PricingMatrixPermissionAction,
): Promise<boolean> {
  return await context.permissions.can({ tenantId: context.tenantId, actor: context.actor, doctype, action });
}

async function getRecord(
  context: PricingMatrixAuthorityContext,
  doctype: string,
  name: string,
): Promise<PricingMatrixRecord | null> {
  return await context.records.get({ tenantId: context.tenantId, actor: context.actor, doctype, name });
}

async function listRecords(
  context: PricingMatrixAuthorityContext,
  doctype: string,
  options: { filters?: Record<string, JsonValue>; search?: string; limit: number; cursor?: string },
): Promise<PricingMatrixRecordPage> {
  return await context.records.list({
    tenantId: context.tenantId,
    actor: context.actor,
    doctype,
    limit: options.limit,
    ...(options.filters ? { filters: options.filters } : {}),
    ...(options.search ? { search: options.search } : {}),
    ...(options.cursor ? { cursor: options.cursor } : {}),
  });
}

function configuredUoms(item: PricingMatrixRecord): Array<{ uom: string; conversion_factor: string }> {
  const stockUom = text(item.data.stock_uom);
  const rows = Array.isArray(item.data.uom_conversions) ? item.data.uom_conversions : [];
  const result = new Map<string, string>();
  if (stockUom) result.set(stockUom, "1.000000");
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as JsonObject;
    const uom = text(row.uom);
    if (!uom || uom === stockUom) continue;
    const factor = normalizePositiveFactor(row.conversion_factor, `conversion factor for ${uom}`);
    result.set(uom, factor);
  }
  for (const defaultUom of [text(item.data.default_purchase_uom), text(item.data.default_sales_uom)]) {
    if (defaultUom && !result.has(defaultUom)) result.set(defaultUom, defaultUom === stockUom ? "1.000000" : "");
  }
  return [...result.entries()].map(([uom, conversion_factor]) => ({ uom, conversion_factor }));
}

function normalizePositiveFactor(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const scaled = toScaledInt(value, UOM_SCALE, field);
  if (scaled <= 0) throw errors.validation(`${field} must be greater than zero`);
  return fromScaledInt(scaled, UOM_SCALE);
}

async function currencyScale(context: PricingMatrixAuthorityContext, currency: string): Promise<number> {
  const record = await getRecord(context, "Currency", currency);
  if (!record) throw errors.reference(`Currency ${currency} does not exist`);
  const raw = record.data.currency_scale;
  const scale = typeof raw === "number" ? raw : Number(raw ?? 2);
  if (!Number.isInteger(scale) || scale < 0 || scale > 9) throw errors.validation(`Currency ${currency} has invalid precision`);
  return scale;
}

function normalizeRate(value: unknown, scale: number, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const minor = toScaledInt(value, scale, field);
  if (minor < 0) throw errors.validation(`${field} cannot be negative`);
  return fromScaledInt(minor, scale);
}

function semanticRateEquals(value: unknown, desired: string, scale: number): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  try {
    return toScaledInt(value, scale, "existing price") === toScaledInt(desired, scale, "desired price");
  } catch {
    return false;
  }
}

function itemPriceUom(record: PricingMatrixRecord, legacyUom: string): string {
  return text(record.data.uom) || legacyUom;
}

function itemPriceKey(priceList: string, uom: string): string {
  return `${priceList}\u001f${uom}`;
}

export async function readItemPriceMatrix(
  context: PricingMatrixAuthorityContext,
  input: ItemPriceMatrixReadInput = {},
): Promise<ItemPriceMatrixReadResult> {
  await Promise.all([
    assertPermission(context, "Price List", "read"),
    assertPermission(context, "Item Group", "read"),
    assertPermission(context, "Item", "read"),
    assertPermission(context, "UOM", "read"),
    assertPermission(context, "Item Price", "read"),
  ]);

  const itemLimit = positiveInt(input.itemLimit, DEFAULT_ITEM_LIMIT, MAX_ITEM_LIMIT);
  const itemCode = text(input.itemCode);
  const [priceListsPage, groupsPage, itemsPage, uomsPage] = await Promise.all([
    listRecords(context, "Price List", { limit: MAX_PRICE_LISTS }),
    listRecords(context, "Item Group", { limit: MAX_GROUPS }),
    listRecords(context, "Item", {
      limit: itemLimit,
      ...(text(input.itemSearch) ? { search: text(input.itemSearch) } : {}),
      ...(text(input.itemGroup) ? { filters: { item_group: text(input.itemGroup) } } : {}),
      ...(text(input.itemCursor) ? { cursor: text(input.itemCursor) } : {}),
    }),
    listRecords(context, "UOM", { limit: MAX_UOMS }),
  ]);

  const selectedItem = itemCode ? await getRecord(context, "Item", itemCode) : null;
  if (itemCode && !selectedItem) throw errors.notFound(`Item ${itemCode} does not exist`);
  if (selectedItem) await assertPermission(context, "Item", "read", selectedItem.name);

  const pricesPage = selectedItem
    ? await listRecords(context, "Item Price", { filters: { item_code: selectedItem.name }, limit: MAX_ITEM_PRICES })
    : { rows: [] };
  const legacyUom = selectedItem ? text(selectedItem.data.default_sales_uom) || text(selectedItem.data.stock_uom) : "";

  const priceLists = priceListsPage.rows.map((record) => ({
    name: record.name,
    label: text(record.data.price_list_name) || record.name,
    currency: text(record.data.currency),
    effective_date: text(record.data.effective_date),
    disabled: isDisabled(record.data),
    version: record.version,
    modified_at: record.modifiedAt,
  }));

  const cells = pricesPage.rows.map((record) => ({
    name: record.name,
    price_list: text(record.data.price_list),
    uom: itemPriceUom(record, legacyUom),
    rate: text(record.data.rate),
    currency: text(record.data.currency),
    disabled: isDisabled(record.data),
    version: record.version,
    modified_at: record.modifiedAt,
  }));

  const itemPriceVersions: JsonObject = {};
  for (const cell of cells) itemPriceVersions[cell.name] = cell.version;

  const selected: JsonObject | null = selectedItem ? {
    name: selectedItem.name,
    item_name: text(selectedItem.data.item_name),
    item_group: text(selectedItem.data.item_group),
    stock_uom: text(selectedItem.data.stock_uom),
    default_purchase_uom: text(selectedItem.data.default_purchase_uom),
    default_sales_uom: text(selectedItem.data.default_sales_uom),
    version: selectedItem.version,
    modified_at: selectedItem.modifiedAt,
  } : null;

  return {
    contract_version: 1,
    source: PRICING_MATRIX_SOURCE,
    price_lists: priceLists,
    navigation: {
      groups: groupsPage.rows.map((record) => ({
        name: record.name,
        label: text(record.data.item_group_name) || record.name,
        parent_item_group: text(record.data.parent_item_group),
        is_group: bool(record.data.is_group),
      })),
      items: itemsPage.rows.map((record) => ({
        name: record.name,
        item_name: text(record.data.item_name) || record.name,
        item_group: text(record.data.item_group),
        stock_uom: text(record.data.stock_uom),
        disabled: isDisabled(record.data),
      })),
      ...(itemsPage.nextCursor ? { next_cursor: itemsPage.nextCursor } : {}),
    },
    selected_item: selected,
    configured_uoms: selectedItem ? configuredUoms(selectedItem) : [],
    available_uoms: uomsPage.rows
      .filter((record) => !isDisabled(record.data))
      .map((record) => ({ name: record.name, label: text(record.data.uom_name) || record.name })),
    cells,
    occ: {
      ...(selectedItem ? { item_version: selectedItem.version } : {}),
      item_price_versions: itemPriceVersions,
    },
    capabilities: await Promise.all([
      can(context, "Item", "write"),
      can(context, "Item Price", "write"),
      can(context, "Item Price", "create"),
      can(context, "Price List", "create"),
    ]).then(([updateItemUom, updateItemPrice, createItemPrice, createPriceList]) => ({
      commit: updateItemUom || updateItemPrice || createItemPrice,
      update_item_uom: updateItemUom,
      update_item_price: updateItemPrice,
      create_item_price: createItemPrice,
      create_price_list: createPriceList,
    })),
  };
}

interface PreparedOperation {
  id: string;
  idempotencyKey: string;
  doctype: string;
  name: string;
  effect: "create" | "update" | "unchanged";
  expectedVersion?: number;
  document?: JsonObject;
  patch?: JsonObject;
}

async function pricingIdempotencyKey(requestId: string, ...parts: string[]): Promise<string> {
  return `pricing:${await sha256Hex({ request_id: requestId, operation: parts })}`;
}

function operationResult(operation: PreparedOperation, record?: PricingMatrixRecord): PricingMatrixOperation {
  return {
    id: operation.id,
    doctype: operation.doctype,
    name: record?.name ?? operation.name,
    effect: operation.effect === "create" ? "created" : operation.effect === "update" ? "updated" : "unchanged",
    ...(record ? { version: record.version } : {}),
  };
}

function assertExpectedVersion(
  current: PricingMatrixRecord,
  expectedVersions: Record<string, number>,
  desiredAlreadyApplied: boolean,
): number {
  const expected = expectedVersions[current.name];
  if (desiredAlreadyApplied) return current.version;
  if (!Number.isInteger(expected)) throw errors.validation(`OCC token is required for Item Price ${current.name}`);
  if (expected !== current.version) throw errors.version(current.version);
  return expected;
}

function sameConversions(current: Array<{ uom: string; conversion_factor: string }>, desired: Map<string, string>, stockUom: string): boolean {
  const currentMap = new Map(current.filter((row) => row.uom !== stockUom).map((row) => [row.uom, row.conversion_factor]));
  if (currentMap.size !== desired.size) return false;
  for (const [uom, factor] of desired) if (currentMap.get(uom) !== factor) return false;
  return true;
}

function partialFailure(error: unknown, applied: PricingMatrixOperation[]): never {
  if (!applied.length) throw error;
  const cause = error instanceof CloudForgeError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof Error ? error.message : "Unknown pricing matrix failure";
  throw new CloudForgeError(
    "PRICING_MATRIX_PARTIAL_FAILURE",
    "Pricing matrix commit stopped after one or more ordered operations were already applied; retry the same requestId to continue safely",
    409,
    true,
    { cause, cause_message: message, applied_operations: applied },
  );
}

export async function commitItemPriceMatrix(
  context: PricingMatrixAuthorityContext,
  input: ItemPriceMatrixCommitInput,
): Promise<ItemPriceMatrixCommitResult> {
  const requestId = assertRequestId(input.requestId);
  const itemCode = assertName(input.itemCode, "itemCode");
  const upsertUoms = input.upsertUoms ?? [];
  const removeUoms = [...new Set((input.removeUoms ?? []).map((value) => assertName(value, "removeUom")))];
  const priceChanges = input.prices ?? [];
  const expectedPriceVersions = input.itemPriceVersions ?? {};

  await assertPermission(context, "Item", "read", itemCode);
  const item = await getRecord(context, "Item", itemCode);
  if (!item) throw errors.notFound(`Item ${itemCode} does not exist`);
  if (isDisabled(item.data)) throw errors.reference(`Item ${itemCode} is disabled`);

  const stockUom = assertName(text(item.data.stock_uom), `Item ${itemCode} stock_uom`);
  const legacyUom = text(item.data.default_sales_uom) || stockUom;
  const currentConfigured = configuredUoms(item);
  const desiredConversions = new Map(
    currentConfigured
      .filter((row) => row.uom !== stockUom && row.conversion_factor)
      .map((row) => [row.uom, row.conversion_factor]),
  );

  for (const uom of removeUoms) {
    if (uom === stockUom) throw errors.validation(`Stock UOM ${stockUom} cannot be removed`);
    desiredConversions.delete(uom);
  }
  for (const change of upsertUoms) {
    const uom = assertName(change.uom, "uom");
    if (uom === stockUom) {
      const factor = normalizePositiveFactor(change.conversionFactor, `conversion factor for ${uom}`);
      if (factor !== "1.000000") throw errors.validation(`Stock UOM ${stockUom} must keep conversion factor 1`);
      continue;
    }
    desiredConversions.set(uom, normalizePositiveFactor(change.conversionFactor, `conversion factor for ${uom}`));
  }

  const uniqueUoms = new Set<string>([...desiredConversions.keys(), ...priceChanges.map((change) => assertName(change.uom, "price uom"))]);
  uniqueUoms.add(stockUom);
  await Promise.all([...uniqueUoms].map(async (uom) => {
    const record = await getRecord(context, "UOM", uom);
    if (!record || isDisabled(record.data)) throw errors.reference(`UOM ${uom} does not exist or is disabled`);
  }));

  const priceListNames = [...new Set(priceChanges.map((change) => assertName(change.priceList, "priceList")))];
  const priceLists = new Map<string, PricingMatrixRecord>();
  await Promise.all(priceListNames.map(async (name) => {
    const record = await getRecord(context, "Price List", name);
    if (!record) throw errors.reference(`Price List ${name} does not exist`);
    priceLists.set(name, record);
  }));

  const existingPricesPage = await listRecords(context, "Item Price", { filters: { item_code: itemCode }, limit: MAX_ITEM_PRICES });
  const byName = new Map(existingPricesPage.rows.map((record) => [record.name, record]));
  const byKey = new Map<string, PricingMatrixRecord[]>();
  for (const record of existingPricesPage.rows) {
    const key = itemPriceKey(text(record.data.price_list), itemPriceUom(record, legacyUom));
    const rows = byKey.get(key) ?? [];
    rows.push(record);
    byKey.set(key, rows);
  }
  for (const [key, rows] of byKey) {
    if (rows.filter((record) => !isDisabled(record.data)).length > 1) {
      throw errors.validation(`Multiple active Item Price records match matrix cell ${key.replace("\u001f", " / ")}`);
    }
  }

  const operations: PreparedOperation[] = [];
  const conversionChanged = !sameConversions(currentConfigured, desiredConversions, stockUom)
    || removeUoms.some((uom) => text(item.data.default_purchase_uom) === uom || text(item.data.default_sales_uom) === uom);
  if (conversionChanged) {
    await assertPermission(context, "Item", "write", itemCode);
    if (!Number.isInteger(input.itemVersion)) throw errors.validation(`OCC token is required for Item ${itemCode}`);
    const targetPatch: JsonObject = {
      uom_conversions: [...desiredConversions.entries()].map(([uom, conversion_factor]) => ({
        uom,
        conversion_factor: Number(conversion_factor),
      })),
    };
    if (removeUoms.includes(text(item.data.default_purchase_uom))) targetPatch.default_purchase_uom = "";
    if (removeUoms.includes(text(item.data.default_sales_uom))) targetPatch.default_sales_uom = "";
    const desiredAlreadyApplied = sameConversions(currentConfigured, desiredConversions, stockUom)
      && (!removeUoms.includes(text(item.data.default_purchase_uom)))
      && (!removeUoms.includes(text(item.data.default_sales_uom)));
    if (!desiredAlreadyApplied && input.itemVersion !== item.version) throw errors.version(item.version);
    operations.push({
      id: `${requestId}:item`,
      idempotencyKey: await pricingIdempotencyKey(requestId, "item", itemCode),
      doctype: "Item",
      name: itemCode,
      effect: desiredAlreadyApplied ? "unchanged" : "update",
      ...(desiredAlreadyApplied ? {} : { expectedVersion: item.version, patch: targetPatch }),
    });
  }

  const explicitKeys = new Set<string>();
  for (const change of priceChanges) {
    const priceList = assertName(change.priceList, "priceList");
    const uom = assertName(change.uom, "price uom");
    const key = itemPriceKey(priceList, uom);
    if (explicitKeys.has(key)) throw errors.validation(`Duplicate price change for ${priceList} / ${uom}`);
    explicitKeys.add(key);
    if (!desiredConversions.has(uom) && uom !== stockUom) throw errors.validation(`UOM ${uom} must be configured on Item ${itemCode} before pricing`);

    const priceListRecord = priceLists.get(priceList)!;
    const currency = assertName(text(priceListRecord.data.currency), `Price List ${priceList} currency`);
    if (isDisabled(priceListRecord.data) && change.enabled) throw errors.validation(`Price List ${priceList} is disabled`);
    const scale = await currencyScale(context, currency);
    const rate = change.enabled ? normalizeRate(change.rate, scale, `price for ${priceList} / ${uom}`) : undefined;

    let current: PricingMatrixRecord | undefined;
    if (change.recordName) {
      current = byName.get(change.recordName);
      if (!current) throw errors.reference(`Item Price ${change.recordName} does not exist for Item ${itemCode}`);
      if (text(current.data.price_list) !== priceList || itemPriceUom(current, legacyUom) !== uom) {
        throw errors.validation(`Item Price ${current.name} does not match ${priceList} / ${uom}`);
      }
    } else {
      const matches = byKey.get(key) ?? [];
      current = matches.find((record) => !isDisabled(record.data)) ?? (matches.length === 1 ? matches[0] : undefined);
      if (!current && matches.length > 1) throw errors.validation(`recordName is required to disambiguate disabled Item Price rows for ${priceList} / ${uom}`);
    }

    if (!current) {
      if (!change.enabled) {
        operations.push({
          id: `${requestId}:price:${priceList}:${uom}`,
          idempotencyKey: await pricingIdempotencyKey(requestId, "price", priceList, itemCode, uom),
          doctype: "Item Price", name: `${priceList}:${itemCode}:${uom}`, effect: "unchanged",
        });
        continue;
      }
      await assertPermission(context, "Item Price", "create");
      operations.push({
        id: `${requestId}:price:${priceList}:${uom}`,
        idempotencyKey: await pricingIdempotencyKey(requestId, "price", priceList, itemCode, uom),
        doctype: "Item Price",
        name: `${priceList}:${itemCode}:${uom}`,
        effect: "create",
        document: { item_code: itemCode, price_list: priceList, uom, currency, rate: rate!, disabled: 0 },
      });
      continue;
    }

    await assertPermission(context, "Item Price", "write", current.name);
    const currentCurrency = text(current.data.currency);
    if (currentCurrency && currentCurrency !== currency) {
      throw errors.validation(`Item Price ${current.name} currency ${currentCurrency} does not match Price List ${priceList} currency ${currency}`);
    }
    const desiredDisabled = !change.enabled;
    const desiredAlreadyApplied = isDisabled(current.data) === desiredDisabled
      && (desiredDisabled || semanticRateEquals(current.data.rate, rate!, scale));
    const expectedVersion = assertExpectedVersion(current, expectedPriceVersions, desiredAlreadyApplied);
    operations.push({
      id: `${requestId}:price:${current.name}`,
      idempotencyKey: await pricingIdempotencyKey(requestId, "price", current.name),
      doctype: "Item Price",
      name: current.name,
      effect: desiredAlreadyApplied ? "unchanged" : "update",
      ...(desiredAlreadyApplied ? {} : {
        expectedVersion,
        patch: {
          disabled: desiredDisabled ? 1 : 0,
          ...(rate !== undefined ? { rate } : {}),
          ...(!text(current.data.uom) ? {} : { uom }),
        },
      }),
    });
  }

  for (const removedUom of removeUoms) {
    for (const current of existingPricesPage.rows) {
      if (itemPriceUom(current, legacyUom) !== removedUom || isDisabled(current.data)) continue;
      const key = itemPriceKey(text(current.data.price_list), removedUom);
      if (explicitKeys.has(key)) continue;
      await assertPermission(context, "Item Price", "write", current.name);
      const expectedVersion = assertExpectedVersion(current, expectedPriceVersions, false);
      operations.push({
        id: `${requestId}:disable:${current.name}`,
        idempotencyKey: await pricingIdempotencyKey(requestId, "disable", current.name),
        doctype: "Item Price",
        name: current.name,
        effect: "update",
        expectedVersion,
        patch: { disabled: 1 },
      });
    }
  }

  const applied: PricingMatrixOperation[] = [];
  for (const operation of operations) {
    if (operation.effect === "unchanged") {
      applied.push(operationResult(operation));
      continue;
    }
    try {
      if (operation.effect === "create") {
        const receipt = await context.mutations.create({
          tenantId: context.tenantId,
          actor: context.actor,
          doctype: operation.doctype,
          document: operation.document!,
          idempotencyKey: operation.idempotencyKey,
        });
        applied.push(operationResult(operation, receipt.record));
      } else {
        const receipt = await context.mutations.update({
          tenantId: context.tenantId,
          actor: context.actor,
          doctype: operation.doctype,
          name: operation.name,
          expectedVersion: operation.expectedVersion!,
          patch: operation.patch!,
          idempotencyKey: operation.idempotencyKey,
        });
        applied.push(operationResult(operation, receipt.record));
      }
    } catch (error) {
      partialFailure(error, applied.filter((entry) => entry.effect !== "unchanged"));
    }
  }

  return {
    contract_version: 1,
    action: PRICING_MATRIX_COMMIT_ACTION,
    request_id: requestId,
    item_code: itemCode,
    consistency: "preflight_then_ordered_idempotent",
    operations: applied,
  };
}

export async function createPriceList(
  context: PricingMatrixAuthorityContext,
  input: CreatePriceListInput,
): Promise<JsonObject> {
  const requestId = assertRequestId(input.requestId);
  const name = assertName(input.name, "price list name");
  const currency = assertName(input.currency, "currency");
  const effectiveDate = text(input.effectiveDate);
  if (effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw errors.validation("effectiveDate must use YYYY-MM-DD");

  await Promise.all([
    assertPermission(context, "Price List", "create"),
    assertPermission(context, "Currency", "read", currency),
  ]);
  if (!await getRecord(context, "Currency", currency)) throw errors.reference(`Currency ${currency} does not exist`);

  const receipt = await context.mutations.create({
    tenantId: context.tenantId,
    actor: context.actor,
    doctype: "Price List",
    document: {
      price_list_name: name,
      currency,
      ...(effectiveDate ? { effective_date: effectiveDate } : {}),
    },
    idempotencyKey: await pricingIdempotencyKey(requestId, "price-list", name),
  });
  return {
    contract_version: 1,
    action: PRICING_PRICE_LIST_CREATE_ACTION,
    request_id: requestId,
    price_list: receipt.record.name,
    version: receipt.record.version,
  };
}
