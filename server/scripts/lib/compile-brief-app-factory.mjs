import {
  BriefError,
  compileBrief as compileBaseBrief,
} from "./compile-brief.mjs";
import {
  INPUT_TABLE_BRIEF_STUB_FIELD,
  INPUT_TABLE_BRIEF_STUB_FIELDNAME,
  normalizeBriefActionInputTables,
} from "./action-input-table-brief.mjs";
import { normalizeBriefBatchAction } from "./batch-action-brief.mjs";
import { assertBriefContextDimensions } from "./business-context-dimensions.mjs";
import { attachBriefUiViewPolicies } from "./brief-ui-view-policy.mjs";

export { BriefError };

/**
 * WS09 App Factory compiler adapter.
 *
 * The established compiler still owns every existing brief rule. This layer adds repeatable
 * AppAction input tables, the canonical BatchAction metadata seam, supported business-context
 * dimensions and UI view-policy post-stages without creating a competing compiler.
 */
export function compileBrief(brief) {
  assertBriefContextDimensions(brief, BriefError);

  let source = brief;
  const tableOnlyActions = new Set();

  // The legacy compiler requires one scalar field. First-class input tables make that
  // requirement obsolete, so inject a private compiler-only field for table-only actions.
  if (Array.isArray(brief?.actions) && brief.actions.some((action) => action?.inputTables !== undefined && (!Array.isArray(action.fields) || !action.fields.length))) {
    source = structuredClone(brief);
    source.actions.forEach((action, actionIndex) => {
      if (action?.inputTables === undefined || (Array.isArray(action.fields) && action.fields.length)) return;
      action.fields = [INPUT_TABLE_BRIEF_STUB_FIELD];
      tableOnlyActions.add(actionIndex);
    });
  }

  const pkg = compileBaseBrief(source);

  if (Array.isArray(brief?.actions) && brief.actions.length) {
    pkg.actions = pkg.actions.map((action, actionIndex) => {
      const sourceAction = brief.actions[actionIndex];
      let nextAction = action;
      const rawTables = sourceAction?.inputTables;
      if (rawTables !== undefined) {
        const { tables, errors } = normalizeBriefActionInputTables(rawTables, actionIndex);
        if (errors.length) throw new BriefError(errors.join(" "));

        const fields = tableOnlyActions.has(actionIndex)
          ? nextAction.fields.filter((field) => field.fieldname !== INPUT_TABLE_BRIEF_STUB_FIELDNAME)
          : nextAction.fields;
        const scalarNames = new Set(fields.map((field) => field.fieldname));
        for (const table of tables) {
          if (scalarNames.has(table.fieldname)) {
            throw new BriefError(`actions[${actionIndex}] (${action.name}) dùng fieldname "${table.fieldname}" cho cả field thường và inputTables.`);
          }
        }
        nextAction = { ...nextAction, fields, input_tables: tables };
      }

      if (sourceAction?.batch !== undefined) {
        const { batch, errors } = normalizeBriefBatchAction(sourceAction.batch, sourceAction, actionIndex);
        if (errors.length) throw new BriefError(errors.join(" "));
        nextAction = { ...nextAction, batch };
      }
      return nextAction;
    });
  }

  return attachBriefUiViewPolicies(brief, pkg);
}
