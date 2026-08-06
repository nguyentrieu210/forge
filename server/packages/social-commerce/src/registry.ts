import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { MarketplaceSlaPolicyController } from "./marketplace-sla-policy-controller.js";

export function registerSocialCommerceControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry.register(new MarketplaceSlaPolicyController());
}
