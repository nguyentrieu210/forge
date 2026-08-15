import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { registerCrmControllers } from "./registry-crm.js";
import { registerO2CControllers } from "./registry-o2c.js";

export function createO2CControllerRegistry(): ControllerRegistry {
  const registry = registerCrmControllers(new ControllerRegistry());
  return registerO2CControllers(registry);
}
