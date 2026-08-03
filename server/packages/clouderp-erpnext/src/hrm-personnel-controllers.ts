import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class EmployeeDisciplineController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Discipline";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee Discipline employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const incidentDate = H.requiredDate(input.incident_date, "Employee Discipline incident_date");
    const effectiveDate = H.requiredDate(input.effective_date, "Employee Discipline effective_date");
    if (effectiveDate < incidentDate) throw errors.validation("Employee Discipline effective_date must not precede incident_date");
    const endDate = H.optionalDate(input.end_date, "Employee Discipline end_date");
    if (endDate && endDate < effectiveDate) throw errors.validation("Employee Discipline end_date must not precede effective_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, incidentDate);
    H.assertEmployeeStateActive(state, employeeName, incidentDate);
    const disciplineType = H.requiredText(input.discipline_type, "Employee Discipline discipline_type");
    if (!["Nhắc nhở", "Khiển trách", "Tạm đình chỉ", "Khác"].includes(disciplineType)) throw errors.validation("Employee Discipline discipline_type is invalid");
    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(state.company, "Employee company"),
      branch: H.text(state.branch),
      incident_date: incidentDate,
      effective_date: effectiveDate,
      ...(endDate ? { end_date: endDate } : {}),
      discipline_type: disciplineType,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Recorded" : super.status(context, context.command.document);
  }
}

export class PersonnelDocumentController extends SuiteController<JsonObject> {
  readonly doctype = "Personnel Document";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Personnel Document employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);
    const company = H.requiredText(employee.company, "Employee company");
    const documentType = H.requiredText(input.document_type, "Personnel Document document_type");
    const documentNo = H.requiredText(input.document_no, "Personnel Document document_no");
    const issueDate = H.optionalDate(input.issue_date, "Personnel Document issue_date");
    const expiryDate = H.optionalDate(input.expiry_date, "Personnel Document expiry_date");
    if (issueDate && expiryDate && expiryDate < issueDate) throw errors.validation("Personnel Document expiry_date must not precede issue_date");
    const warningDays = H.integer(input.expiry_warning_days, 30);
    if (warningDays < 0 || warningDays > 3650) throw errors.validation("Personnel Document expiry_warning_days must be between 0 and 3650");
    const attachment = H.requiredText(input.attachment, "Personnel Document attachment");
    const replacesDocument = H.text(input.replaces_document);
    if (replacesDocument) {
      if (replacesDocument === context.command.aggregate.name) throw errors.validation("Personnel Document cannot replace itself");
      const previous = await H.requireSubmitted(context, "Personnel Document", replacesDocument);
      if (H.text(previous.employee) !== employeeName || H.text(previous.document_type) !== documentType) {
        throw errors.reference(`Personnel Document ${replacesDocument} belongs to another employee/document type`);
      }
      const previousIssueDate = H.optionalDate(previous.issue_date, `Personnel Document ${replacesDocument} issue_date`);
      if (issueDate && previousIssueDate && issueDate < previousIssueDate) {
        throw errors.validation("Renewed Personnel Document issue_date cannot precede the replaced document issue_date");
      }
    }

    if (context.command.action === "submit") {
      const documents = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (documents.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.employee) === employeeName
        && H.text(item.data.document_type) === documentType
        && H.text(item.data.document_no) === documentNo)) {
        throw errors.exists(`Personnel Document ${documentType}/${documentNo} already exists for ${employeeName}`);
      }
      if (replacesDocument && documents.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.replaces_document) === replacesDocument)) {
        throw errors.exists(`Personnel Document ${replacesDocument} already has a submitted renewal/replacement`);
      }
    }

    const today = context.now.slice(0, 10);
    let documentStatus = "Không thời hạn";
    if (expiryDate) {
      if (expiryDate < today) documentStatus = "Hết hạn";
      else {
        const warningDate = new Date(Date.parse(`${expiryDate}T00:00:00Z`) - warningDays * 86_400_000).toISOString().slice(0, 10);
        documentStatus = today >= warningDate ? "Sắp hết hạn" : "Còn hiệu lực";
      }
    }
    return {
      ...input,
      employee: employeeName,
      company,
      document_type: documentType,
      document_no: documentNo,
      ...(replacesDocument ? { replaces_document: replacesDocument } : {}),
      ...(issueDate ? { issue_date: issueDate } : {}),
      ...(expiryDate ? { expiry_date: expiryDate } : {}),
      expiry_warning_days: warningDays,
      document_status: documentStatus,
      attachment,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Active" : super.status(context, context.command.document);
  }
}
