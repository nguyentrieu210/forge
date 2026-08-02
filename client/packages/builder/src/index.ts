/**
 * @metaforge/builder — metadata-first authoring surfaces.
 * Canvas families: Sortable-Tree · Node-Graph · Paper-Blocks · Grid plus structured BPM/rule/formula editors.
 */
export type CanvasKind = "sortable-tree" | "node-graph" | "paper-blocks" | "grid";
export const BUILDER_CANVAS: Record<string, CanvasKind> = {
  doctype: "sortable-tree", workflow: "node-graph", print: "paper-blocks", dashboard: "grid",
};

export { History, useBuilder, type Builder } from "./kernel.js";

export { DocTypeBuilder, type DocTypeBuilderProps } from "./doctype/DocTypeBuilder.js";
export { blankDocType, newField, addField, removeField, moveField, updateField, indexOfField } from "./doctype/meta-build.js";
export { diffMeta, metaEqual, hasChanges, diffPermissions, permRuleKey, type MetaDiff, type FieldChange, type ReorderMove, type PropChange, type PermDiff, type PermRuleChange } from "./doctype/diff.js";
export { validateDraft, openDraft, reloadDraft, draftStatus, type ValidationResult, type ValidationIssue, type ValidationSeverity, type DraftSession, type DraftStatus } from "./doctype/validate.js";
export { serializeDocTypeForSave, roundTripLocal, type ApplyPayload } from "./doctype/apply.js";
export { planCustomization, type CustomizePlan, type CustomFieldOp, type PropertySetterOp, type DeleteCustomFieldOp, type CustomizeWarning } from "./doctype/customize.js";

export { WorkflowBuilder, blankWorkflow, type WorkflowBuilderProps, type WorkflowModel, type WFState, type WFTransition } from "./workflow/WorkflowBuilder.js";
export { serializeWorkflow, validateWorkflow, workflowMasters, type WorkflowPayload, type WorkflowValidationResult } from "./workflow/serialize.js";
export { ApprovalPlanBuilder, type ApprovalPlanBuilderProps } from "./workflow/ApprovalPlanBuilder.js";
export {
  blankApprovalPlan, newApprovalStage, validateApprovalPlan, serializeApprovalPlan,
  type ApprovalStageMode, type ApprovalSelectorModel, type ApprovalEscalationModel, type ApprovalStageModel,
  type ApprovalPlanModel, type ApprovalPlanValidationIssue, type ApprovalPlanValidationResult,
  type ApprovalPlanPayload, type ApprovalTimerPayload,
} from "./workflow/approval-plan.js";

export { DecisionRuleBuilder, type DecisionRuleBuilderProps } from "./rule/DecisionRuleBuilder.js";
export {
  blankDecisionRuleSet, newDecisionRule, validateDecisionRuleSet, serializeDecisionRuleSet,
  type DecisionRuleOperator, type DecisionRuleLogic, type DecisionRuleConditionModel,
  type DecisionRuleModel, type DecisionRuleSetModel, type DecisionRuleBuilderIssue, type DecisionRuleBuilderValidation,
} from "./rule/decision-rule.js";

export { FormulaBuilder, type FormulaBuilderProps } from "./formula/FormulaBuilder.js";
export {
  blankFormulaRuleSet, newFormulaRule, validateFormulaRuleSet, serializeFormulaRuleSet,
  type FormulaOperandKind, type FormulaStepOperator, type FormulaOperandModel, type FormulaStepModel,
  type FormulaRuleModel, type FormulaRuleSetModel, type FormulaBuilderIssue, type FormulaBuilderValidation,
} from "./formula/formula-rule.js";

export { PrintFormatBuilder, printModelFromFields, type PrintFormatBuilderProps, type PrintFormatModel, type PrintBlock } from "./print/PrintFormatBuilder.js";
export { serializePrintFormat, validatePrintFormat, printHtml, type PrintFormatPayload, type PrintValidationResult } from "./print/serialize.js";

export { DashboardBuilder, blankDashboard, type DashboardBuilderProps, type DashboardModel, type DashCardCfg, type DashChartCfg } from "./dashboard/DashboardBuilder.js";
export { serializeDashboard, validateDashboard, type DashboardPlan, type DashboardValidationResult } from "./dashboard/serialize.js";

export const BUILDER_VERSION = "0.1.0";
