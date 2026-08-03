/** @jsxImportSource react */
import type { AppAction } from "@metaforge/core";
import { ScreenView as ExistingScreenView, type ScreenViewProps } from "./ScreenView.js";
import { preferFirstClassActionInputTables } from "../action/input-table.js";

/**
 * Public ScreenView boundary. Normalize action metadata before an action block reaches the
 * existing renderer so AppScreen and standalone action routes obey the same input-table rule.
 */
export function ScreenView(props: ScreenViewProps) {
  const actions: AppAction[] | undefined = props.actions?.map(preferFirstClassActionInputTables);
  return <ExistingScreenView {...props} {...(actions ? { actions } : {})} />;
}

export type { ScreenViewProps } from "./ScreenView.js";
