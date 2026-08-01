/**
 * @metaforge/views — List/Report/Kanban/Calendar/Gantt/Tree/Dashboard/Form/Bulk/Print.
 */
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import type { DocTypeMeta } from "@metaforge/core";

export type ViewKind =
  | "list" | "form" | "bulk" | "report" | "kanban"
  | "calendar" | "gantt" | "tree" | "dashboard" | "print";

export interface ViewContext {
  adapter: FrappeAdapter;
  doctype: string;
  meta: DocTypeMeta;
}

export { ListView, type ListViewProps } from "./list/ListView.js";
export { deriveColumns, imageField, isStatusField, type ListColumn, type CellAlign } from "./list/columns.js";
export { renderCell, formatValue, statusVariant, statusTone, StatusBadge } from "./list/cells.js";
export {
  deriveStandardFilters, deriveSearchFields, buildServerQuery, countFilters, countQuery, applyClientQuery,
  emptyListState, queryFields, DEFAULT_PAGE_SIZE,
  type StandardFilter, type ListState,
} from "./list/filters.js";
export { ListToolbar, type ListToolbarProps } from "./list/ListToolbar.js";
export { resolveDateRange, DATE_RANGE_LABELS, primaryDateField, type DateRangeKey, type DateRange } from "./list/date-range.js";
export { useListUrlState, readState, type UrlStateBridge } from "./list/useListState.js";
export {
  applyColumnOrder, clampWidth, columnPreferenceKey, defaultColumnPreferences,
  hasCustomColumnPreferences, moveColumn, normalizeColumnPreferences, stableColumnPreferenceScope,
  type ColumnPreferenceSpec, type ColumnWidths, type ListColumnPreferences, type ListDensity,
} from "./list/column-preferences.js";
export { FormView, type FormViewProps } from "./form/FormView.js";
export { BulkGridView, type BulkGridViewProps } from "./bulk/BulkGridView.js";
export { BulkGridContainer, type BulkGridContainerProps } from "./bulk/BulkGridContainer.js";
export { SplitView, useBreakpoint, type SplitViewProps, type Breakpoint } from "./detail/SplitView.js";
export { ContextPanel, type ContextPanelProps, type TimelineItem, type TimelineKind, type ContextAttachment, type UserOption, type ContextShare, type ContextConnection } from "./detail/ContextPanel.js";
export { WorkflowActionBar, FormActionBar, resolveWorkflowActions, type WorkflowAction } from "./detail/WorkflowActionBar.js";
export { resolveFormActions, type FormActionDesc, type FormActionKind, type FormActionCtx, type FormPerms } from "./detail/formActions.js";
export { groupLayout, resolveFormFieldWidth, type FormFieldWidth, type FormTab, type FormSection, type FormColumn } from "./form/layout.js";
export { useFormState, type FormApi } from "./form/useFormState.js";
export {
  ChildGrid, deriveAverageWeight, derivePurchaseOrderBarem, resolveChildGridColumns,
  defaultChildGridHiddenColumns, type ChildGridProps, type AverageWeightResult,
} from "./form/ChildGridWithExtensions.js";
export { registerTableControls } from "./form/table-controls.js";
export { KanbanView, type KanbanViewProps } from "./kanban/KanbanView.js";
export { KanbanContainer, type KanbanContainerProps } from "./kanban/KanbanContainer.js";
export { TreeView, type TreeViewProps, type TreeNodeItem } from "./tree/TreeView.js";
export { TreeContainer, type TreeContainerProps } from "./tree/TreeContainer.js";
export { ReportView, type ReportViewProps, type ReportColumn } from "./report/ReportView.js";
export { ReportContainer } from "./report/ReportContainer.js";
export { exportFormXlsx, ymdToDmy, type FormXlsxOptions, type HeaderMerge } from "./report/form-export.js";
export { PeriodPicker, type PeriodPickerProps } from "./report/PeriodPicker.js";
export { buildCsv, downloadCsv, downloadXlsx, printTablePdf, stampedName, type ExportColumn, type ExportFormat } from "./report/export.js";
export { PrintView, type PrintViewProps } from "./print/PrintView.js";
export { PrintContainer, type PrintContainerProps } from "./print/PrintContainer.js";
export { buildPrintPath } from "./print/printRoute.js";
export { DashboardView, type DashboardViewProps, type DashboardCard, type DashboardChartData } from "./dashboard/DashboardView.js";
export { CalendarView, type CalendarViewProps } from "./calendar/CalendarView.js";
export { CalendarContainer, type CalendarContainerProps } from "./calendar/CalendarContainer.js";
export { GanttView, type GanttViewProps, type GanttTask } from "./gantt/GanttView.js";

export { MetaForgeProvider, useMetaForge, useLocaleFormat, type MetaForgeContextValue, type MetaForgeProviderProps } from "./container/provider.js";
export { DoctypeWorkspace, type DoctypeWorkspaceProps } from "./app/DoctypeWorkspace.js";
export { adapterServices } from "./container/services.js";
export { useMeta, useFormMeta, useDoc, useList, useCount, useTransitions } from "./container/hooks.js";
export { FormContainer, type FormContainerProps } from "./container/FormContainer.js";
export { loadRecentDocs, recordRecentDoc, type RecentDocEntry } from "./container/recent-docs.js";
export { ListContainer, type ListContainerProps } from "./container/ListContainer.js";
export { ContextContainer, type ContextContainerProps } from "./container/ContextContainer.js";
export { NewFormContainer, type NewFormContainerProps } from "./container/NewFormContainer.js";
export { editableCodeField, suggestEditableCode } from "./container/editable-code.js";
export { WorkspaceContainer, type WorkspaceContainerProps } from "./container/WorkspaceContainer.js";
export { WorkspaceView, type WorkspaceViewProps, type WsItem, type WsPage, type WsShortcut, type WsCard } from "./workspace/WorkspaceView.js";

export { createFullRegistry } from "./registry.js";

export const P0_VIEW_ORDER: ViewKind[] = ["list", "form"];
export const ALL_VIEWS: ViewKind[] = ["list", "form", "bulk", "report", "kanban", "calendar", "gantt", "tree", "dashboard", "print"];
export const VIEWS_VERSION = "0.2.0";

export { ApplicationCatalogView, type ApplicationCatalogViewProps } from "./catalog/ApplicationCatalogView.js";
export { ApplicationCatalogContainer } from "./catalog/ApplicationCatalogContainer.js";
export { OverviewView, type OverviewViewProps } from "./overview/OverviewView.js";
export { OverviewContainer } from "./overview/OverviewContainer.js";
export { ProcessView } from "./process/ProcessView.js";
export { ProcessContainer } from "./process/ProcessContainer.js";
export { ScreenView, type ScreenViewProps } from "./screen/ScreenView.js";
export { PermissionCenter } from "./access/PermissionCenter.js";
export { FormGuide, type FormGuideContent, type FormGuideMap } from "./form/FormGuide.js";
export { ImportContent } from "./system/Import.js";
export { AssistantBubble, setAssistantContext } from "./assistant/AssistantBubble.js";
