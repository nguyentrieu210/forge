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
import { inventoryCoordinatorKey, isInventoryCoordinatedCommand } from "./inventory-coordinator.js";
import { PurchaseCommandSerialExecutor } from "./purchase-command-retry.js";

interface AggregateStub extends DurableObjectStub {
  mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutateInventory<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
}

const PURCHASE_ALLOCATION_DOCTYPES = new Set(["Purchase Order", "Purchase Receipt"]);

/**
 * One class serves several logical coordinator roles inside the existing AGGREGATES
 * namespace:
 *
 * - document key: tenant:doctype:name for ordinary aggregates;
 * - inventory key: inventory:tenant:company for every Stock Entry and Work Order
 *   submit/cancel that can compete for stock or production limits;
 * - purchase key: purchase:tenant:company:supplier for PO/Receipt allocation.
 *
 * Company-wide inventory serialization is deliberately broader than batch-level locking:
 * one multi-row voucher has exactly one lock, so there is no lock-order deadlock and no
 * race between differently named Stock Entries consuming the same physical stock.
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
    const inventoryKey = await this.resolveInventoryKey(command);
    if (inventoryKey) {
      const stub = this.env.AGGREGATES.getByName(inventoryKey) as AggregateStub;
      return stub.mutateInventory(command);
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
  async mutateInventory<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!isInventoryCoordinatedCommand(command as MutationCommand<JsonObject>)) {
      throw errors.validation("mutateInventory accepts only Stock Entry/Work Order submit or cancel commands");
    }
    return this.kernel.execute(command);
  }

  /** Called only by another instance in this Worker's AGGREGATES namespace. */
  async mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!PURCHASE_ALLOCATION_DOCTYPES.has(command.aggregate.doctype)
      || !["submit", "cancel"].includes(command.action)) {
      throw errors.validation("mutatePurchase accepts only submitted purchase allocation commands");
    }
    return this.purchaseExecutor.execute(() => this.kernel.execute(command));
  }

  private async resolveInventoryKey<T extends JsonObject>(command: MutationCommand<T>): Promise<string | null> {
    const direct = inventoryCoordinatorKey(command as MutationCommand<JsonObject>);
    if (direct || !isInventoryCoordinatedCommand(command as MutationCommand<JsonObject>)) return direct;
    const existing = await this.store.getDocument<JsonObject>(
      command.tenant_id,
      command.aggregate.doctype,
      command.aggregate.name,
    );
    return inventoryCoordinatorKey(command as MutationCommand<JsonObject>, existing?.data);
  }
}

function textField(value: JsonObject | undefined, field: string): string {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate.trim() : "";
}
