const FIELDNAME = /^[a-z][a-z0-9_]*$/;
const ACTION_INPUT_FIELDTYPES = new Set([
  "Data", "Small Text", "Text", "Int", "Float", "Currency", "Percent",
  "Check", "Select", "Link", "Date", "Datetime", "Time",
  "Attach", "Attach Image",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, where, errors, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    errors.push(`${where} phải là chuỗi không rỗng, tối đa ${max} ký tự.`);
    return "";
  }
  return value.trim();
}

function integer(value, where, errors, min, max, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${where} phải là số nguyên từ ${min} tới ${max}.`);
    return fallback;
  }
  return value;
}

/**
 * Validate and normalize author-facing `actions[].inputTables`.
 *
 * This intentionally stays smaller than the server parser. The brief layer checks things an
 * author can fix locally; `parseAppManifestWithInputTables` remains the final authority for
 * package-level references such as whether a Link target is owned or declared external.
 */
export function normalizeBriefActionInputTables(rawTables, actionIndex) {
  const root = `actions[${actionIndex}].inputTables`;
  const errors = [];
  if (!Array.isArray(rawTables) || !rawTables.length) {
    return { tables: [], errors: [`${root} phải là mảng có ít nhất một bảng.`] };
  }

  const tableNames = new Set();
  const tables = rawTables.map((raw, tableIndex) => {
    const where = `${root}[${tableIndex}]`;
    if (!isObject(raw)) {
      errors.push(`${where} phải là object.`);
      return null;
    }

    const fieldname = text(raw.fieldname, `${where}.fieldname`, errors, 120);
    if (fieldname && !FIELDNAME.test(fieldname)) {
      errors.push(`${where}.fieldname chỉ nhận chữ thường, số và dấu gạch dưới, bắt đầu bằng chữ.`);
    }
    if (fieldname && tableNames.has(fieldname)) errors.push(`${root} trùng fieldname "${fieldname}".`);
    if (fieldname) tableNames.add(fieldname);

    const label = text(raw.label, `${where}.label`, errors, 160);
    const columnsRaw = raw.columns;
    if (!Array.isArray(columnsRaw) || !columnsRaw.length) {
      errors.push(`${where}.columns phải là mảng có ít nhất một cột.`);
    }
    if (Array.isArray(columnsRaw) && columnsRaw.length > 64) {
      errors.push(`${where}.columns tối đa 64 cột.`);
    }

    const columnNames = new Set();
    const columns = (Array.isArray(columnsRaw) ? columnsRaw : []).map((column, columnIndex) => {
      const columnWhere = `${where}.columns[${columnIndex}]`;
      if (!isObject(column)) {
        errors.push(`${columnWhere} phải là object.`);
        return null;
      }
      const columnName = text(column.fieldname, `${columnWhere}.fieldname`, errors, 120);
      if (columnName && !FIELDNAME.test(columnName)) {
        errors.push(`${columnWhere}.fieldname chỉ nhận chữ thường, số và dấu gạch dưới, bắt đầu bằng chữ.`);
      }
      if (columnName && columnNames.has(columnName)) errors.push(`${where}.columns trùng fieldname "${columnName}".`);
      if (columnName) columnNames.add(columnName);

      const fieldtype = column.fieldtype === undefined
        ? "Data"
        : text(column.fieldtype, `${columnWhere}.fieldtype`, errors, 32);
      if (fieldtype && !ACTION_INPUT_FIELDTYPES.has(fieldtype)) {
        errors.push(`${columnWhere}.fieldtype "${fieldtype}" chưa có control trong ActionScreen.`);
      }
      const options = column.options === undefined
        ? undefined
        : text(column.options, `${columnWhere}.options`, errors, 2000);
      if ((fieldtype === "Link" || fieldtype === "Select") && !options) {
        errors.push(`${columnWhere} là ${fieldtype} nên phải khai options.`);
      }
      if (column.required !== undefined && typeof column.required !== "boolean") {
        errors.push(`${columnWhere}.required phải là boolean.`);
      }
      const defaultValue = column.default === undefined
        ? undefined
        : text(column.default, `${columnWhere}.default`, errors, 160);
      const description = column.description === undefined
        ? undefined
        : text(column.description, `${columnWhere}.description`, errors, 320);
      return {
        fieldname: columnName,
        label: text(column.label, `${columnWhere}.label`, errors, 160),
        fieldtype,
        ...(options ? { options } : {}),
        ...(column.required === true ? { required: true } : {}),
        ...(defaultValue === undefined ? {} : { default: defaultValue }),
        ...(description === undefined ? {} : { description }),
      };
    }).filter(Boolean);

    const minRows = integer(raw.minRows, `${where}.minRows`, errors, 1, 500, 1);
    const maxRows = integer(raw.maxRows, `${where}.maxRows`, errors, 1, 500, 100);
    if (maxRows < minRows) errors.push(`${where}.maxRows phải lớn hơn hoặc bằng minRows.`);
    if (raw.allowPaste !== undefined && typeof raw.allowPaste !== "boolean") {
      errors.push(`${where}.allowPaste phải là boolean.`);
    }
    const description = raw.description === undefined
      ? undefined
      : text(raw.description, `${where}.description`, errors, 500);

    return {
      fieldname,
      label,
      ...(description === undefined ? {} : { description }),
      columns,
      min_rows: minRows,
      max_rows: maxRows,
      allow_paste: raw.allowPaste !== false,
    };
  }).filter(Boolean);

  return { tables, errors };
}

/**
 * The current JSON Schema predates `inputTables` and has additionalProperties=false.
 * Strip only this one WS09 extension before AJV, while validating it ourselves. Every other
 * unknown action key still reaches AJV and is refused as before.
 */
export function prepareBriefInputTablesForSchema(brief) {
  if (!isObject(brief)) return { schemaBrief: brief, errors: [] };
  const schemaBrief = structuredClone(brief);
  const errors = [];
  if (!Array.isArray(schemaBrief.actions)) return { schemaBrief, errors };

  schemaBrief.actions.forEach((action, actionIndex) => {
    if (!isObject(action) || action.inputTables === undefined) return;
    const result = normalizeBriefActionInputTables(action.inputTables, actionIndex);
    errors.push(...result.errors);
    delete action.inputTables;
  });
  return { schemaBrief, errors };
}
