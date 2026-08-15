import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { registerErpNextControllersPart01 } from "./registry-part-01.js";
import { registerErpNextControllersPart02 } from "./registry-part-02.js";
import { registerErpNextControllersPart03 } from "./registry-part-03.js";
import { registerErpNextControllersPart04 } from "./registry-part-04.js";

export function registerErpNextCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  let current = registry;
  current = registerErpNextControllersPart01(current);
  current = registerErpNextControllersPart02(current);
  current = registerErpNextControllersPart03(current);
  current = registerErpNextControllersPart04(current);
  return current;
}
