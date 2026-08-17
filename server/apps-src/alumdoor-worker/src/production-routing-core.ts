export type NumericLike = number | string | null | undefined;

export type ProductionCapacityBasis = "set" | "m2" | "operation" | "batch";

export interface ProductionRoutingStandard {
  name: string;
  routing?: string;
  sequence?: NumericLike;
  department: string;
  door_type: string;
  operation: string;
  capacity_basis?: ProductionCapacityBasis;
  minutes_per_unit?: NumericLike;
  minutes_per_set?: NumericLike;
  standard_time?: NumericLike;
  batch_capacity?: NumericLike;
  persons?: NumericLike;
  shift_hours?: NumericLike;
  efficiency?: NumericLike;
  workstation?: string;
  effective_from?: string;
  effective_to?: string;
  disabled?: NumericLike;
  required?: NumericLike;
  source?: string;
  revision?: string;
}

export interface ProductionRoutingContext {
  door_type: string;
  department: string;
  production_date: string;
  sets: number;
  area_sqm: number;
  routing?: string;
  operation_quantities?: Record<string, number>;
}

export interface ProductionOperationPlanLine {
  sequence: number;
  operation: string;
  workstation: string | null;
  capacity_basis: ProductionCapacityBasis;
  basis_qty: number;
  minutes_per_unit: number;
  planned_minutes: number;
  persons: number | null;
  efficiency: number | null;
  standard_name: string;
  standard_source: string;
  standard_revision: string | null;
}

export interface ProductionRoutingResolution {
  schema_version: 1;
  routing: string;
  door_type: string;
  department: string;
  production_date: string;
  operation_lines: ProductionOperationPlanLine[];
  total_planned_minutes: number;
}

export type ProductionRoutingErrorCode =
  | "NO_ACTIVE_OPERATION_STANDARD"
  | "MISSING_ROUTING_AUTHORITY"
  | "AMBIGUOUS_ROUTING_AUTHORITY"
  | "MISSING_OPERATION_SEQUENCE"
  | "DUPLICATE_OPERATION_SEQUENCE"
  | "MISSING_OPERATION_NAME"
  | "MISSING_CAPACITY_BASIS"
  | "INVALID_STANDARD_MINUTES"
  | "INVALID_BATCH_CAPACITY"
  | "INVALID_BASIS_QUANTITY";

export class ProductionRoutingError extends Error {
  readonly code: ProductionRoutingErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ProductionRoutingErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ProductionRoutingError";
    this.code = code;
    this.details = details;
  }
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function numberOrNull(value: NumericLike): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: NumericLike): number | null {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function positiveInteger(value: NumericLike): number | null {
  const parsed = numberOrNull(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function flag(value: NumericLike): boolean {
  if (typeof value === "string") {
    const lowered = normalized(value);
    if (["0", "false", "no", "không", "khong"].includes(lowered)) return false;
    if (["1", "true", "yes", "có", "co"].includes(lowered)) return true;
  }
  return Number(value ?? 0) !== 0;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function activeOn(standard: ProductionRoutingStandard, date: string): boolean {
  if (flag(standard.disabled)) return false;
  const from = text(standard.effective_from);
  const to = text(standard.effective_to);
  if (from && from > date) return false;
  if (to && to < date) return false;
  return true;
}

function standardMinutes(standard: ProductionRoutingStandard): number {
  const minutes = positive(standard.minutes_per_unit)
    ?? positive(standard.minutes_per_set)
    ?? positive(standard.standard_time);
  if (minutes === null) {
    throw new ProductionRoutingError(
      "INVALID_STANDARD_MINUTES",
      `${text(standard.name) || text(standard.operation) || "Production Standard"}: thiếu định mức phút dương.`,
      { standard: standard.name, operation: standard.operation },
    );
  }
  return minutes;
}

function basisQuantity(
  standard: ProductionRoutingStandard,
  context: ProductionRoutingContext,
  basis: ProductionCapacityBasis,
): number {
  if (basis === "set") return context.sets;
  if (basis === "m2") return context.area_sqm;
  if (basis === "operation") {
    const operation = text(standard.operation);
    return context.operation_quantities?.[operation] ?? context.sets;
  }
  const batchCapacity = positive(standard.batch_capacity);
  if (batchCapacity === null) {
    throw new ProductionRoutingError(
      "INVALID_BATCH_CAPACITY",
      `${standard.name}: công đoạn ${standard.operation} chạy theo batch nhưng thiếu batch_capacity dương.`,
      { standard: standard.name, operation: standard.operation },
    );
  }
  return Math.ceil(context.sets / batchCapacity);
}

/**
 * Resolve one immutable, ordered production plan from Production Standard rows.
 *
 * This resolver deliberately does not infer route, sequence, capacity basis or magic
 * minutes from names. Production-critical ambiguity is a blocker, not a fallback.
 * `persons` and `efficiency` are snapshot metadata only until a separate, sourced
 * capacity contract explicitly defines how they alter elapsed minutes.
 */
export function resolveProductionRouting(
  standards: ProductionRoutingStandard[],
  context: ProductionRoutingContext,
): ProductionRoutingResolution {
  const doorType = text(context.door_type);
  const department = text(context.department);
  const date = text(context.production_date);
  const sets = positive(context.sets);
  const area = positive(context.area_sqm);
  if (sets === null) {
    throw new ProductionRoutingError("INVALID_BASIS_QUANTITY", "Số bộ sản xuất phải lớn hơn 0.", { sets: context.sets });
  }
  if (area === null) {
    throw new ProductionRoutingError("INVALID_BASIS_QUANTITY", "Diện tích sản xuất phải lớn hơn 0.", { area_sqm: context.area_sqm });
  }

  const matching = standards.filter((standard) =>
    activeOn(standard, date)
    && normalized(standard.door_type) === normalized(doorType)
    && normalized(standard.department) === normalized(department));
  if (!matching.length) {
    throw new ProductionRoutingError(
      "NO_ACTIVE_OPERATION_STANDARD",
      `Không có định mức công đoạn đang hiệu lực cho ${doorType} / ${department} ngày ${date}.`,
      { door_type: doorType, department, production_date: date },
    );
  }

  const requestedRouting = text(context.routing);
  const routingNames = [...new Set(matching.map((row) => text(row.routing)).filter(Boolean))].sort();
  let routing = requestedRouting;
  if (routing) {
    if (!routingNames.includes(routing)) {
      throw new ProductionRoutingError(
        "MISSING_ROUTING_AUTHORITY",
        `Không có routing ${routing} đang hiệu lực cho ${doorType} / ${department}.`,
        { routing, available_routings: routingNames },
      );
    }
  } else if (routingNames.length === 1) {
    routing = routingNames[0]!;
  } else if (routingNames.length === 0) {
    throw new ProductionRoutingError(
      "MISSING_ROUTING_AUTHORITY",
      `${doorType} / ${department} có Production Standard nhưng chưa khai routing.`,
      { standards: matching.map((row) => row.name) },
    );
  } else {
    throw new ProductionRoutingError(
      "AMBIGUOUS_ROUTING_AUTHORITY",
      `${doorType} / ${department} có nhiều routing đang hiệu lực; phải chọn authority tường minh.`,
      { routings: routingNames },
    );
  }

  const routed = matching.filter((row) => text(row.routing) === routing);
  const bySequence = new Map<number, ProductionRoutingStandard>();
  for (const standard of routed) {
    const operation = text(standard.operation);
    if (!operation) {
      throw new ProductionRoutingError(
        "MISSING_OPERATION_NAME",
        `${standard.name}: routing ${routing} có dòng thiếu Operation.`,
        { standard: standard.name, routing },
      );
    }
    const sequence = positiveInteger(standard.sequence);
    if (sequence === null) {
      throw new ProductionRoutingError(
        "MISSING_OPERATION_SEQUENCE",
        `${standard.name}: routing ${routing} phải có sequence nguyên dương.`,
        { standard: standard.name, routing, sequence: standard.sequence },
      );
    }
    const prior = bySequence.get(sequence);
    if (prior) {
      throw new ProductionRoutingError(
        "DUPLICATE_OPERATION_SEQUENCE",
        `Routing ${routing} có hai authority ở sequence ${sequence}: ${prior.name}, ${standard.name}.`,
        { routing, sequence, standards: [prior.name, standard.name] },
      );
    }
    bySequence.set(sequence, standard);
  }

  const operationLines = [...bySequence.entries()]
    .sort(([left], [right]) => left - right)
    .map(([sequence, standard]): ProductionOperationPlanLine => {
      const basis = standard.capacity_basis;
      if (!basis || !["set", "m2", "operation", "batch"].includes(basis)) {
        throw new ProductionRoutingError(
          "MISSING_CAPACITY_BASIS",
          `${standard.name}: công đoạn ${standard.operation} phải khai capacity_basis tường minh.`,
          { standard: standard.name, operation: standard.operation, capacity_basis: standard.capacity_basis },
        );
      }
      const basisQty = basisQuantity(standard, { ...context, sets, area_sqm: area }, basis);
      if (!Number.isFinite(basisQty) || basisQty <= 0) {
        throw new ProductionRoutingError(
          "INVALID_BASIS_QUANTITY",
          `${standard.name}: basis quantity của ${standard.operation} phải lớn hơn 0.`,
          { standard: standard.name, operation: standard.operation, basis, basis_qty: basisQty },
        );
      }
      const minutesPerUnit = standardMinutes(standard);
      return {
        sequence,
        operation: text(standard.operation),
        workstation: text(standard.workstation) || null,
        capacity_basis: basis,
        basis_qty: round(basisQty),
        minutes_per_unit: round(minutesPerUnit),
        planned_minutes: round(minutesPerUnit * basisQty),
        persons: positive(standard.persons),
        efficiency: positive(standard.efficiency),
        standard_name: text(standard.name),
        standard_source: text(standard.source) || text(standard.name),
        standard_revision: text(standard.revision) || null,
      };
    });

  if (!operationLines.length) {
    throw new ProductionRoutingError(
      "NO_ACTIVE_OPERATION_STANDARD",
      `Routing ${routing} không có công đoạn đang hiệu lực.`,
      { routing, door_type: doorType, department },
    );
  }

  return {
    schema_version: 1,
    routing,
    door_type: doorType,
    department,
    production_date: date,
    operation_lines: operationLines,
    total_planned_minutes: round(operationLines.reduce((sum, line) => sum + line.planned_minutes, 0)),
  };
}

export function productionRoutingSnapshot(resolution: ProductionRoutingResolution): string {
  return JSON.stringify(resolution);
}
