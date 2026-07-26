export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined }

export type DocStatus = 0 | 1 | 2;
export type MutationAction = "create" | "save" | "submit" | "cancel";

export interface Actor {
  user_id: string;
  roles: string[];
  locale?: string;
  timezone?: string;
}

export interface TrustedIdentity {
  tenant_id: string;
  actor: Actor;
  trace_id: string;
  issued_at: number;
  expires_at: number;
  /** Identifies which signing key (per rotation generation) signed this envelope. */
  key_id: string;
}

export interface AggregateRef {
  doctype: string;
  name: string;
}

export interface ChildRow {
  fieldname: string;
  child_doctype: string;
  row_id: string;
  idx: number;
  data: JsonObject;
}

export interface CanonicalDocument<T extends JsonObject = JsonObject> {
  tenant_id: string;
  doctype: string;
  name: string;
  owner: string;
  docstatus: DocStatus;
  status: string;
  version: number;
  created_at: string;
  modified_at: string;
  /**
   * Who wrote this version. Framework-owned, not controller-owned: the store sets
   * it from the authenticated actor on every write, so a controller can neither
   * forget it nor attribute a change to somebody else. Absent only on documents
   * written before the column existed.
   */
  modified_by?: string;
  /**
   * The cancelled document this one amends, if any. Set once at creation; the
   * storage layer enforces that the source is cancelled and amended at most once.
   */
  amended_from?: string;
  data: T;
  children: ChildRow[];
}

/** External command shape. Actor is always injected by a trusted platform boundary. */
export interface MutationCommandInput<T extends JsonObject = JsonObject> {
  schema_version: 1;
  command_id: string;
  tenant_id: string;
  aggregate: AggregateRef;
  action: MutationAction;
  expected_version: number | null;
  payload_hash: string;
  document: T;
  submitted_at?: string;
  /**
   * On a create, the cancelled document this one amends.
   *
   * Framework-owned like `modified_by`: it travels on the command rather than in
   * the document payload so a controller cannot forge or drop it, and so the
   * storage layer can enforce the chain rules (source must be cancelled, amended
   * at most once) regardless of which controller ran.
   */
  amended_from?: string;
}

/** Internal command shape after authentication. */
export interface MutationCommand<T extends JsonObject = JsonObject> extends MutationCommandInput<T> {
  actor: Actor;
}

/** Canonical accounting values use integer minor units, never floating-point REAL. */
export interface GeneralLedgerEntry {
  line_key: string;
  account: string;
  party_type?: string;
  party?: string;
  debit_minor: number;
  credit_minor: number;
  currency: string;
  currency_scale: number;
  cost_center?: string;
  accounting_dimensions?: JsonObject;
  remarks?: string;
  /** Business posting timestamp, distinct from mutation/audit time. */
  posting_at: string;
}

/** Quantity uses fixed six-decimal micros; valuation and stock value use currency minor units. */
export interface StockLedgerEntry {
  line_key: string;
  item_code: string;
  warehouse: string;
  actual_qty_micros: number;
  valuation_rate_minor: number;
  stock_value_difference_minor: number;
  qty_scale: 6;
  currency_scale: number;
  currency: string;
  posting_at: string;
  batch_no?: string;
  serial_no?: string;
  allow_negative_stock?: boolean;
}

export interface FulfillmentEntry {
  line_key: string;
  sales_order: string;
  kind: "Delivery" | "Billing";
  item_code: string;
  qty_micros: number;
  /** Business posting timestamp used for progress and period reporting. */
  posting_at: string;
}


export interface ProcurementEntry {
  line_key: string;
  purchase_order: string;
  kind: "Receipt" | "Billing";
  item_code: string;
  qty_micros: number;
  posting_at: string;
}

/** A submitted Serial and Batch Bundle may be consumed by exactly one stock voucher. */
export interface StockBundleUsageEntry {
  line_key: string;
  bundle_name: string;
  item_code: string;
  warehouse: string;
  direction: "Inward" | "Outward";
  usage_delta: 1 | -1;
  posting_at: string;
}

/** Return progress is immutable and commit-guarded against the source voucher quantity. */
export interface ReturnEntry {
  line_key: string;
  reference_doctype: "Sales Invoice" | "Purchase Invoice" | "Delivery Note" | "Purchase Receipt";
  reference_name: string;
  kind: "Sales Credit" | "Purchase Debit" | "Sales Stock" | "Purchase Stock";
  item_code: string;
  qty_micros: number;
  posting_at: string;
}

/** Work-order completion/consumption progress. */
export interface ManufacturingEntry {
  line_key: string;
  work_order: string;
  kind: "Material Transfer" | "Consumption" | "Manufacture";
  item_code: string;
  qty_micros: number;
  posting_at: string;
}

/** Asset depreciation projection, separate from the immutable GL. */
export interface AssetDepreciationEntry {
  line_key: string;
  asset: string;
  amount_minor: number;
  currency: string;
  currency_scale: number;
  posting_at: string;
}


/** Asset lifecycle projection for movement, maintenance and disposal. */
export interface AssetLifecycleEntry {
  line_key: string;
  asset: string;
  kind: "Movement" | "Maintenance" | "Disposal";
  posting_at: string;
  location?: string;
  custodian?: string;
  amount_minor?: number;
  currency?: string;
  currency_scale?: number;
}

/** Project time/cost projection produced by submitted Timesheets. */
export interface ProjectTimeEntry {
  line_key: string;
  project: string;
  task?: string;
  hours_micros: number;
  cost_minor: number;
  billing_minor: number;
  currency: string;
  currency_scale: number;
  posting_at: string;
}

/** POS sales projection used to close a server-authoritative session. */
export interface PosSalesEntry {
  line_key: string;
  pos_profile: string;
  opening_entry: string;
  invoice: string;
  net_total_minor: number;
  tax_total_minor: number;
  grand_total_minor: number;
  currency: string;
  currency_scale: number;
  posting_at: string;
}

/** Immutable allocation between a bank-statement row and an accounting voucher. */
export interface BankReconciliationEntry {
  line_key: string;
  bank_account: string;
  bank_transaction: string;
  voucher_type: string;
  voucher_no: string;
  amount_minor: number;
  currency: string;
  currency_scale: number;
  posting_at: string;
}

export interface PaymentLedgerEntry {
  line_key: string;
  account_type: "Receivable" | "Payable";
  party_type: string;
  party: string;
  account: string;
  amount_minor: number;
  /** Company-currency amount for reconciliation; same sign as amount_minor. */
  base_amount_minor: number;
  currency: string;
  currency_scale: number;
  against_voucher_type?: string;
  against_voucher_no?: string;
  /** Business posting timestamp, distinct from mutation/audit time. */
  posting_at: string;
}

export interface DomainEvent<T extends JsonObject = JsonObject> {
  event_id: string;
  event_type: string;
  tenant_id: string;
  aggregate: AggregateRef;
  aggregate_version: number;
  actor: string;
  command_id: string;
  occurred_at: string;
  schema_version: number;
  payload: T;
}

export interface MutationPlan<T extends JsonObject = JsonObject> {
  command: MutationCommand<T>;
  document: CanonicalDocument<T>;
  gl_entries: GeneralLedgerEntry[];
  stock_entries: StockLedgerEntry[];
  payment_entries: PaymentLedgerEntry[];
  fulfillment_entries: FulfillmentEntry[];
  procurement_entries?: ProcurementEntry[];
  stock_bundle_usages?: StockBundleUsageEntry[];
  return_entries?: ReturnEntry[];
  manufacturing_entries?: ManufacturingEntry[];
  asset_depreciation_entries?: AssetDepreciationEntry[];
  asset_lifecycle_entries?: AssetLifecycleEntry[];
  project_time_entries?: ProjectTimeEntry[];
  pos_sales_entries?: PosSalesEntry[];
  bank_reconciliation_entries?: BankReconciliationEntry[];
  events: DomainEvent[];
  result: JsonObject;
}

export interface MutationReceipt {
  command_id: string;
  tenant_id: string;
  actor_user_id: string;
  aggregate: AggregateRef;
  aggregate_version: number;
  payload_hash: string;
  committed_at: string;
  result: JsonObject;
  bookmark?: string;
}

export interface MutationSnapshot {
  documents: CanonicalDocument[];
  receipts: MutationReceipt[];
  gl_entries: GeneralLedgerEntry[];
  stock_entries: StockLedgerEntry[];
  payment_entries: PaymentLedgerEntry[];
  fulfillment_entries: FulfillmentEntry[];
  procurement_entries?: ProcurementEntry[];
  stock_bundle_usages?: StockBundleUsageEntry[];
  return_entries?: ReturnEntry[];
  manufacturing_entries?: ManufacturingEntry[];
  asset_depreciation_entries?: AssetDepreciationEntry[];
  asset_lifecycle_entries?: AssetLifecycleEntry[];
  project_time_entries?: ProjectTimeEntry[];
  pos_sales_entries?: PosSalesEntry[];
  bank_reconciliation_entries?: BankReconciliationEntry[];
  events: DomainEvent[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: JsonObject;
    retryable: boolean;
  };
  trace_id: string;
}

export function parseMutationCommandInput(value: unknown): MutationCommandInput {
  const object = requireObject(value, "command");
  requireExactNumber(object.schema_version, 1, "schema_version");
  const commandId = requireIdentifier(object.command_id, "command_id", 128);
  const tenantId = requireIdentifier(object.tenant_id, "tenant_id", 128);
  const aggregateObject = requireObject(object.aggregate, "aggregate");
  const doctype = requireString(aggregateObject.doctype, "aggregate.doctype", 160);
  const name = requireString(aggregateObject.name, "aggregate.name", 240);
  const action = object.action;
  if (action !== "create" && action !== "save" && action !== "submit" && action !== "cancel") {
    throw new TypeError("action must be create, save, submit or cancel");
  }
  const expectedVersion = object.expected_version;
  if (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 1)) {
    throw new TypeError("expected_version must be null or a positive safe integer");
  }
  const payloadHash = requireString(object.payload_hash, "payload_hash", 64);
  if (!/^[a-f0-9]{64}$/.test(payloadHash)) throw new TypeError("payload_hash must be a 64-character lowercase SHA-256 hex value");
  const document = requireObject(object.document, "document");
  assertBoundedDocument(document);
  const submittedAt = object.submitted_at;
  if (submittedAt !== undefined && typeof submittedAt !== "string") throw new TypeError("submitted_at must be a string");
  const amendedFrom = object.amended_from;
  if (amendedFrom !== undefined) {
    if (typeof amendedFrom !== "string" || !amendedFrom.trim() || amendedFrom.length > 240) {
      throw new TypeError("amended_from must be a non-empty document name");
    }
    // Amending is only meaningful when creating the successor; on a later save the
    // chain is already recorded and re-supplying it could rewrite history.
    if (action !== "create") throw new TypeError("amended_from is only valid on a create");
  }
  return {
    schema_version: 1,
    command_id: commandId,
    tenant_id: tenantId,
    aggregate: { doctype, name },
    action,
    expected_version: expectedVersion as number | null,
    payload_hash: payloadHash,
    document,
    ...(typeof submittedAt === "string" ? { submitted_at: submittedAt } : {}),
    ...(typeof amendedFrom === "string" ? { amended_from: amendedFrom.trim() } : {}),
  };
}

/** Upper bounds on a single command's document, to bound per-command CPU, D1
 * round-trips and batch size. A pathological document (e.g. tens of thousands
 * of child rows) would otherwise pin the target aggregate's Durable Object. */
const MAX_DOCUMENT_DEPTH = 8;
const MAX_DOCUMENT_NODES = 50_000;
const MAX_DOCUMENT_CHILD_ROWS = 1_000;

export function assertBoundedDocument(document: JsonObject): void {
  let nodes = 0;
  let childRows = 0;
  const walk = (value: JsonValue | undefined, depth: number): void => {
    if (depth > MAX_DOCUMENT_DEPTH) throw new TypeError(`document nesting exceeds ${MAX_DOCUMENT_DEPTH} levels`);
    if (++nodes > MAX_DOCUMENT_NODES) throw new TypeError(`document has too many fields (limit ${MAX_DOCUMENT_NODES})`);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item) && ++childRows > MAX_DOCUMENT_CHILD_ROWS) {
          throw new TypeError(`document exceeds ${MAX_DOCUMENT_CHILD_ROWS} child rows`);
        }
        walk(item, depth + 1);
      }
    } else if (value && typeof value === "object") {
      for (const key of Object.keys(value)) walk(value[key], depth + 1);
    }
  };
  walk(document, 1);
}

export function requireObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${field} must be a JSON object`);
  return value as JsonObject;
}

export function requireString(value: unknown, field: string, maxLength = 512): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${field} must be a non-empty string no longer than ${maxLength} characters`);
  }
  return value;
}

export function requireIdentifier(value: unknown, field: string, maxLength = 128): string {
  const result = requireString(value, field, maxLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(result)) throw new TypeError(`${field} contains unsupported characters`);
  return result;
}

function requireExactNumber(value: unknown, expected: number, field: string): void {
  if (value !== expected) throw new TypeError(`${field} must equal ${expected}`);
}
