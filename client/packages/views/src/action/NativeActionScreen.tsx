/** @jsxImportSource react */
import { ActionScreen as ExistingActionScreen, type ActionScreenProps } from "./FriendlyActionScreen.js";
import { preferFirstClassActionInputTables } from "./input-table.js";
import { isRichAction, RichActionScreen } from "./RichActionScreen.js";
import { MasterDetailListActionScreen, masterDetailListConfig } from "./MasterDetailListActionScreen.js";
import { SelectionBatchActionScreen, selectionBatchConfig } from "./SelectionBatchActionScreen.js";
import { OperationalReportActionScreen, operationalReportConfig } from "./OperationalReportActionScreen.js";
import { DocumentHistoryActionScreen, documentHistoryConfig } from "./DocumentHistoryActionScreen.js";

/** Public ActionScreen boundary for metadata-selected operational renderers. */
export function ActionScreen(props: ActionScreenProps) {
  const action = preferFirstClassActionInputTables(props.action);
  if (selectionBatchConfig(action)) return <SelectionBatchActionScreen {...props} action={action} />;
  if (masterDetailListConfig(action)) return <MasterDetailListActionScreen {...props} action={action} />;
  if (operationalReportConfig(action)) return <OperationalReportActionScreen {...props} action={action} />;
  if (documentHistoryConfig(action)) return <DocumentHistoryActionScreen {...props} action={action} />;
  return isRichAction(action)
    ? <RichActionScreen {...props} action={action} />
    : <ExistingActionScreen {...props} action={action} />;
}

export type { ActionScreenProps } from "./ActionScreen.js";
