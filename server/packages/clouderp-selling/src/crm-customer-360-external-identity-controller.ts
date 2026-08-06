import type { ChildRow, MutationPlan } from "../../contracts/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { CrmCustomer360Controller } from "./crm-customer-360-controller.js";
import type { CrmCustomer360Data } from "./crm-customer-360-types.js";
import type {
  CrmCustomer360ExternalIdentityData,
  CrmCustomerExternalIdentityData,
} from "./crm-external-identity-types.js";

/**
 * Non-invasive Customer 360 extension. The existing CRM/O2C snapshot remains the
 * authority for its current fields; this decorator appends privacy-safe channel
 * identity references from canonical CRM documents.
 */
export class CrmCustomer360ExternalIdentityController implements DocumentController<CrmCustomer360Data> {
  readonly doctype = "CRM Customer 360";
  private readonly base = new CrmCustomer360Controller();

  async buildPlan(context: ControllerContext<CrmCustomer360Data>): Promise<MutationPlan<CrmCustomer360Data>> {
    const plan = await this.base.buildPlan(context);
    const data = plan.document.data;
    const identities = await context.reader.listDocumentsByDoctype<CrmCustomerExternalIdentityData>(
      context.command.tenant_id,
      "CRM Customer External Identity",
    );
    const rows = identities
      .filter((document) => document.data.company === data.company
        && document.data.linked_customer === data.customer
        && document.data.identity_status === "Active")
      .sort((left, right) => left.data.provider.localeCompare(right.data.provider)
        || (left.data.scope_label ?? "").localeCompare(right.data.scope_label ?? "")
        || left.name.localeCompare(right.name))
      .map((document): CrmCustomer360ExternalIdentityData => ({
        row_id: document.name,
        identity: document.name,
        provider: document.data.provider,
        ...(document.data.scope_label ? { scope_label: document.data.scope_label } : {}),
        identity_status: document.data.identity_status,
        linked_at: document.data.linked_at,
      }));

    data.external_identity_count = rows.length;
    data.external_identities = rows;
    plan.document.children = [
      ...plan.document.children,
      ...identityChildren(rows),
    ];
    return plan;
  }
}

function identityChildren(rows: CrmCustomer360ExternalIdentityData[]): ChildRow[] {
  return rows.map((row, index): ChildRow => ({
    fieldname: "external_identities",
    child_doctype: "CRM Customer 360 External Identity",
    row_id: row.row_id,
    idx: index + 1,
    data: row,
  }));
}
