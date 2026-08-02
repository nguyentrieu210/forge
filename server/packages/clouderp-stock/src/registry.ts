import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { RepostItemValuationIntegrityController } from "./repost-integrity.js";
import { SerialAndBatchBundleIntegrityController } from "./tracking-integrity.js";

export function registerStockControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new SerialAndBatchBundleIntegrityController())
    .register(new RepostItemValuationIntegrityController());
}
