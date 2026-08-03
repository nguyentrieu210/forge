/** @jsxImportSource react */
import { ActionScreen as ExistingActionScreen, type ActionScreenProps } from "./FriendlyActionScreen.js";
import { preferFirstClassActionInputTables } from "./input-table.js";

/**
 * Public ActionScreen boundary for the rolling AppAction input-table migration.
 * First-class metadata wins; legacy fallback remains supported by ExistingActionScreen.
 */
export function ActionScreen(props: ActionScreenProps) {
  return <ExistingActionScreen {...props} action={preferFirstClassActionInputTables(props.action)} />;
}

export type { ActionScreenProps } from "./ActionScreen.js";
