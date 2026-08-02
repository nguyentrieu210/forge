import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import type { CalibrationRecordData } from "./qms-controllers.js";

/**
 * Calibration references an Asset document, not a master-record row.
 *
 * Keep this controller separate from the broad QMS slice so the reference authority is
 * obvious in review: Company is a master, Asset is a submitted canonical document.
 */
export class ManufacturingCalibrationRecordController extends SuiteController<CalibrationRecordData> {
  readonly doctype = "Calibration Record";

  async normalize(context: ControllerContext<CalibrationRecordData>): Promise<CalibrationRecordData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const instrumentId = requiredText(input.instrument_id, "instrument_id");
    const asset = optionalText(input.asset);
    const calibrationDate = validDate(input.calibration_date, "calibration_date");
    const nextDueDate = validDate(input.next_due_date, "next_due_date");
    if (nextDueDate <= calibrationDate) throw errors.validation("next_due_date must be after calibration_date");
    const standardReference = requiredText(input.standard_reference, "standard_reference");
    const result = input.result;
    if (result !== "Pass" && result !== "Fail") throw errors.validation("result must be Pass or Fail");
    const performedBy = requiredText(input.performed_by, "performed_by");

    if (context.command.action === "submit") {
      if (!await context.reader.hasMasterRecord(context.command.tenant_id, "Company", company)) {
        throw errors.reference(`Company ${company} does not exist or is disabled`);
      }
      if (asset) {
        const assetDocument = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Asset", asset);
        if (!assetDocument || assetDocument.docstatus !== 1) throw errors.reference(`Asset ${asset} must be submitted and Active`);
        if (assetDocument.data.company !== company) throw errors.reference(`Asset ${asset} belongs to another company`);
      }
    }

    return {
      ...input,
      company,
      instrument_id: instrumentId,
      ...(asset ? { asset } : {}),
      calibration_date: calibrationDate,
      next_due_date: nextDueDate,
      standard_reference: standardReference,
      result,
      performed_by: performedBy,
    };
  }

  status(context: ControllerContext<CalibrationRecordData>, data: CalibrationRecordData): string {
    const ds = nextDocStatus(context.command.action);
    if (ds === 0) return "Draft";
    if (ds === 2) return "Cancelled";
    return data.result === "Pass" ? "Calibrated" : "Failed";
  }
}

function validDate(value: unknown, field: string): string {
  const normalized = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw errors.validation(`${field} must be a valid calendar date`);
  }
  return normalized;
}

function requiredText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
