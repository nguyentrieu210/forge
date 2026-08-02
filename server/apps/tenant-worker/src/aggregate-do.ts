import { DurableObject } from "cloudflare:workers";
import type { JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { createO2CControllerRegistry } from "../../../packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../../packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../../../packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../../packages/clouderp-erpnext/src/index.js";
import { D1RolloutPurchaseAllocationDomainStore, DocumentKernel } from "../../../packages/document-kernel/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, GenericMetadataController, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import { registerIntegrationHubControllers } from "../../../packages/integration-hub/src/registry.js";
import type { TenantEnv } from "./env.js";
import { isInventoryCoordinatedCommand, resolveInventoryCoordinatorKey } from "./inventory-coordinator.js";
import { PurchaseCommandSerialExecutor } from "./purchase-command-retry.js";

interface AggregateStub extends DurableObjectStub {
  mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutateInventory<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
}

const PURCHASE_ALLOCATION_DOCTYPES = new Set(["Purchase Order", "Purchase Receipt"]);
const PURCHASE_EXECUTORS = new WeakMap<object, PurchaseCommandSerialExecutor>();

/**
 * One class serves several logical coordinator roles inside the existing AGGREGATES
 * namespace:
 *
 * - document key: tenant:doctype:name for ordinary aggregates;
 * - inventory key: inventory:tenant:company for stock posting, cutting,
 *   reconciliation and reservation read-check-write mutations;
 * - purchase key: purchase:tenant:company:supplier for PO/Receipt allocation.
 *
 * Company-wide inventory serialization is deliberately broader than batch-level locking:
 * one multi-row voucher has exactly one lock, so there is no lock-order deadlock and no
 * race between differently named documents consuming or reserving the same physical stock.
 */
export class AggregateCoordinator extends DurableObject<TenantEnv> {
  constructor(ctx: DurableObjectState, env: TenantEnv) {
    super(ctx, env);
  }

  async mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    const { kernel, store } = this.commandServices();
    const inventoryKey = await resolveInventoryCoordinatorKey(
      command as MutationCommand<JsonObject>,
      store,
    );
    if (inventoryKey) {
      const stub = this.env.AGGREGATES.getByName(inventoryKey) as AggregateStub;
      return stub.mutateInventory(command);
    }

    if (!PURCHASE_ALLOCATION_DOCTYPES.has(command.aggregate.doctype)
      || !["submit", "cancel"].includes(command.action)) {
      return kernel.execute(command);
    }

    let company = textField(command.document, "company");
    let supplier = textField(command.document, "supplier");
    if (!company || !supplier) {
      const existing = await store.getDocument<JsonObject>(
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
  async mutateInventory<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!isInventoryCoordinatedCommand(command as MutationCommand<JsonObject>)) {
      throw errors.validation("mutateInventory accepts only coordinated inventory commands");
    }
    return this.commandServices().kernel.execute(command);
  }

  /** Called only by another instance in this Worker's AGGREGATES namespace. */
  async mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!PURCHASE_ALLOCATION_DOCTYPES.has(command.aggregate.doctype)
      || !["submit", "cancel"].includes(command.action)) {
      throw errors.validation("mutatePurchase accepts only submitted purchase allocation commands");
    }
    const kernel = this.commandServices().kernel;
    let executor = PURCHASE_EXECUTORS.get(this);
    if (!executor) {
      executor = new PurchaseCommandSerialExecutor();
      PURCHASE_EXECUTORS.set(this, executor);
    }
    return executor.execute(() => kernel.execute(command));
  }

  /**
   * D1 sessions are request-scoped. Initializing command services in the Durable
   * Object constructor happens outside an RPC request and makes Workerd reject every
   * write before the method body runs. Construct them per invocation so each session
   * is created inside the request that owns it.
   */
  private commandServices(): { kernel: DocumentKernel; store: D1RolloutPurchaseAllocationDomainStore } {
    const metadata = new D1MetadataStore(this.env.DB);
    const registry = registerIntegrationHubControllers(
      registerErpNextCoreControllers(
        registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
      ),
    ).setFallback(new GenericMetadataController(metadata));
    const store = new D1RolloutPurchaseAllocationDomainStore(this.env.DB);
    return {
      store,
      kernel: new DocumentKernel(
        registry,
        store,
        new MetadataPermissionService(metadata, undefined, new D1DocumentAccessStore(this.env.DB)),
      ),
    };
  }
}

function textField(value: JsonObject | undefined, field: string): string {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate.trim() : "";
}
