import type { JsonObject, MutationCommand } from "../../../packages/contracts/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import type { DomainReader } from "../../../packages/document-kernel/src/index.js";

const SUBMIT_CANCEL_DOCTYPES = new Set([
  "Stock Entry",
  "Work Order",
  "Cut Order",
  "Stock Reconciliation",
]);
const RESERVATION_ACTIONS = new Set(["create", "save"]);

/**
 * Selects one company-wide inventory lock for every stock-affecting command and
 * every Stock Reservation read-check-write mutation.
 *
 * Document-level Durable Objects are insufficient for two differently named
 * reservations competing for the same available stock. Reservation create/save
 * therefore shares the same company lock used by stock posting and cutting.
 */
export function inventoryCoordinatorKey(
  command: MutationCommand<JsonObject>,
  existing?: JsonObject | null,
): string | null {
  if (!isInventoryCoordinatedCommand(command)) return null;
  const company = textField(command.document, "company") || textField(existing, "company");
  if (!company) return null;
  return coordinatorKey(command.tenant_id, company);
}

export function isInventoryCoordinatedCommand(command: MutationCommand<JsonObject>): boolean {
  if (command.aggregate.doctype === "Stock Reservation") {
    return RESERVATION_ACTIONS.has(command.action);
  }
  return SUBMIT_CANCEL_DOCTYPES.has(command.aggregate.doctype)
    && (command.action === "submit" || command.action === "cancel");
}

/**
 * Resolves the company when it is not carried directly in the command payload.
 * Stock Reservation deliberately has no editable company field; its company comes
 * from the source document and, when supplied, must agree with the warehouse.
 */
export async function resolveInventoryCoordinatorKey(
  command: MutationCommand<JsonObject>,
  reader: Pick<DomainReader, "getDocument" | "getMasterRecordData" | "listMasterRecordData">,
): Promise<string | null> {
  const direct = inventoryCoordinatorKey(command);
  if (direct || !isInventoryCoordinatedCommand(command)) return direct;

  const existing = command.action === "create"
    ? null
    : await reader.getDocument<JsonObject>(
        command.tenant_id,
        command.aggregate.doctype,
        command.aggregate.name,
      );
  const fromExisting = inventoryCoordinatorKey(command, existing?.data);
  if (fromExisting) return fromExisting;

  if (command.aggregate.doctype !== "Stock Reservation") return null;
  const reservation = { ...(existing?.data ?? {}), ...command.document } as JsonObject;
  const sourceDoctype = textField(reservation, "source_doctype");
  const sourceName = textField(reservation, "source_name");
  if (!sourceDoctype || !sourceName) {
    throw errors.validation("Stock Reservation requires a source document before inventory coordination");
  }
  const source = await reader.getDocument<JsonObject>(command.tenant_id, sourceDoctype, sourceName);
  if (!source) throw errors.reference(`${sourceDoctype} ${sourceName} không tồn tại`);

  let company = textField(source.data, "company");
  const warehouse = textField(reservation, "warehouse");
  if (warehouse) {
    const warehouseData = await reader.getMasterRecordData(command.tenant_id, "Warehouse", warehouse);
    if (!warehouseData) throw errors.reference(`Kho ${warehouse} không tồn tại hoặc đã ngừng dùng`);
    const warehouseCompany = await resolvedMasterCompany(reader, command.tenant_id, warehouseData);
    if (company && warehouseCompany && company !== warehouseCompany) {
      throw errors.validation(`Kho ${warehouse} không thuộc công ty ${company} của chứng từ nguồn`);
    }
    company ||= warehouseCompany;
  }

  if (!company) {
    const companies = await reader.listMasterRecordData(command.tenant_id, "Company");
    if (companies.length === 1) company = companies[0]!.name;
  }
  if (!company) {
    throw errors.validation("Stock Reservation không xác định được công ty từ chứng từ nguồn hoặc kho");
  }
  return coordinatorKey(command.tenant_id, company);
}

async function resolvedMasterCompany(
  reader: Pick<DomainReader, "listMasterRecordData">,
  tenantId: string,
  warehouseData: JsonObject,
): Promise<string> {
  const explicit = textField(warehouseData, "company");
  if (explicit) return explicit;
  const companies = await reader.listMasterRecordData(tenantId, "Company");
  return companies.length === 1 ? companies[0]!.name : "";
}

function coordinatorKey(tenantId: string, company: string): string {
  return `inventory:${tenantId}:${encodeURIComponent(company)}`;
}

function textField(value: JsonObject | null | undefined, field: string): string {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate.trim() : "";
}
