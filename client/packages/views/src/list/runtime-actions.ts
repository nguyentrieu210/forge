import type { Capabilities } from "@metaforge/adapter-frappe";
import type { UrlStateBridge } from "./useListState.js";

export type ListRuntimeCapability = keyof Capabilities;

export interface ListRuntimeActionContext {
  doctype: string;
  selected: string[];
  bridge: UrlStateBridge;
  capabilities: Capabilities;
  clearSelection: () => void;
}

/**
 * Extension action for canonical lists. `single` acts as a row action through the current
 * selection; `multiple` is a bulk action. Business actions must declare the server-authoritative
 * capability they require; unknown/loading capabilities are fail-closed by the container.
 */
export interface ListRuntimeAction {
  id: string;
  label: string;
  requiredCapability: ListRuntimeCapability;
  selection?: "single" | "multiple" | "any";
  destructive?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  keepSelection?: boolean;
  disabled?: (context: ListRuntimeActionContext) => boolean;
  run: (context: ListRuntimeActionContext) => void | Promise<void>;
}

export function actionSupportsSelection(action: ListRuntimeAction, count: number): boolean {
  const selection = action.selection ?? "any";
  if (selection === "single") return count === 1;
  if (selection === "multiple") return count > 0;
  return true;
}

export function actionAllowedByCapability(action: ListRuntimeAction, capabilities: Capabilities): boolean {
  return capabilities[action.requiredCapability] === true;
}
