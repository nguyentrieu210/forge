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
 * Legacy `brief.experiences` represented app-owned React workbenches selected by a prefix.
 * The generic runtime no longer has such a registry, so emitting those keys would create
 * dead routes in an otherwise installable package. Strip the obsolete declarations at the
 * App Factory boundary while preserving metadata-native `action:*` and `screen:*` surfaces,
 * which are compiled independently by the base compiler.
 *
 * Raw historical briefs may still contain the old objects until their large source files are
 * rewritten. They are inert input debt, not package/runtime authority.
 */
function removeLegacyRuntimeExperiences(brief) {
  const experiences = Array.isArray(brief?.experiences) ? brief.experiences : [];
  const keys = new Set(experiences.map((entry) => entry?.key).filter((key) => typeof key === "string" && key));
  if (!keys.size) return brief;

  const source = structuredClone(brief);
  source.experiences = [];
  if (Array.isArray(source.navigation?.items)) {
    source.navigation.items = source.navigation.items.filter((key) => !keys.has(key));
  }
  if (typeof source.home === "string" && keys.has(source.home)) delete source.home;
  return source;
}

/**
 * `menu:false` means the source remains installed/direct-addressable but no longer belongs
 * to daily navigation. An older explicit `navigation.items` order may still name that key.
 * Remove only those now-hidden keys before the strict base compiler validates navigation;
 * every other unknown key must continue to fail closed as a genuine authoring error.
 */
function normalizeHiddenNavigationItems(brief) {
  if (!Array.isArray(brief?.navigation?.items) || !brief.navigation.items.length) return brief;

  const hidden = new Set();
  for (const doctype of brief.doctypes ?? []) {
    if (doctype?.menu === false && typeof doctype.name === "string" && doctype.name) hidden.add(doctype.name);
  }
  for (const action of brief.actions ?? []) {
    if (action?.menu === false && typeof action.name === "string" && action.name) hidden.add(`action:${action.name}`);
  }
  if (!hidden.size || !brief.navigation.items.some((key) => hidden.has(key))) return brief;

  const source = structuredClone(brief);
  source.navigation.items = source.navigation.items.filter((key) => !hidden.has(key));
  return source;
}

/**
 * WS09 App Factory compiler adapter.
 *
 * The established compiler still owns every existing brief rule. This layer adds repeatable
 * AppAction input tables, the canonical BatchAction metadata seam, supported business-context
 * dimensions and UI view-policy post-stages without creating a competing compiler.
 */
export function compileBrief(brief) {
  assertBriefContextDimensions(brief, BriefError);

  let source = removeLegacyRuntimeExperiences(brief);
  source = normalizeHiddenNavigationItems(source);
  const tableOnlyActions = new Set();

  // The legacy compiler requires one scalar field. First-class input tables make that
  // requirement obsolete, so inject a private compiler-only field for table-only actions.
  if (Array.isArray(source?.actions) && source.actions.some((action) => action?.inputTables !== undefined && (!Array.isArray(action.fields) || !action.fields.length))) {
    if (source === brief) source = structuredClone(brief);
    source.actions.forEach((action, actionIndex) => {
      if (action?.inputTables === undefined || (Array.isArray(action.fields) && action.fields.length)) return;
      action.fields = [INPUT_TABLE_BRIEF_STUB_FIELD];
      tableOnlyActions.add(actionIndex);
    });
  }

  const pkg = compileBaseBrief(source);

  if (Array.isArray(source?.actions) && source.actions.length) {
    pkg.actions = pkg.actions.map((action, actionIndex) => {
      const sourceAction = source.actions[actionIndex];
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

  return attachBriefUiViewPolicies(source, pkg);
}
