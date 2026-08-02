import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class OvertimeRequestController extends SuiteController<JsonObject> {
  readonly doctype = "Overtime Request";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    H.assertEmployeeActive(employee, employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);

    const date = H.requiredDate(input.overtime_date, "Overtime date");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, date);
    H.assertEmployeeStateActive(employeeState, employeeName, date);
    const fromTime = H.requiredTime(input.from_time, "Overtime from_time");
    const toTime = H.requiredTime(input.to_time, "Overtime to_time");
    const requestedMinutes = H.timeRangeMinutes(fromTime, toTime);
    if (requestedMinutes <= 0 || requestedMinutes > 24 * 60) throw errors.validation("Overtime duration must be between 1 minute and 24 hours");

    if (context.command.action === "submit") {
      const requests = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (requests.some((request) =>
        request.name !== context.command.aggregate.name
        && request.docstatus === 1
        && H.text(request.data.employee) === employeeName
        && H.text(request.data.overtime_date) === date
      )) throw errors.exists(`Employee ${employeeName} already has approved overtime for ${date}`);
    }

    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(employeeState.company, "Employee company"),
      branch: H.requiredText(employeeState.branch, "Employee branch"),
      overtime_date: date,
      from_time: fromTime,
      to_time: toTime,
      requested_minutes: requestedMinutes,
      approved_minutes: context.command.action === "submit" ? requestedMinutes : 0,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class LeaveAllocationController extends SuiteController<JsonObject> {
  readonly doctype = "Leave Allocation";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const leaveType = H.requiredText(input.leave_type, "Leave Type");
    await H.requireRecord(context, "Leave Type", leaveType);
    const fromDate = H.requiredDate(input.from_date, "Leave Allocation from_date");
    const toDate = H.requiredDate(input.to_date, "Leave Allocation to_date");
    if (toDate < fromDate) throw errors.validation("Leave Allocation to_date must not precede from_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(state, employeeName, fromDate);
    const policyName = H.requiredText(input.leave_policy, "Leave Policy");
    const policy = await H.requireSubmitted(context, "Leave Policy", policyName);
    if (H.text(policy.company) !== H.text(state.company) || H.text(policy.leave_type) !== leaveType) {
      throw errors.reference(`Leave Policy ${policyName} does not match employee company/leave type`);
    }
    if (H.text(policy.effective_from) > fromDate || (H.text(policy.effective_to) && H.text(policy.effective_to) < toDate)) {
      throw errors.reference(`Leave Policy ${policyName} is not effective for the allocation period`);
    }
    const allocated = H.numeric(input.allocated_days, NaN);
    const annual = H.numeric(policy.annual_days, NaN);
    if (!Number.isFinite(allocated) || allocated < 0 || !Number.isFinite(annual) || annual < 0) {
      throw errors.validation("Leave allocation days must be non-negative");
    }
    if (allocated > annual + 1e-9) throw errors.reference(`Allocated days exceed Leave Policy ${policyName}`);
    const carry = H.numeric(input.carry_forward_days, 0);
    if (carry < 0) throw errors.validation("carry_forward_days cannot be negative");
    if (!H.truthy(policy.allow_carry_forward) && carry > 0) throw errors.reference(`Leave Policy ${policyName} does not allow carry forward`);
    if (carry > H.numeric(policy.max_carry_forward_days, 0) + 1e-9) throw errors.reference(`carry_forward_days exceed Leave Policy ${policyName}`);
    const holidayList = H.requiredText(policy.holiday_list, "Leave Policy holiday_list");
    const holiday = await H.requireSubmitted(context, "Holiday List", holidayList);
    if (H.text(holiday.company) !== H.text(state.company)) throw errors.reference("Holiday List belongs to another company");
    if (context.command.action === "submit") {
      const allocations = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (allocations.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.employee) === employeeName && H.text(item.data.leave_type) === leaveType
        && H.rangesOverlap(fromDate, toDate, H.text(item.data.from_date), H.text(item.data.to_date)))) {
        throw errors.reference(`Employee ${employeeName} already has an overlapping Leave Allocation for ${leaveType}`);
      }
    }
    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(state.company, "Employee company"),
      leave_type: leaveType,
      leave_policy: policyName,
      from_date: fromDate,
      to_date: toDate,
      allocated_days: allocated,
      carry_forward_days: carry,
      holiday_list: holidayList,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Allocated" : super.status(context, context.command.document);
  }
}

export class LeaveApplicationController extends SuiteController<JsonObject> {
  readonly doctype = "Leave Application";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    H.assertEmployeeActive(employee, employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);

    const leaveType = H.requiredText(input.leave_type, "Leave Type");
    const fromDate = H.requiredDate(input.from_date, "Leave from_date");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(employeeState, employeeName, fromDate);
    const toDate = H.requiredDate(input.to_date, "Leave to_date");
    if (toDate < fromDate) throw errors.validation("Leave to_date must not precede from_date");

    const allocations = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Leave Allocation");
    const applicable = allocations
      .filter((allocation) => allocation.docstatus === 1
        && H.text(allocation.data.employee) === employeeName
        && H.text(allocation.data.leave_type) === leaveType
        && H.text(allocation.data.from_date) <= fromDate
        && H.text(allocation.data.to_date) >= toDate)
      .sort((left, right) => H.text(right.data.from_date).localeCompare(H.text(left.data.from_date)));
    const allocation = applicable[0];
    if (!allocation) throw errors.reference(`No approved Leave Allocation covers ${fromDate} to ${toDate} for ${employeeName}`);

    const holidayListName = H.requiredText(allocation.data.holiday_list, "Leave Allocation holiday_list");
    const holidayListDoc = await H.requireSubmitted(context, "Holiday List", holidayListName);
    const weeklyOff = H.parseWeeklyOff(H.text(holidayListDoc.weekly_off_days));
    const holidays = H.parseHolidayDates(H.text(holidayListDoc.holidays_json));
    const halfDay = H.truthy(input.half_day);
    const halfDayDate = halfDay ? H.requiredDate(input.half_day_date, "half_day_date") : undefined;
    if (halfDayDate && (halfDayDate < fromDate || halfDayDate > toDate)) {
      throw errors.validation("half_day_date must fall inside the leave period");
    }
    let totalDays = H.workingDayCount(fromDate, toDate, weeklyOff, holidays);
    if (halfDay) {
      if (!halfDayDate || !H.isWorkingDay(halfDayDate, weeklyOff, holidays)) {
        throw errors.validation("Half-day leave must be on a working day");
      }
      totalDays -= 0.5;
    }
    if (totalDays <= 0) throw errors.validation("Leave Application has no working day to allocate");

    const applications = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
    let usedDays = 0;
    for (const application of applications) {
      if (application.name === context.command.aggregate.name || application.docstatus !== 1) continue;
      if (H.text(application.data.employee) !== employeeName || H.text(application.data.leave_type) !== leaveType) continue;
      const otherFrom = H.text(application.data.from_date);
      const otherTo = H.text(application.data.to_date);
      if (otherFrom && otherTo && H.rangesOverlap(fromDate, toDate, otherFrom, otherTo)) {
        throw errors.reference(`Employee ${employeeName} already has approved leave overlapping this period`);
      }
      if (otherFrom >= H.text(allocation.data.from_date) && otherTo <= H.text(allocation.data.to_date)) {
        usedDays += H.numeric(application.data.total_days, 0);
      }
    }
    const allocated = H.numeric(allocation.data.allocated_days, 0) + H.numeric(allocation.data.carry_forward_days, 0);
    if (allocated <= 0 || usedDays + totalDays > allocated + 1e-9) {
      throw errors.reference(`Insufficient leave balance for ${employeeName}: ${allocated - usedDays} days remaining`);
    }

    const policyName = H.text(allocation.data.leave_policy);
    if (policyName) {
      const policy = await H.requireSubmitted(context, "Leave Policy", policyName);
      const threshold = H.numeric(policy.requires_attachment_after_days, 0);
      if (threshold > 0 && totalDays >= threshold && !H.text(input.attachment)) {
        throw errors.validation(`Leave of ${totalDays} days requires an attachment under policy ${policyName}`);
      }
    }

    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(employeeState.company, "Employee company"),
      branch: H.requiredText(employeeState.branch, "Employee branch"),
      department: H.requiredText(employeeState.department, "Employee department"),
      leave_type: leaveType,
      leave_allocation: allocation.name,
      holiday_list: holidayListName,
      from_date: fromDate,
      to_date: toDate,
      total_days: totalDays,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class HolidayListController extends SuiteController<JsonObject> {
  readonly doctype = "Holiday List";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const company = H.requiredText(input.company, "Holiday List company");
    await H.requireRecord(context, "Company", company);
    const branch = H.text(input.branch);
    if (branch) {
      const branchData = await H.requireRecord(context, "Branch", branch);
      if (H.text(branchData.company) && H.text(branchData.company) !== company) throw errors.reference("Holiday List branch belongs to another company");
    }
    const fromDate = H.requiredDate(input.from_date, "Holiday List from_date");
    const toDate = H.requiredDate(input.to_date, "Holiday List to_date");
    if (toDate < fromDate) throw errors.validation("Holiday List to_date must not precede from_date");
    const weeklyOff = H.parseWeeklyOff(H.text(input.weekly_off_days));
    const holidays = H.parseHolidayDates(H.text(input.holidays_json));
    for (const holiday of holidays) {
      if (holiday < fromDate || holiday > toDate) throw errors.validation(`Holiday ${holiday} falls outside the Holiday List period`);
    }
    return { ...input, company, ...(branch ? { branch } : {}), from_date: fromDate, to_date: toDate, weekly_off_days: [...weeklyOff].sort().join(","), holidays_json: JSON.stringify([...holidays].sort()) };
  }
}

export class LeavePolicyController extends SuiteController<JsonObject> {
  readonly doctype = "Leave Policy";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const company = H.requiredText(input.company, "Leave Policy company");
    await H.requireRecord(context, "Company", company);
    const leaveType = H.requiredText(input.leave_type, "Leave Policy leave_type");
    await H.requireRecord(context, "Leave Type", leaveType);
    const fromDate = H.requiredDate(input.effective_from, "Leave Policy effective_from");
    const toDate = H.optionalDate(input.effective_to, "Leave Policy effective_to");
    if (toDate && toDate < fromDate) throw errors.validation("Leave Policy effective_to must not precede effective_from");
    const annualDays = H.numeric(input.annual_days, NaN);
    const carryDays = H.numeric(input.max_carry_forward_days, 0);
    const attachmentDays = H.numeric(input.requires_attachment_after_days, 0);
    if (!Number.isFinite(annualDays) || annualDays < 0 || carryDays < 0 || attachmentDays < 0) throw errors.validation("Leave Policy day values must be non-negative");
    if (!H.truthy(input.allow_carry_forward) && carryDays > 0) throw errors.validation("max_carry_forward_days requires allow_carry_forward");
    const holidayList = H.requiredText(input.holiday_list, "Leave Policy holiday_list");
    const holiday = await H.requireSubmitted(context, "Holiday List", holidayList);
    if (H.text(holiday.company) !== company) throw errors.reference("Leave Policy Holiday List belongs to another company");
    return { ...input, company, leave_type: leaveType, effective_from: fromDate, ...(toDate ? { effective_to: toDate } : {}), annual_days: annualDays, max_carry_forward_days: carryDays, requires_attachment_after_days: attachmentDays, holiday_list: holidayList };
  }
}
