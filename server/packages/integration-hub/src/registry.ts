import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { IntegrationSubscriptionController } from "./controllers.js";
import { MarketplaceConnectionController } from "./marketplace-connection-controller.js";

export function registerIntegrationHubControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new IntegrationSubscriptionController())
    .register(new MarketplaceConnectionController());
}
