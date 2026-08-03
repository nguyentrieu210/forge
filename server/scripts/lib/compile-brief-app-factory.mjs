import {
  BriefError,
  compileBrief as compileBaseBrief,
} from "./compile-brief.mjs";
import {
  INPUT_TABLE_BRIEF_STUB_FIELD,
  INPUT_TABLE_BRIEF_STUB_FIELDNAME,
  normalizeBriefActionInputTables,
} from "./action-input-table-brief.mjs";
import { assertBriefContextDimensions } from "./business-context-dimensions.mjs";
import { attachBriefUiViewPolicies } from "./brief-ui-view-policy.mjs";

export { BriefError };

/**
 * WS09 App Factory compiler adapter.
 *
 * The established compiler still owns every existing brief rule. This layer adds the
 * repeatable AppAction input primitive, supported business-context dimensions and the
 * canonical UI view-policy post-stage (Bulk/Matrix) without creating a competing compiler.
 * It is the canonical compiler used by `forge-app`.
 */
export function compileBrief(brief) {
  // Fail BEFORE package emission. Letting an unsupported selector through and relying on
  // parseAppManifest to reject the compiled output mislabels an authoring error as a compiler
  // defect; letting it install would be worse because the shell can block on an empty selector.
  assertBriefContextDimensions(brief, BriefError);

  let source = brief;
  const tableOnlyActions = new Set();

  // The legacy compiler requires one scalar field. First-class input tables make that
  // requirement obsolete, so inject a private compiler-only field for table-only actions.
  // Never mutate the caller's brief: generation tools often reuse it for docs or hashing.
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
      const rawTables = brief.actions[actionIndex]?.inputTables;
      if (rawTables === undefined) return action;

      const { tables, errors } = normalizeBriefActionInputTables(rawTables, actionIndex);
      if (errors.length) throw new BriefError(errors.join(" "));

      const fields = tableOnlyActions.has(actionIndex)
        ? action.fields.filter((field) => field.fieldname !== INPUT_TABLE_BRIEF_STUB_FIELDNAME)
        : action.fields;
      const scalarNames = new Set(fields.map((field) => field.fieldname));
      for (const table of tables) {
        if (scalarNames.has(table.fieldname)) {
          throw new BriefError(`actions[${actionIndex}] (${action.name}) dùng fieldname "${table.fieldname}" cho cả field thường và inputTables.`);
        }
      }

      return {
        ...action,
        fields,
        input_tables: tables,
      };
    });
  }

  // UI view policies are attached last so they coexist with WS09 AppAction lowering and are
  // validated by the canonical server metadata parser rather than by a second brief compiler.
  return attachBriefUiViewPolicies(brief, pkg);
}
