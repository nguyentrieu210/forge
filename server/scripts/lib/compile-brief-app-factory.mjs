import {
  BriefError,
  compileBrief as compileBaseBrief,
} from "./compile-brief.mjs";
import { normalizeBriefActionInputTables } from "./action-input-table-brief.mjs";

export { BriefError };

/**
 * WS09 App Factory compiler adapter.
 *
 * The established compiler still owns every existing brief rule. This layer adds only the
 * repeatable AppAction input primitive, keeping the extension isolated until the canonical
 * compiler/schema can absorb it without a rolling-compatibility concern.
 */
export function compileBrief(brief) {
  const pkg = compileBaseBrief(brief);
  if (!Array.isArray(brief?.actions) || !brief.actions.length) return pkg;

  pkg.actions = pkg.actions.map((action, actionIndex) => {
    const rawTables = brief.actions[actionIndex]?.inputTables;
    if (rawTables === undefined) return action;

    const { tables, errors } = normalizeBriefActionInputTables(rawTables, actionIndex);
    if (errors.length) throw new BriefError(errors.join(" "));

    const scalarNames = new Set(action.fields.map((field) => field.fieldname));
    for (const table of tables) {
      if (scalarNames.has(table.fieldname)) {
        throw new BriefError(`actions[${actionIndex}] (${action.name}) dùng fieldname "${table.fieldname}" cho cả field thường và inputTables.`);
      }
    }

    return {
      ...action,
      input_tables: tables,
    };
  });

  return pkg;
}
