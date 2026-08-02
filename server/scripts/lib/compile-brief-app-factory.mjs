import {
  BriefError,
  compileBrief as compileBaseBrief,
} from "./compile-brief.mjs";
import {
  INPUT_TABLE_BRIEF_STUB_FIELD,
  INPUT_TABLE_BRIEF_STUB_FIELDNAME,
  normalizeBriefActionInputTables,
} from "./action-input-table-brief.mjs";

export { BriefError };

/**
 * WS09 App Factory compiler adapter.
 *
 * The established compiler still owns every existing brief rule. This layer adds only the
 * repeatable AppAction input primitive, keeping the extension isolated until the canonical
 * compiler/schema can absorb it without a rolling-compatibility concern.
 */
export function compileBrief(brief) {
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
  if (!Array.isArray(brief?.actions) || !brief.actions.length) return pkg;

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

  return pkg;
}
