import { normalizeBriefActionInputTables } from "./action-input-table-brief.mjs";

const FIELDNAME = /^[a-z][a-z0-9_]*$/;
const ATOMICITY = new Set(["atomic", "independent"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, where, errors, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    errors.push(`${where} phải là chuỗi không rỗng, tối đa ${max} ký tự.`);
    return "";
  }
  return value.trim();
}

/** Validate and normalize author-facing actions[].batch. */
export function normalizeBriefBatchAction(raw, action, actionIndex) {
  const root = `actions[${actionIndex}].batch`;
  const errors = [];
  if (!isObject(raw)) return { batch: undefined, errors: [`${root} phải là object.`] };

  const allowed = new Set(["contractVersion", "inputTable", "itemIdField", "atomicity", "maxItems"]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) errors.push(`${root}.${key} không được hỗ trợ.`);

  const contractVersion = raw.contractVersion ?? 1;
  if (contractVersion !== 1) errors.push(`${root}.contractVersion phải bằng 1.`);
  if (!action?.preview) errors.push(`${root} yêu cầu action khai preview để bảo đảm preview/commit tách biệt.`);

  const inputTable = text(raw.inputTable, `${root}.inputTable`, errors);
  if (inputTable && !FIELDNAME.test(inputTable)) errors.push(`${root}.inputTable phải là fieldname chữ thường.`);
  const itemIdField = text(raw.itemIdField, `${root}.itemIdField`, errors);
  if (itemIdField && !FIELDNAME.test(itemIdField)) errors.push(`${root}.itemIdField phải là fieldname chữ thường.`);
  const atomicity = text(raw.atomicity, `${root}.atomicity`, errors, 16);
  if (atomicity && !ATOMICITY.has(atomicity)) errors.push(`${root}.atomicity phải là atomic hoặc independent.`);

  const tablesResult = action?.inputTables === undefined
    ? { tables: [], errors: [`${root} yêu cầu action có inputTables.`] }
    : normalizeBriefActionInputTables(action.inputTables, actionIndex);
  errors.push(...tablesResult.errors);
  const table = tablesResult.tables.find((candidate) => candidate.fieldname === inputTable);
  if (inputTable && !table) errors.push(`${root}.inputTable phải trỏ tới một inputTables đã khai: "${inputTable}".`);
  if (table && itemIdField && !table.columns.some((column) => column.fieldname === itemIdField)) {
    errors.push(`${root}.itemIdField phải là cột của ${inputTable}: "${itemIdField}".`);
  }

  let maxItems = raw.maxItems ?? table?.max_rows ?? 100;
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 500) {
    errors.push(`${root}.maxItems phải là số nguyên từ 1 tới 500.`);
    maxItems = table?.max_rows ?? 100;
  }
  if (table && maxItems > table.max_rows) errors.push(`${root}.maxItems không được lớn hơn ${inputTable}.maxRows (${table.max_rows}).`);
  if (table && maxItems < table.min_rows) errors.push(`${root}.maxItems không được nhỏ hơn ${inputTable}.minRows (${table.min_rows}).`);

  return {
    batch: {
      contract_version: 1,
      input_table: inputTable,
      item_id_field: itemIdField,
      atomicity,
      max_items: maxItems,
    },
    errors,
  };
}

/** Strip only the WS09 batch brief extension before the legacy AJV schema. */
export function prepareBriefBatchActionsForSchema(brief) {
  if (!isObject(brief)) return { schemaBrief: brief, errors: [] };
  const schemaBrief = structuredClone(brief);
  const errors = [];
  if (!Array.isArray(schemaBrief.actions)) return { schemaBrief, errors };

  schemaBrief.actions.forEach((action, actionIndex) => {
    if (!isObject(action) || action.batch === undefined) return;
    const result = normalizeBriefBatchAction(action.batch, action, actionIndex);
    errors.push(...result.errors);
    delete action.batch;
  });
  return { schemaBrief, errors };
}
