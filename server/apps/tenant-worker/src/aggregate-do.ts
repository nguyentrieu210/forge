import { DurableObject } from "cloudflare:workers";
import type { JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { createO2CControllerRegistry } from "../../../packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../../packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../../../packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../../packages/clouderp-erpnext/src/index.js";
import { D1PurchaseAllocationMutationStore, DocumentKernel } from "../../../packages/document-kernel/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, GenericMetadataController, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import type { TenantEnv } from "./env.js";

export class AggregateCoordinator extends DurableObject<TenantEnv> {
  private readonly kernel: DocumentKernel;

  constructor(ctx: DurableObjectState, env: TenantEnv) {
    super(ctx, env);
    const metadata = new D1MetadataStore(env.DB);
    const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry()))).setFallback(new GenericMetadataController(metadata));
    this.kernel = new DocumentKernel(registry, new D1PurchaseAllocationMutationStore(env.DB), new MetadataPermissionService(metadata, undefined, new D1DocumentAccessStore(env.DB)));
  }

  async mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    return this.kernel.execute(command);
  }
}
