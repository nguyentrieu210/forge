import { DurableObject } from "cloudflare:workers";
import type { JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { createO2CControllerRegistry } from "../../../packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../../packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../../../packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../../packages/clouderp-erpnext/src/index.js";
import { D1RolloutPurchaseAllocationDomainStore, DocumentKernel } from "../../../packages/document-kernel/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, GenericMetadataController, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import type { TenantEnv } from "./env.js";
import { manufacturingCoordinatorKey } from "./manufacturing-coordinator.js";
import { PurchaseCommandSerialExecutor } from "./purchase-command-retry.js";

interface AggregateStub extends DurableObjectStub {
  mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutateManufacturing<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
}

const PURCHASE_ALLOCATION_DOCTYPES = new Set(["Purchase Order", "Purchase Receipt"]);

/**
 * One class serves several logical coordinator roles inside the existing AGGREGATES
 * namespace:
 *
 * - document key: tenant:doctype:name, preserving ordinary aggregate serialization;
 * - purchase key: purchase:tenant:company:supplier, serializing every PO/Receipt
 *   that can compete for the same supplier obligations;
 * - Work Order key: tenant:Work Order:name, serializing the Work Order and every
 *   Material Transfer/Manufacture Stock Entry that competes for its snapshot limits.
 *
 * Reusing the namespace avoids extra bindings and schema churn while making each lock
 * follow the business invariant rather than whichever voucher name happened to arrive.
 */
export class AggregateCoordinator extends DurableObject<TenantEnv> {
  private readonly kernel: DocumentKernel;
  private readonly store: D1RolloutPurchaseAllocationDomainStore;
  private readonly purchaseExecutor = new PurchaseCommandSerialExecutor();

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
    const manufacturingKey = await this.resolveManufacturingKey(command);
    if (manufacturingKey) {
      const stub = this.env.AGGREGATES.getByName(manufacturingKey) as AggregateStub;
      return stub.mutateManufacturing(command);
    }

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
    return this.purchaseExecutor.execute(() => this.kernel.execute(command));
  }

  /** Called only by a Stock Entry coordinator that resolved the same Work Order key. */
  async mutateManufacturing<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    const key = await this.resolveManufacturingKey(command);
    if (!key) {
      throw errors.validation("mutateManufacturing accepts only Work Order stock commands");
    }
    return this.kernel.execute(command);
  }

  private async resolveManufacturingKey<T extends JsonObject>(command: MutationCommand<T>): Promise<string | null> {
    const direct = manufacturingCoordinatorKey(command as MutationCommand<JsonObject>);
    if (direct || command.aggregate.doctype !== "Stock Entry") return direct;
    const existing = await this.store.getDocument<JsonObject>(
      command.tenant_id,
      command.aggregate.doctype,
      command.aggregate.name,
    );
    return manufacturingCoordinatorKey(command as MutationCommand<JsonObject>, existing?.data);
  }
}

function textField(value: JsonObject | undefined, field: string): string {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate.trim() : "";
}
