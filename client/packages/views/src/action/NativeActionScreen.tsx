/** @jsxImportSource react */
import { ActionScreen as ExistingActionScreen, type ActionScreenProps } from "./FriendlyActionScreen.js";
import { preferFirstClassActionInputTables } from "./input-table.js";
import { isRichAction, RichActionScreen } from "./RichActionScreen.js";
import { MasterDetailListActionScreen, masterDetailListConfig } from "./MasterDetailListActionScreen.js";

/** Public ActionScreen boundary for the rolling AppAction input-table migration. */
export function ActionScreen(props: ActionScreenProps) {
  const action = preferFirstClassActionInputTables(props.action);
  if (masterDetailListConfig(action)) {
    return <MasterDetailListActionScreen {...props} action={action} />;
  }
  return isRichAction(action)
    ? <RichActionScreen {...props} action={action} />
    : <ExistingActionScreen {...props} action={action} />;
}

export type { ActionScreenProps } from "./ActionScreen.js";
