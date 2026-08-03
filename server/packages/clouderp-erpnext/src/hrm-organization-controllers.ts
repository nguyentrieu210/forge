import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class OrganizationPositionController extends SuiteController<JsonObject> {
  readonly doctype = "Organization Position";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const positionCode = H.requiredText(input.position_code, "Organization Position position_code");
    const positionName = H.requiredText(input.position_name, "Organization Position position_name");
    const company = H.requiredText(input.company, "Organization Position company");
    const branch = H.requiredText(input.branch, "Organization Position branch");
    const department = H.requiredText(input.department, "Organization Position department");
    const designation = H.requiredText(input.designation, "Organization Position designation");
    await H.requireRecord(context, "Company", company);
    const branchData = await H.requireRecord(context, "Branch", branch);
    const departmentData = await H.requireRecord(context, "Department", department);
    await H.requireRecord(context, "Designation", designation);
    if (H.text(branchData.company) && H.text(branchData.company) !== company) throw errors.reference(`Branch ${branch} belongs to another company`);
    if (H.text(departmentData.company) && H.text(departmentData.company) !== company) throw errors.reference(`Department ${department} belongs to another company`);
    const plannedSeats = H.integer(input.planned_seats, 1);
    if (plannedSeats < 1 || plannedSeats > 100_000) throw errors.validation("Organization Position planned_seats must be between 1 and 100000");
    const parentPosition = H.text(input.parent_position);
    if (parentPosition) {
      if (parentPosition === positionCode || parentPosition === context.command.aggregate.name) throw errors.validation("Organization Position cannot be its own parent");
      const visited = new Set<string>([positionCode, context.command.aggregate.name]);
      let cursor = parentPosition;
      for (let depth = 0; cursor; depth += 1) {
        if (depth > 100) throw errors.reference("Organization Position hierarchy exceeds 100 levels");
        if (visited.has(cursor)) throw errors.reference("Organization Position hierarchy cycle detected");
        visited.add(cursor);
        const parent = await H.requireRecord(context, "Organization Position", cursor);
        if (H.text(parent.company) !== company) throw errors.reference(`Parent position ${cursor} belongs to another company`);
        cursor = H.text(parent.parent_position);
      }
    }
    return { ...input, position_code: positionCode, position_name: positionName, company, branch, department, designation, ...(parentPosition ? { parent_position: parentPosition } : {}), planned_seats: plannedSeats, active: H.truthy(input.active ?? 1) ? 1 : 0 };
  }
}

export class EmployeePositionAssignmentController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Position Assignment";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee Position Assignment employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const positionName = H.requiredText(input.position, "Employee Position Assignment position");
    const position = await H.requireRecord(context, "Organization Position", positionName);
    if (!H.truthy(position.active ?? 1)) throw errors.reference(`Organization Position ${positionName} is inactive`);
    const fromDate = H.requiredDate(input.from_date, "Employee Position Assignment from_date");
    const toDate = H.optionalDate(input.to_date, "Employee Position Assignment to_date");
    if (toDate && toDate < fromDate) throw errors.validation("Employee Position Assignment to_date must not precede from_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(state, employeeName, fromDate);
    const company = H.requiredText(position.company, "Organization Position company");
    const branch = H.requiredText(position.branch, "Organization Position branch");
    const department = H.requiredText(position.department, "Organization Position department");
    const designation = H.requiredText(position.designation, "Organization Position designation");
    if (H.text(state.company) !== company || H.text(state.branch) !== branch || H.text(state.department) !== department || H.text(state.designation) !== designation) {
      throw errors.reference(`Employee ${employeeName} current organization scope does not match Organization Position ${positionName}`);
    }
    if (context.command.action === "submit") {
      const assignments = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      const overlapping = assignments.filter((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.rangesOverlap(fromDate, toDate, H.requiredDate(item.data.from_date, `Position Assignment ${item.name} from_date`), H.optionalDate(item.data.to_date, `Position Assignment ${item.name} to_date`)));
      if (overlapping.some((item) => H.text(item.data.employee) === employeeName)) {
        throw errors.reference(`Employee ${employeeName} already has an overlapping position assignment`);
      }
      const seatsUsed = overlapping.filter((item) => H.text(item.data.position) === positionName).length;
      const plannedSeats = H.integer(position.planned_seats, 1);
      if (seatsUsed >= plannedSeats) throw errors.reference(`Organization Position ${positionName} has no free planned seat in this period`);
    }
    return { ...input, employee: employeeName, position: positionName, company, branch, department, designation, from_date: fromDate, ...(toDate ? { to_date: toDate } : {}) };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Assigned" : super.status(context, context.command.document);
  }
}
