import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { SerialAndBatchBundleController } from "./controllers.js";
import { RepostItemValuationIntegrityController } from "./repost-integrity.js";

export function registerStockControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new SerialAndBatchBundleController())
    .register(new RepostItemValuationIntegrityController());
}
