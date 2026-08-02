import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { IntegrationSubscriptionController } from "./controllers.js";

export function registerIntegrationHubControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry.register(new IntegrationSubscriptionController());
}
