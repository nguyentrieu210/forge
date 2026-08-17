import { ControlRegistry, createDefaultRegistry } from "@metaforge/controls";
import { registerRuntimeControls } from "./form/runtime-controls.js";
import { registerTableControls } from "./form/table-controls.js";

/** Registry required by generic forms; route renderers remain independently lazy. */
export function createFullRegistry(): ControlRegistry {
  return registerTableControls(registerRuntimeControls(createDefaultRegistry()));
}
