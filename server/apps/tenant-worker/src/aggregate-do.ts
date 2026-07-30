import { DurableObject } from "cloudflare:workers";
import type { JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { createO2CControllerRegistry } from "../../../packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../../packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../../../packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../../packages/clouderp-erpnext/src/index.js";
import { D1RolloutPurchaseAllocationDomainStore, DocumentKernel } from "../../../packages/document-kernel/src/index.js";
import { asCloudForgeError, errors } from "../../../packages/core/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, GenericMetadataController, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import type { TenantEnv } from "./env.js";

interface AggregateStub extends DurableObjectStub {
  mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
}

const PURCHASE_ALLOCATION_DOCTYPES = new Set(["Purchase Order", "Purchase Receipt"]);
const PURCHASE_REVISION_RETRIES = 3;

/**
 * One class serves two logical coordinator roles inside the existing AGGREGATES
 * namespace:
 *
 * - document key: tenant:doctype:name, preserving ordinary aggregate serialization;
 * - purchase key: purchase:tenant:company:supplier, serializing every PO/Receipt
 *   that can compete for the same supplier obligations.
 *
 * Reusing the namespace avoids a second Durable Object binding and migration while
 * still giving all competing receipts exactly one lock. The supplier-key instance
 * enters through mutatePurchase(), which executes directly and therefore cannot
 * recursively route back to itself.
 */
export class AggregateCoordinator extends DurableObject<TenantEnv> {
  private readonly kernel: DocumentKernel;
  private readonly store: D1RolloutPurchaseAllocationDomainStore;

  constructor(ctx: DurableObjectState, env: TenantEnv) {
    super(ctx, env);
    const metadata = new D1MetadataStore(env.DB);
    const registry = registerErpNextCoreControllers(
      registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
    ).setFallback(new GenericMetadataController(metadata));
    this.store = new D1RolloutPurchaseAllocationDomainStore(env.DB);
    this.kernel = new DocumentKernel(
      registry,
      this.store,
      new MetadataPermissionService(metadata, undefined, new D1DocumentAccessStore(env.DB)),
    );
  }

  async mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!PURCHASE_ALLOCATION_DOCTYPES.has(command.aggregate.doctype)
      || !["submit", "cancel"].includes(command.action)) {
      return this.kernel.execute(command);
    }

    let company = textField(command.document, "company");
    let supplier = textField(command.document, "supplier");
    if (!company || !supplier) {
      const existing = await this.store.getDocument<JsonObject>(
        command.tenant_id,
        command.aggregate.doctype,
        command.aggregate.name,
      );
      company ||= textField(existing?.data, "company");
      supplier ||= textField(existing?.data, "supplier");
    }
    if (!company || !supplier) {
      throw errors.validation("Purchase allocation commands require company and supplier");
    }

    const key = `purchase:${command.tenant_id}:${encodeURIComponent(company)}:${encodeURIComponent(supplier)}`;
    const stub = this.env.AGGREGATES.getByName(key) as AggregateStub;
    return stub.mutatePurchase(command);
  }

  /** Called only by another instance in this Worker's AGGREGATES namespace. */
  async mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!PURCHASE_ALLOCATION_DOCTYPES.has(command.aggregate.doctype)
      || !["submit", "cancel"].includes(command.action)) {
      throw errors.validation("mutatePurchase accepts only submitted purchase allocation commands");
    }

    for (let attempt = 1; attempt <= PURCHASE_REVISION_RETRIES; attempt += 1) {
      try {
        return await this.kernel.execute(command);
      } catch (error) {
        const normalized = asCloudForgeError(error);
        if (normalized.code !== "PURCHASE_ALLOCATION_REVISION_CONFLICT"
          || attempt === PURCHASE_REVISION_RETRIES) {
          throw normalized;
        }
      }
    }
    throw errors.purchaseAllocationConflict();
  }
}

function textField(value: JsonObject | undefined, field: string): string {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate.trim() : "";
}
