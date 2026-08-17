import type { UrlStateBridge } from "./useListState.js";

export interface ListRuntimeActionContext {
  doctype: string;
  selected: string[];
  bridge: UrlStateBridge;
  clearSelection: () => void;
}

/**
 * Extension action for canonical lists. `single` acts as a row action through the current
 * selection; `multiple` is a bulk action. This keeps business mutations outside ListView while
 * retaining one selection/query-state runtime.
 */
export interface ListRuntimeAction {
  id: string;
  label: string;
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
