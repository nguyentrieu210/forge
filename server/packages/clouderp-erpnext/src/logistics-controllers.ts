import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import type { DeliveryNoteData } from "../../clouderp-selling/src/types.js";
import { SuiteController } from "./suite-controllers.js";

interface DeliveryStopData extends JsonObject {
  row_id: string;
  delivery_note: string;
  customer?: string;
  address: string;
  customer_address?: string;
  contact?: string;
  customer_contact?: string;
  grand_total?: string | number;
  distance?: string | number;
  uom?: string;
  estimated_arrival?: string;
  lat?: number;
  lng?: number;
  locked?: boolean;
}

interface DeliveryTripData extends JsonObject {
  company: string;
  driver?: string;
  driver_name?: string;
  driver_email?: string;
  driver_address?: string;
  employee?: string;
  vehicle: string;
  departure_time: string;
  total_distance?: string;
  uom?: string;
  delivery_stops: DeliveryStopData[];
}

type PodOutcome = "Delivered" | "Partial" | "Failed";

interface ProofOfDeliveryData extends JsonObject {
  delivery_trip: string;
  stop_row_id: string;
  delivery_note: string;
  customer?: string;
  delivered_at: string;
  outcome: PodOutcome;
  recipient_name?: string;
  proof_reference?: string;
  exception_reason?: string;
  failure_reason?: string;
  notes?: string;
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be a valid timestamp`);
  return parsed;
}

async function requireMaster(context: ControllerContext<JsonObject>, doctype: string, name: string): Promise<JsonObject> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, doctype, name);
  if (!data) throw errors.reference(`${doctype} ${name} does not exist or is disabled`);
  return data;
}

async function requireSubmitted<T extends JsonObject>(
  context: ControllerContext<JsonObject>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
}

export class DeliveryTripController extends SuiteController<DeliveryTripData> {
  readonly doctype = "Delivery Trip";

  override async normalize(context: ControllerContext<DeliveryTripData>): Promise<DeliveryTripData> {
    const input = context.command.document;
    if (!input.company || !input.vehicle || !input.departure_time || !Array.isArray(input.delivery_stops) || input.delivery_stops.length === 0) {
      throw errors.validation("Company, vehicle, departure time and at least one delivery stop are required");
    }
    const departure = parseTimestamp(input.departure_time, "departure_time");
    if (context.command.action === "submit") {
      await requireMaster(context as unknown as ControllerContext<JsonObject>, "Company", input.company);
      await requireMaster(context as unknown as ControllerContext<JsonObject>, "Vehicle", input.vehicle);
      if (!input.driver) throw errors.validation("A driver is required before submitting a Delivery Trip");
    }

    let driverName = input.driver_name;
    let driverEmail = input.driver_email;
    let driverAddress = input.driver_address;
    let employee = input.employee;
    if (input.driver) {
      const driver = context.command.action === "submit"
        ? await requireMaster(context as unknown as ControllerContext<JsonObject>, "Driver", input.driver)
        : await context.reader.getMasterRecordData(context.command.tenant_id, "Driver", input.driver);
      if (driver) {
        driverName = String(driver.full_name ?? driver.driver_name ?? driverName ?? "") || undefined;
        driverEmail = String(driver.email ?? driver.email_address ?? driverEmail ?? "") || undefined;
        driverAddress = String(driver.address ?? driverAddress ?? "") || undefined;
        employee = String(driver.employee ?? employee ?? "") || undefined;
      }
    }

    const seenDeliveryNotes = new Set<string>();
    let previousArrival = departure;
    let totalDistance = 0;
    const stops: DeliveryStopData[] = [];
    for (const [index, raw] of input.delivery_stops.entries()) {
      const rowId = String(raw.row_id ?? `STOP-${index + 1}`).trim();
      const deliveryNoteName = String(raw.delivery_note ?? "").trim();
      const address = String(raw.address ?? "").trim();
      if (!rowId || !deliveryNoteName || !address) {
        throw errors.validation(`Delivery Note and address are required at stop ${index + 1}`);
      }
      if (seenDeliveryNotes.has(deliveryNoteName)) throw errors.validation(`Delivery Note ${deliveryNoteName} is duplicated in this trip`);
      seenDeliveryNotes.add(deliveryNoteName);

      const note = context.command.action === "submit"
        ? await requireSubmitted<DeliveryNoteData>(context as unknown as ControllerContext<JsonObject>, "Delivery Note", deliveryNoteName)
        : await context.reader.getDocument<DeliveryNoteData>(context.command.tenant_id, "Delivery Note", deliveryNoteName);
      if (context.command.action === "submit") {
        if (!note) throw errors.reference(`Submitted Delivery Note ${deliveryNoteName} is required`);
        if (note.data.company !== input.company) throw errors.reference(`Delivery Note ${deliveryNoteName} belongs to another company`);
        await requireMaster(context as unknown as ControllerContext<JsonObject>, "Address", address);
      }

      const noteCustomer = note && typeof note.data.customer === "string" ? note.data.customer : undefined;
      const customer = noteCustomer ?? (typeof raw.customer === "string" ? raw.customer : undefined);
      if (noteCustomer && raw.customer && raw.customer !== noteCustomer) {
        throw errors.reference(`Customer at stop ${index + 1} does not match Delivery Note ${deliveryNoteName}`);
      }
      if (context.command.action === "submit" && customer) {
        await requireMaster(context as unknown as ControllerContext<JsonObject>, "Customer", customer);
      }

      const estimatedArrival = typeof raw.estimated_arrival === "string" && raw.estimated_arrival ? raw.estimated_arrival : undefined;
      if (estimatedArrival) {
        const arrival = parseTimestamp(estimatedArrival, `delivery_stops[${index}].estimated_arrival`);
        if (arrival < departure) throw errors.validation(`Estimated arrival at stop ${index + 1} cannot be before departure`);
        if (arrival < previousArrival) throw errors.validation("Delivery stop estimated arrivals must follow route order");
        previousArrival = arrival;
      }

      const distance = raw.distance === undefined || raw.distance === null || raw.distance === ""
        ? 0
        : Number(raw.distance);
      if (!Number.isFinite(distance) || distance < 0) throw errors.validation(`Distance at stop ${index + 1} must be non-negative`);
      totalDistance += distance;
      if (!Number.isFinite(totalDistance)) throw errors.validation("Delivery Trip distance exceeds numeric bounds");

      stops.push({
        ...raw,
        row_id: rowId,
        delivery_note: deliveryNoteName,
        address,
        ...(customer ? { customer } : {}),
        ...(estimatedArrival ? { estimated_arrival: estimatedArrival } : {}),
        distance: distance.toFixed(2),
        visited: false,
      } as DeliveryStopData);
    }

    return {
      ...input,
      ...(driverName ? { driver_name: driverName } : {}),
      ...(driverEmail ? { driver_email: driverEmail } : {}),
      ...(driverAddress ? { driver_address: driverAddress } : {}),
      ...(employee ? { employee } : {}),
      total_distance: totalDistance.toFixed(2),
      delivery_stops: stops,
    };
  }

  override status(context: ControllerContext<DeliveryTripData>, _data: DeliveryTripData): string {
    const docstatus = nextDocStatus(context.command.action);
    if (docstatus === 1) return "Scheduled";
    if (docstatus === 2) return "Cancelled";
    return "Draft";
  }
}

export class ProofOfDeliveryController extends SuiteController<ProofOfDeliveryData> {
  readonly doctype = "Proof of Delivery";

  override async normalize(context: ControllerContext<ProofOfDeliveryData>): Promise<ProofOfDeliveryData> {
    const input = context.command.document;
    if (!input.delivery_trip || !input.stop_row_id || !input.delivery_note || !input.delivered_at || !input.outcome) {
      throw errors.validation("Delivery trip, stop, Delivery Note, delivered_at and outcome are required");
    }
    if (!["Delivered", "Partial", "Failed"].includes(input.outcome)) throw errors.validation("Invalid Proof of Delivery outcome");

    const baseName = `POD-${input.delivery_trip}-${input.stop_row_id}`;
    if (!context.command.amended_from && context.command.aggregate.name !== baseName) {
      throw errors.validation(`Initial Proof of Delivery name must be ${baseName}`);
    }
    if (context.command.amended_from && !context.command.aggregate.name.startsWith(`${baseName}-`)) {
      throw errors.validation(`Amended Proof of Delivery name must start with ${baseName}-`);
    }

    const trip = await requireSubmitted<DeliveryTripData>(context as unknown as ControllerContext<JsonObject>, "Delivery Trip", input.delivery_trip);
    const stop = trip.data.delivery_stops.find((candidate) => candidate.row_id === input.stop_row_id);
    if (!stop) throw errors.reference(`Delivery stop ${input.stop_row_id} does not exist in Delivery Trip ${input.delivery_trip}`);
    if (stop.delivery_note !== input.delivery_note) throw errors.reference("Proof of Delivery does not match the stop Delivery Note");

    const deliveredAt = parseTimestamp(input.delivered_at, "delivered_at");
    if (deliveredAt < parseTimestamp(trip.data.departure_time, "Delivery Trip departure_time")) {
      throw errors.validation("Proof of Delivery cannot be recorded before trip departure");
    }

    const recipient = typeof input.recipient_name === "string" ? input.recipient_name.trim() : "";
    const proofReference = typeof input.proof_reference === "string" ? input.proof_reference.trim() : "";
    const exceptionReason = typeof input.exception_reason === "string" ? input.exception_reason.trim() : "";
    const failureReason = typeof input.failure_reason === "string" ? input.failure_reason.trim() : "";

    if (input.outcome === "Delivered" && (!recipient || !proofReference)) {
      throw errors.validation("Delivered POD requires recipient name and proof reference");
    }
    if (input.outcome === "Partial" && (!recipient || !proofReference || !exceptionReason)) {
      throw errors.validation("Partial POD requires recipient, proof reference and exception reason");
    }
    if (input.outcome === "Failed" && !failureReason) {
      throw errors.validation("Failed POD requires a failure reason");
    }

    const note = await requireSubmitted<DeliveryNoteData>(context as unknown as ControllerContext<JsonObject>, "Delivery Note", input.delivery_note);
    if (note.data.company !== trip.data.company) throw errors.reference("POD Delivery Note company does not match Delivery Trip");
    if (stop.customer && note.data.customer && stop.customer !== note.data.customer) throw errors.reference("POD customer lineage no longer matches Delivery Note");

    return {
      ...input,
      ...(stop.customer ? { customer: stop.customer } : {}),
      ...(recipient ? { recipient_name: recipient } : {}),
      ...(proofReference ? { proof_reference: proofReference } : {}),
      ...(exceptionReason ? { exception_reason: exceptionReason } : {}),
      ...(failureReason ? { failure_reason: failureReason } : {}),
    };
  }

  override status(context: ControllerContext<ProofOfDeliveryData>, data: ProofOfDeliveryData): string {
    const docstatus = nextDocStatus(context.command.action);
    if (docstatus === 2) return "Cancelled";
    if (docstatus === 1) return data.outcome;
    return "Draft";
  }
}
