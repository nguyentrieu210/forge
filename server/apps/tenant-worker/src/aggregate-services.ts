import { createO2CControllerRegistry } from "../../../packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../../packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../../../packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../../packages/clouderp-erpnext/src/index.js";
import { AppFactoryApprovalRuntime, registerAppFactoryControllers } from "../../../packages/app-registry/src/index.js";
import { D1RolloutPurchaseAllocationDomainStore, DocumentKernel } from "../../../packages/document-kernel/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, GenericMetadataController, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import { registerIntegrationHubControllers } from "../../../packages/integration-hub/src/registry.js";
import { D1OrganizationSecurityGuard } from "../../../packages/organization-security/src/index.js";
import type { TenantEnv } from "./env.js";

export interface AggregateCommandServices {
  kernel: DocumentKernel;
  store: D1RolloutPurchaseAllocationDomainStore;
}

export function createAggregateCommandServices(env: TenantEnv): AggregateCommandServices {
  const metadata = new D1MetadataStore(env.DB);
  const registry = registerIntegrationHubControllers(
    registerAppFactoryControllers(
      registerErpNextCoreControllers(
        registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
      ),
      metadata,
    ),
  ).setFallback(new GenericMetadataController(metadata));
  const store = new D1RolloutPurchaseAllocationDomainStore(env.DB);
  const permissionService = new MetadataPermissionService(
    metadata,
    undefined,
    new D1DocumentAccessStore(env.DB),
  );
  return {
    store,
    kernel: new DocumentKernel(registry, store, permissionService),
  };
}

export function createAggregateAppFactoryApprovalRuntime(env: TenantEnv): AppFactoryApprovalRuntime {
  const metadata = new D1MetadataStore(env.DB);
  const access = new D1DocumentAccessStore(env.DB);
  const reader = new D1RolloutPurchaseAllocationDomainStore(env.DB);
  return new AppFactoryApprovalRuntime(
    env.DB,
    reader,
    new MetadataPermissionService(metadata, undefined, access),
    new D1OrganizationSecurityGuard(env.DB, metadata),
  );
}
