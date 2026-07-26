import type { Actor, MutationAction } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type PermissionAction = MutationAction | "read" | "print" | "email" | "report" | "import" | "export" | "share" | "amend";

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
  submit: readonly string[];
  cancel: readonly string[];
}

const MANAGER = ["System Manager"] as const;
export const STATIC_DOCTYPE_PERMISSIONS: Record<string, DoctypePermission> = {
  "Sales Order": matrix(["Sales Manager", "Sales User"], ["Sales Manager"]),
  "Delivery Note": matrix(["Sales Manager", "Sales User", "Stock Manager", "Stock User"], ["Sales Manager", "Stock Manager"]),
  "Sales Invoice": matrix(["Sales Manager", "Sales User", "Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Payment Entry": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Journal Entry": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
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
  "POS Opening Entry": matrix(["Sales Manager", "Sales User"], ["Sales Manager", "Sales User"]),
  "POS Invoice": matrix(["Sales Manager", "Sales User"], ["Sales Manager", "Sales User"]),
  "POS Closing Entry": matrix(["Sales Manager", "Sales User"], ["Sales Manager", "Sales User"]),
  "Bank Transaction": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Bank Reconciliation": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
  "Salary Slip": matrix(["HR Manager", "HR User", "Payroll Manager", "Payroll User", "Accounts Manager"], ["Payroll Manager", "HR Manager", "Accounts Manager"]),
  "Payroll Entry": matrix(["HR Manager", "Payroll Manager", "Payroll User", "Accounts Manager"], ["Payroll Manager", "HR Manager", "Accounts Manager"]),
  "Subscription": matrix(["Sales Manager", "Sales User", "Accounts Manager", "Accounts User"], ["Sales Manager", "Accounts Manager"]),
  "E-Invoice Submission": matrix(["Accounts Manager", "Accounts User"], ["Accounts Manager"]),
};

const REPORT_PERMISSIONS: Record<string, readonly string[]> = {
  "Accounts Receivable": ["System Manager", "Accounts Manager", "Accounts User", "Sales Manager"],
  "Stock Balance": ["System Manager", "Stock Manager", "Stock User"],
  "Stock Ledger": ["System Manager", "Stock Manager", "Stock User", "Accounts Manager"],
  "Batch Stock Balance": ["System Manager", "Stock Manager", "Stock User"],
  "Serial Number Status": ["System Manager", "Stock Manager", "Stock User"],
  "Work Order Progress": ["System Manager", "Manufacturing Manager", "Manufacturing User", "Stock Manager"],
  "Asset Depreciation Ledger": ["System Manager", "Asset Manager", "Asset User", "Accounts Manager", "Accounts User"],
  "Accounts Payable": ["System Manager", "Accounts Manager", "Accounts User", "Purchase Manager"],
  "General Ledger": ["System Manager", "Accounts Manager", "Accounts User"],
  "Trial Balance": ["System Manager", "Accounts Manager", "Accounts User"],
  "Profit and Loss": ["System Manager", "Accounts Manager", "Accounts User"],
  "Balance Sheet": ["System Manager", "Accounts Manager", "Accounts User"],
  "Cash Flow": ["System Manager", "Accounts Manager", "Accounts User"],
  "Asset Lifecycle": ["System Manager", "Asset Manager", "Asset User", "Accounts Manager"],
  "Project Profitability": ["System Manager", "Projects Manager", "Projects User", "Accounts Manager"],
  "POS Session Summary": ["System Manager", "Sales Manager", "Sales User", "Accounts Manager"],
  "Bank Reconciliation Summary": ["System Manager", "Accounts Manager", "Accounts User"],
  "Payroll Register": ["System Manager", "HR Manager", "Payroll Manager", "Payroll User", "Accounts Manager"],
  "Subscription Schedule": ["System Manager", "Sales Manager", "Sales User", "Accounts Manager"],
  "E-Invoice Submission Log": ["System Manager", "Accounts Manager", "Accounts User"],
};

export class PermissionService {
  assert(request: PermissionRequest): void {
    if (isAdministrator(request.actor)) return;
    const permission = STATIC_DOCTYPE_PERMISSIONS[request.doctype];
    if (!permission) throw errors.permission();
    if (!["read", "create", "save", "submit", "cancel"].includes(request.action)) throw errors.permission();
    const baseAction = request.action as "read" | MutationAction;
    const roles = baseAction === "read" ? permission.read : permission[baseAction];
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
    read: [...MANAGER, ...userRoles],
    create: [...MANAGER, ...userRoles],
    save: [...MANAGER, ...userRoles],
    submit: [...MANAGER, ...approvalRoles],
    cancel: [...MANAGER, ...approvalRoles],
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
