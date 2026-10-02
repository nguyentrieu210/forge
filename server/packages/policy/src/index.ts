import type { Actor, MutationAction } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type PermissionAction = MutationAction | "read" | "delete" | "print" | "email" | "report" | "import" | "export" | "share" | "amend";

export interface PermissionRequest {
  actor: Actor;
  doctype: string;
  action: PermissionAction;
  owner?: string;
}

interface DoctypePermission {
  read: readonly string[];
  create: readonly string[];
  save: readonly string[];
  delete: readonly string[];
  submit: readonly string[];
  cancel: readonly string[];
}

export const STATIC_DOCTYPE_PERMISSIONS: Record<string, DoctypePermission> = {
  "Sales Order": matrix(["Sales Manager", "Sales User"], ["Sales Manager"]),
  "Delivery Note": matrix(["Sales Manager", "Sales User", "Stock Manager", "Stock User"], ["Sales Manager", "Stock Manager"]),
  "Sales Invoice": matrix(["Sales Manager", "Sales User", "Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Payment Entry": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Payment Allocation": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Journal Entry": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Period Closing Voucher": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Purchase Order": matrix(["Purchase Manager", "Purchase User"], ["Purchase Manager"]),
  "Purchase Receipt": matrix(["Purchase Manager", "Purchase User", "Stock Manager", "Stock User"], ["Purchase Manager", "Stock Manager"]),
  "Purchase Invoice": matrix(["Purchase Manager", "Purchase User", "Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Stock Entry": matrix(["Stock Manager", "Stock User"], ["Stock Manager"]),
  "Serial and Batch Bundle": matrix(["Stock Manager", "Stock User"], ["Stock Manager"]),
  "Repost Item Valuation": matrix(["Stock Manager", "Stock User"], ["Stock Manager"]),
  "Stock Return": matrix(["Stock Manager", "Stock User"], ["Stock Manager"]),
  "Credit Note": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Debit Note": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Bill of Materials": matrix(["Manufacturing Manager", "Manufacturing User"], ["Manufacturing Manager"]),
  "Work Order": matrix(["Manufacturing Manager", "Manufacturing User"], ["Manufacturing Manager"]),
  "Asset": matrix(["Asset Manager", "Asset User"], ["Asset Manager"]),
  "Asset Depreciation Entry": matrix(["Asset Manager", "Asset User", "Accounts Manager", "Accounts User"], ["Asset Manager", "Accounts Manager"]),
  "Production Plan": matrix(["Manufacturing Manager", "Manufacturing User"], ["Manufacturing Manager"]),
  "Job Card": matrix(["Manufacturing Manager", "Manufacturing User"], ["Manufacturing Manager", "Manufacturing User"]),
  "Asset Movement": matrix(["Asset Manager", "Asset User"], ["Asset Manager"]),
  "Asset Maintenance": matrix(["Asset Manager", "Asset User"], ["Asset Manager"]),
  "Asset Disposal": matrix(["Asset Manager", "Asset User", "Accounts Manager", "Accounts User"], ["Asset Manager", "Accounts Manager"]),
  "Timesheet": matrix(["Projects Manager", "Projects User"], ["Projects Manager"]),
  "Quality Inspection": matrix(["Quality Manager", "Quality User"], ["Quality Manager"]),
  "Issue": matrix(["Support Manager", "Support Team"], ["Support Manager"]),
  "Expense Claim": matrix(["Expense Approver", "Employee", "Accounts Manager", "Accounts User"], ["Expense Approver", "Accounts Manager"]),
  "POS Opening Entry": matrix(["Sales Manager", "Sales User", "POS Manager", "POS User"], ["Sales Manager", "Sales User", "POS Manager", "POS User"]),
  "POS Invoice": matrix(["Sales Manager", "Sales User", "POS Manager", "POS User"], ["Sales Manager", "Sales User", "POS Manager", "POS User"]),
  "POS Closing Entry": matrix(["Sales Manager", "Sales User", "POS Manager", "POS User"], ["Sales Manager", "Sales User", "POS Manager", "POS User"]),
  "Bank Transaction": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Bank Reconciliation": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Salary Slip": matrix(["HR Manager", "HR User", "Payroll Manager", "Payroll User", "Accounts Manager"], ["Payroll Manager", "HR Manager", "Accounts Manager"]),
  "Payroll Entry": matrix(["HR Manager", "Payroll Manager", "Payroll User", "Accounts Manager"], ["Payroll Manager", "HR Manager", "Accounts Manager"]),
  "Subscription": matrix(["Sales Manager", "Sales User", "Accounts Manager", "Accounts User"], ["Sales Manager", "Accounts Manager"]),
  "E-Invoice Submission": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
};

const REPORT_PERMISSIONS: Record<string, readonly string[]> = {
  "Accounts Receivable": ["Accounts Manager", "Accounts User", "Sales Manager"],
  "Accounts Receivable Aging": ["System Manager", "Accounts Manager", "Accounts User", "Sales Manager"],
  "Accounts Payable": ["Accounts Manager", "Accounts User", "Purchase Manager"],
  "Accounts Payable Aging": ["System Manager", "Accounts Manager", "Accounts User", "Purchase Manager"],
  "Party Statement": ["Accounts Manager", "Accounts User"],
  "Supplier Statement": ["System Manager", "Accounts Manager", "Accounts User", "Purchase Manager"],
  "Supplier Reconciliation": ["System Manager", "Accounts Manager", "Accounts User"],
  "Debt Summary": ["Accounts Manager", "Accounts User"],
  "Advance Balance": ["Accounts Manager", "Accounts User"],
  "Daily Detailed Ledger": [
    "General Accountant",
    "Chief Accountant",
    "Director",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
    "Giám đốc",
  ],
  "Finance Daily Detailed Ledger": [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ],
  "Finance Reconciliation Diagnostics": [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ],
  "Finance Budget vs Actual": [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ],
  "Stock Valuation Reconciliation": [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ],
  "Stock Balance": ["Stock Manager", "Stock User"],
  "Stock Ledger": ["Stock Manager", "Stock User", "Accounts Manager"],
  "Batch Stock Balance": ["Stock Manager", "Stock User"],
  "Tồn nhôm theo khổ": ["Stock Manager", "Stock User", "Chủ xưởng", "Thủ kho", "Sản xuất", "Kế toán"],
  "Serial Number Status": ["Stock Manager", "Stock User"],
  "Work Order Progress": ["Manufacturing Manager", "Manufacturing User", "Stock Manager"],
  "Asset Depreciation Ledger": ["Asset Manager", "Asset User", "Accounts Manager", "Accounts User"],
  "General Ledger": ["Accounts Manager", "Accounts User"],
  "Trial Balance": ["Accounts Manager", "Accounts User"],
  "Profit and Loss": ["Accounts Manager", "Accounts User"],
  "Balance Sheet": ["Accounts Manager", "Accounts User"],
  "Cash Flow": ["Accounts Manager", "Accounts User"],
  "Asset Lifecycle": ["Asset Manager", "Asset User", "Accounts Manager"],
  "Project Profitability": ["Projects Manager", "Projects User", "Accounts Manager"],
  "POS Session Summary": ["Sales Manager", "Sales User", "Accounts Manager"],
  "Bank Reconciliation Summary": ["Accounts Manager", "Accounts User"],
  "Payroll Register": ["HR Manager", "Payroll Manager", "Payroll User", "Accounts Manager"],
  "Subscription Schedule": ["Sales Manager", "Sales User", "Accounts Manager"],
  "E-Invoice Submission Log": ["Accounts Manager", "Accounts User"],
};

export class PermissionService {
  assert(request: PermissionRequest): void {
    if (isAdministrator(request.actor)) return;
    if (request.actor.roles.includes("System Manager")) return;
    const permission = STATIC_DOCTYPE_PERMISSIONS[request.doctype];
    if (!permission) throw errors.permission();
    if (!["read", "create", "save", "delete", "submit", "cancel"].includes(request.action)) throw errors.permission();
    const roles = permission[request.action as keyof DoctypePermission];
    if (!hasAnyRole(request.actor, roles)) throw errors.permission(`Role is not allowed to ${request.action} ${request.doctype}`);
  }

  assertReport(actor: Actor, report: string): void {
    if (isAdministrator(actor)) return;
    const roles = REPORT_PERMISSIONS[report];
    if (!roles || !hasAnyRole(actor, roles)) throw errors.permission(`Role is not allowed to run ${report}`);
  }
}

function matrix(userRoles: readonly string[], approvalRoles: readonly string[]): DoctypePermission {
  return {
    read: [...userRoles],
    create: [...userRoles],
    save: [...userRoles],
    delete: [...approvalRoles],
    submit: [...approvalRoles],
    cancel: [...approvalRoles],
  };
}

function isAdministrator(actor: Actor): boolean {
  return actor.user_id === "Administrator" || actor.roles.includes("Administrator");
}

function hasAnyRole(actor: Actor, roles: readonly string[]): boolean {
  return actor.roles.some((role) => roles.includes(role));
}

export function hasStaticPermissionDefinition(doctype: string): boolean {
  return Object.hasOwn(STATIC_DOCTYPE_PERMISSIONS, doctype);
}
