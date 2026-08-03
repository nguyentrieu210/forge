import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";

interface TransportContractData extends JsonObject {
  company: string;
  carrier: string;
  currency: string;
  currency_scale?: number;
  valid_from: string;
  valid_upto: string;
  base_charge: string | number;
  base_charge_minor?: number;
  per_km_charge: string | number;
  per_km_charge_minor?: number;
  minimum_charge: string | number;
  minimum_charge_minor?: number;
  notes?: string;
}

interface FreightEstimateData extends JsonObject {
  delivery_trip: string;
  transport_contract: string;
  company?: string;
  carrier?: string;
  currency?: string;
  currency_scale?: number;
  total_distance?: string;
  estimated_amount?: string;
  estimated_amount_minor?: number;
}

async function master(context: ControllerContext<JsonObject>, doctype: string, name: string): Promise<JsonObject> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, doctype, name);
  if (!data) throw errors.reference(`${doctype} ${name} does not exist or is disabled`);
  return data;
}

async function submitted<T extends JsonObject>(context: ControllerContext<JsonObject>, doctype: string, name: string): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
}

function validDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) throw errors.validation(`${field} must be a valid date`);
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} exceeds safe integer bounds`);
  return value;
}

export class TransportContractController extends SuiteController<TransportContractData> {
  readonly doctype = "Transport Contract";

  override async normalize(context: ControllerContext<TransportContractData>): Promise<TransportContractData> {
    const input = context.command.document;
    if (!input.company || !input.carrier || !input.currency || !input.valid_from || !input.valid_upto) {
      throw errors.validation("Company, carrier, currency and effective dates are required");
    }
    const validFrom = validDate(input.valid_from, "valid_from");
    const validUpto = validDate(input.valid_upto, "valid_upto");
    if (validUpto < validFrom) throw errors.validation("Transport Contract valid_upto cannot be before valid_from");

    await master(context as unknown as ControllerContext<JsonObject>, "Company", input.company);
    await master(context as unknown as ControllerContext<JsonObject>, "Carrier", input.carrier);
    const currency = await master(context as unknown as ControllerContext<JsonObject>, "Currency", input.currency);
    const scale = typeof currency.currency_scale === "number" ? currency.currency_scale : 2;
    const base = toScaledInt(input.base_charge, scale, "base_charge");
    const perKm = toScaledInt(input.per_km_charge, scale, "per_km_charge");
    const minimum = toScaledInt(input.minimum_charge, scale, "minimum_charge");
    if (base < 0 || perKm < 0 || minimum < 0) throw errors.validation("Transport Contract charges cannot be negative");

    return {
      ...input,
      valid_from: validFrom,
      valid_upto: validUpto,
      currency_scale: scale,
      base_charge: fromScaledInt(base, scale),
      base_charge_minor: base,
      per_km_charge: fromScaledInt(perKm, scale),
      per_km_charge_minor: perKm,
      minimum_charge: fromScaledInt(minimum, scale),
      minimum_charge_minor: minimum,
    };
  }

  override status(context: ControllerContext<TransportContractData>, _data: TransportContractData): string {
    const docstatus = nextDocStatus(context.command.action);
    return docstatus === 1 ? "Active" : docstatus === 2 ? "Cancelled" : "Draft";
  }
}

export class FreightEstimateController extends SuiteController<FreightEstimateData> {
  readonly doctype = "Freight Estimate";

  override async normalize(context: ControllerContext<FreightEstimateData>): Promise<FreightEstimateData> {
    const input = context.command.document;
    if (!input.delivery_trip || !input.transport_contract) throw errors.validation("Delivery Trip and Transport Contract are required");
    const baseName = `FREIGHT-${input.delivery_trip}`;
    if (!context.command.amended_from && context.command.aggregate.name !== baseName) throw errors.validation(`Initial Freight Estimate name must be ${baseName}`);
    if (context.command.amended_from && !context.command.aggregate.name.startsWith(`${baseName}-`)) throw errors.validation(`Amended Freight Estimate name must start with ${baseName}-`);

    const trip = await submitted<JsonObject>(context as unknown as ControllerContext<JsonObject>, "Delivery Trip", input.delivery_trip);
    const contract = await submitted<TransportContractData>(context as unknown as ControllerContext<JsonObject>, "Transport Contract", input.transport_contract);
    if (trip.data.company !== contract.data.company) throw errors.reference("Delivery Trip and Transport Contract company do not match");
    const departure = String(trip.data.departure_time ?? "").slice(0, 10);
    if (!departure || departure < contract.data.valid_from || departure > contract.data.valid_upto) {
      throw errors.reference("Transport Contract is not effective for the Delivery Trip departure date");
    }

    const distance = String(trip.data.total_distance ?? "0");
    const distanceMicros = toScaledInt(distance, 6, "total_distance");
    if (distanceMicros < 0) throw errors.validation("Delivery Trip total distance cannot be negative");
    const scale = contract.data.currency_scale ?? 2;
    const distanceCharge = multiplyScaled(distance, 6, contract.data.per_km_charge, scale, scale, "freight_distance_charge");
    const computed = safeAdd(contract.data.base_charge_minor ?? 0, distanceCharge, "freight estimate");
    const estimate = Math.max(contract.data.minimum_charge_minor ?? 0, computed);

    return {
      ...input,
      company: contract.data.company,
      carrier: contract.data.carrier,
      currency: contract.data.currency,
      currency_scale: scale,
      total_distance: fromScaledInt(distanceMicros, 6),
      estimated_amount: fromScaledInt(estimate, scale),
      estimated_amount_minor: estimate,
    };
  }

  override status(context: ControllerContext<FreightEstimateData>, _data: FreightEstimateData): string {
    const docstatus = nextDocStatus(context.command.action);
    return docstatus === 1 ? "Estimated" : docstatus === 2 ? "Cancelled" : "Draft";
  }
}
