import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import type { JobCardData, JobCardTimeLog } from "./types.js";

interface OperationProgressReader {
  getJobCardOperationCompletedQuantityMicros?(
    tenantId: string,
    workOrder: string,
    operation: string,
    excludeName?: string,
  ): Promise<number>;
}

/**
 * Job Card progress belongs to one operation of a Work Order.
 *
 * Cutting 10/10 doors does not consume the 10-door progress allowance of Painting.
 * The previous generic controller summed every Job Card on the Work Order and therefore
 * rejected the second full operation as 20/10. Besides blocking real production, that
 * made operation-level actual costing impossible because later stages could never record
 * their legitimate time.
 */
export class OperationAwareJobCardController extends SuiteController<JobCardData> {
  readonly doctype = "Job Card";

  async normalize(context: ControllerContext<JobCardData>): Promise<JobCardData> {
    const input = context.command.document;
    if (!input.company || !input.work_order || !input.operation || !input.workstation || !input.posting_at) {
      throw errors.validation("Company, work order, operation, workstation and posting_at are required");
    }
    const completed = toScaledInt(input.completed_qty, 6, "completed_qty");
    if (completed <= 0) throw errors.validation("completed_qty must be positive");

    const workOrder = await context.reader.getDocument<JsonObject>(
      context.command.tenant_id,
      "Work Order",
      input.work_order,
    );
    if (!workOrder || workOrder.docstatus !== 1) {
      throw errors.reference(`Submitted Work Order ${input.work_order} is required`);
    }
    if (workOrder.data.company !== input.company) {
      throw errors.reference("Job Card company does not match Work Order");
    }
    const target = typeof workOrder.data.qty_micros === "number"
      ? workOrder.data.qty_micros
      : toScaledInt(String(workOrder.data.qty ?? 0), 6);
    if (target <= 0) throw errors.reference("Work Order quantity must be positive");

    const previouslyCompleted = await operationCompleted(
      context,
      input.work_order,
      input.operation,
      context.command.aggregate.name,
    );
    if (previouslyCompleted + completed > target) {
      throw errors.reference(`Cumulative Job Card completion for ${input.operation} exceeds Work Order quantity`, {
        work_order_qty_micros: target,
        prior_operation_qty_micros: previouslyCompleted,
        requested_qty_micros: completed,
      });
    }

    const logs = normalizeTimeLogs(input.time_logs ?? []);
    const hours = logs.reduce((sum, row) => safeAdd(sum, row.hours_micros ?? 0), 0);
    if (context.command.action === "submit") {
      await assertMaster(context, "Company", input.company);
      await assertMaster(context, "Operation", input.operation);
      await assertMaster(context, "Workstation", input.workstation);
      if (input.employee) await assertMaster(context, "Employee", input.employee);
    }
    return {
      ...input,
      completed_qty: fromScaledInt(completed, 6),
      completed_qty_micros: completed,
      time_logs: logs,
      total_hours: fromScaledInt(hours, 6),
      total_hours_micros: hours,
    };
  }

  status(context: ControllerContext<JobCardData>): string {
    return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, {} as JobCardData);
  }
}

async function operationCompleted(
  context: ControllerContext<JobCardData>,
  workOrder: string,
  operation: string,
  excludeName: string,
): Promise<number> {
  const reader = context.reader as typeof context.reader & OperationProgressReader;
  if (reader.getJobCardOperationCompletedQuantityMicros) {
    return reader.getJobCardOperationCompletedQuantityMicros(
      context.command.tenant_id,
      workOrder,
      operation,
      excludeName,
    );
  }

  // Test/custom readers that predate the indexed production method stay correct. The
  // production D1 store implements the narrow query above; this fallback is not the
  // production scalability path.
  const documents = await context.reader.listDocumentsByDoctype<JobCardData>(
    context.command.tenant_id,
    "Job Card",
  );
  let total = 0;
  for (const document of documents) {
    if (document.docstatus !== 1 || document.name === excludeName) continue;
    if (document.data.work_order !== workOrder || document.data.operation !== operation) continue;
    const qty = typeof document.data.completed_qty_micros === "number"
      ? document.data.completed_qty_micros
      : toScaledInt(document.data.completed_qty, 6, "completed_qty");
    total = safeAdd(total, qty);
  }
  return total;
}

function normalizeTimeLogs(logs: JobCardTimeLog[]): JobCardTimeLog[] {
  if (!Array.isArray(logs) || logs.length === 0) throw errors.validation("At least one time log is required");
  return logs.map((row, index) => {
    if (!row.from_time || !row.to_time) throw errors.validation(`Time log timestamps are required at row ${index + 1}`);
    const hours = durationHoursMicros(row.from_time, row.to_time);
    return {
      ...row,
      row_id: row.row_id || `ROW-${index + 1}`,
      hours: fromScaledInt(hours, 6),
      hours_micros: hours,
    };
  });
}

function durationHoursMicros(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw errors.validation("Time range is invalid");
  const milliseconds = end - start;
  if (milliseconds > 24 * 60 * 60 * 1000) throw errors.validation("A time row cannot exceed 24 hours");
  return Math.round((milliseconds * 1_000_000) / 3_600_000);
}

async function assertMaster(context: ControllerContext<JobCardData>, type: string, name: string): Promise<void> {
  if (!await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) {
    throw errors.reference(`${type} ${name} does not exist or is disabled`);
  }
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Job Card arithmetic exceeds safe integer bounds");
  return value;
}
