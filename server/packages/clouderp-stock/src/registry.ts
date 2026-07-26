import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { RepostItemValuationController, SerialAndBatchBundleController } from "./controllers.js";
export function registerStockControllers(registry:ControllerRegistry):ControllerRegistry{return registry.register(new SerialAndBatchBundleController()).register(new RepostItemValuationController());}
