/**
 * @metaforge/builder — BuilderKernel + 4 builder (brd-builder/00-builder-engine.md).
 * Canvas: Sortable-Tree (DocType) · Node-Graph (Workflow) · Paper-Blocks (Print) · Grid (Dashboard).
 * P0 kéo-thả bằng HTML5 DnD/native; dnd-kit + React Flow + react-grid-layout = polish PHA 6.
 */

export type CanvasKind = "sortable-tree" | "node-graph" | "paper-blocks" | "grid";

/** Ánh xạ builder → canvas (M17/M18/M21/M22). */
export const BUILDER_CANVAS: Record<string, CanvasKind> = {
  doctype: "sortable-tree",
  workflow: "node-graph",
  print: "paper-blocks",
  dashboard: "grid",
};

// kernel
export { History, useBuilder, type Builder } from "./kernel.js";

// M17 DocType
export { DocTypeBuilder, type DocTypeBuilderProps } from "./doctype/DocTypeBuilder.js";
export { blankDocType, newField, addField, removeField, moveField, updateField, indexOfField } from "./doctype/meta-build.js";
// Gate 6 — canonical diff (draft ↔ baseline): xem trước, validate-trước-apply, semantic-equality.
export {
  diffMeta, metaEqual, hasChanges, diffPermissions, permRuleKey,
  type MetaDiff, type FieldChange, type ReorderMove, type PropChange, type PermDiff, type PermRuleChange,
} from "./doctype/diff.js";
export {
  validateDraft, openDraft, reloadDraft, draftStatus,
  type ValidationResult, type ValidationIssue, type ValidationSeverity, type DraftSession, type DraftStatus,
} from "./doctype/validate.js";
export { serializeDocTypeForSave, roundTripLocal, type ApplyPayload } from "./doctype/apply.js";
// Serializer #1 — customize STANDARD DocType (Custom Field / Property Setter), không sửa schema gốc.
export {
  planCustomization,
  type CustomizePlan, type CustomFieldOp, type PropertySetterOp, type DeleteCustomFieldOp, type CustomizeWarning,
} from "./doctype/customize.js";

// M18 Workflow (+ serializer #2)
export { WorkflowBuilder, blankWorkflow, type WorkflowBuilderProps, type WorkflowModel, type WFState, type WFTransition } from "./workflow/WorkflowBuilder.js";
export { serializeWorkflow, validateWorkflow, workflowMasters, type WorkflowPayload, type WorkflowValidationResult } from "./workflow/serialize.js";
// Enterprise staged approval / quorum / SLA authoring contract. Kept separate from the
// Frappe Workflow serializer because the deployed workflow table does not yet persist these
// process-instance semantics; WS11 integration consumes this payload through DR-09-02.
export { ApprovalPlanBuilder, type ApprovalPlanBuilderProps } from "./workflow/ApprovalPlanBuilder.js";
export {
  blankApprovalPlan,
  newApprovalStage,
  validateApprovalPlan,
  serializeApprovalPlan,
  type ApprovalStageMode,
  type ApprovalSelectorModel,
  type ApprovalEscalationModel,
  type ApprovalStageModel,
  type ApprovalPlanModel,
  type ApprovalPlanValidationIssue,
  type ApprovalPlanValidationResult,
  type ApprovalPlanPayload,
  type ApprovalTimerPayload,
} from "./workflow/approval-plan.js";

// M21 Print Format (+ serializer #3)
export { PrintFormatBuilder, printModelFromFields, type PrintFormatBuilderProps, type PrintFormatModel, type PrintBlock } from "./print/PrintFormatBuilder.js";
export { serializePrintFormat, validatePrintFormat, printHtml, type PrintFormatPayload, type PrintValidationResult } from "./print/serialize.js";

// M22 Dashboard (+ serializer #4)
export { DashboardBuilder, blankDashboard, type DashboardBuilderProps, type DashboardModel, type DashCardCfg, type DashChartCfg } from "./dashboard/DashboardBuilder.js";
export { serializeDashboard, validateDashboard, type DashboardPlan, type DashboardValidationResult } from "./dashboard/serialize.js";

export const BUILDER_VERSION = "0.1.0";
