const DEFAULT_MAX_STATEMENT_BYTES = 80_000;

const APP_MANIFEST_TABLES = [
  { table: "installed_apps", keyColumns: ["tenant_id", "app_id"] },
  { table: "app_revisions", keyColumns: ["tenant_id", "app_id", "revision_no"] },
];

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function decodeSqlString(token) {
  const trimmed = token.trim();
  if (!trimmed.startsWith("'") || !trimmed.endsWith("'")) {
    throw new Error(`expected a SQL string literal, received ${trimmed.slice(0, 40)}`);
  }
  return trimmed.slice(1, -1).replaceAll("''", "'");
}

function splitSqlValues(source) {
  const values = [];
  let start = 0;
  let inString = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'") {
      if (inString && source[index + 1] === "'") {
        index += 1;
      } else {
        inString = !inString;
      }
    } else if (char === "," && !inString) {
      values.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (inString) throw new Error("unterminated SQL string literal in app manifest backup row");
  values.push(source.slice(start).trim());
  return values;
}

function jsonPath(parent, key) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`unsupported JSON object key in app manifest: ${key}`);
  }
  return `${parent}.${key}`;
}

function utf8Chunks(value, maxBytes) {
  const chunks = [];
  let chunk = "";
  let bytes = 0;
  for (const char of value) {
    const charBytes = Buffer.byteLength(char);
    if (bytes + charBytes > maxBytes && chunk) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += char;
    bytes += charBytes;
  }
  if (chunk || value === "") chunks.push(chunk);
  return chunks;
}

function manifestUpdates({ tableName, manifest, keyTokens, maxStatementBytes }) {
  const statements = [];
  const literalBudget = Math.max(1_024, Math.floor(maxStatementBytes * 0.55));
  const where = `WHERE ${Object.entries(keyTokens)
    .map(([column, token]) => `"${column}"=${token}`)
    .join(" AND ")}`;
  const updateWithJson = (fn, path, value) => {
    statements.push(
      `UPDATE "${tableName}" SET "manifest_json"=${fn}("manifest_json",${sqlString(path)},json(${sqlString(JSON.stringify(value))})) ${where};`,
    );
  };
  const updateAt = (path, value) => {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized) <= literalBudget) {
      updateWithJson("json_set", path, value);
      return;
    }
    if (Array.isArray(value)) {
      updateWithJson("json_set", path, []);
      value.forEach((item, index) => {
        const itemJson = JSON.stringify(item);
        if (Buffer.byteLength(itemJson) <= literalBudget) {
          updateWithJson("json_insert", `${path}[#]`, item);
        } else {
          const seed = Array.isArray(item) ? [] : item && typeof item === "object" ? {} : "";
          updateWithJson("json_insert", `${path}[#]`, seed);
          updateAt(`${path}[${index}]`, item);
        }
      });
      return;
    }
    if (value && typeof value === "object") {
      updateWithJson("json_set", path, {});
      for (const [key, item] of Object.entries(value)) updateAt(jsonPath(path, key), item);
      return;
    }
    if (typeof value !== "string") {
      throw new Error(`app manifest contains an oversized non-string primitive at ${path}`);
    }
    updateWithJson("json_set", path, "");
    for (const chunk of utf8Chunks(value, literalBudget)) {
      statements.push(
        `UPDATE "${tableName}" SET "manifest_json"=json_set("manifest_json",${sqlString(path)},json_quote(COALESCE(json_extract("manifest_json",${sqlString(path)}),'')||${sqlString(chunk)})) ${where};`,
      );
    }
  };

  updateAt("$", manifest);
  for (const statement of statements) {
    const size = Buffer.byteLength(statement);
    if (size > maxStatementBytes) {
      throw new Error(`generated D1 restore statement is ${size} bytes (limit ${maxStatementBytes})`);
    }
  }
  return statements;
}

function rewriteManifestTableRows(sql, { table, keyColumns }, maxStatementBytes) {
  let rewrittenRows = 0;
  let generatedStatements = 0;
  let maxGeneratedStatementBytes = 0;
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^INSERT INTO "${escapedTable}" \\((.+)\\) VALUES\\((.*)\\);$`, "gm");
  const rewrittenSql = sql.replace(pattern, (statement, rawColumns, rawValues) => {
    if (Buffer.byteLength(statement) <= maxStatementBytes) return statement;
    const columns = rawColumns.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
    const values = splitSqlValues(rawValues);
    if (columns.length !== values.length) throw new Error(`${table} backup column/value count mismatch`);
    const manifestIndex = columns.indexOf("manifest_json");
    if (manifestIndex < 0) throw new Error(`${table} backup row is missing manifest_json`);
    const keyTokens = {};
    for (const column of keyColumns) {
      const index = columns.indexOf(column);
      if (index < 0) throw new Error(`${table} backup row is missing ${column}`);
      keyTokens[column] = values[index];
    }
    const manifest = JSON.parse(decodeSqlString(values[manifestIndex]));
    const baseValues = [...values];
    baseValues[manifestIndex] = "'{}'";
    const base = `INSERT INTO "${table}" (${rawColumns}) VALUES(${baseValues.join(",")});`;
    const updates = manifestUpdates({ tableName: table, manifest, keyTokens, maxStatementBytes });
    const generated = [base, ...updates];
    for (const item of generated) {
      const size = Buffer.byteLength(item);
      if (size > maxStatementBytes) {
        throw new Error(`generated ${table} D1 restore statement is ${size} bytes (limit ${maxStatementBytes})`);
      }
      maxGeneratedStatementBytes = Math.max(maxGeneratedStatementBytes, size);
    }
    rewrittenRows += 1;
    generatedStatements += generated.length;
    return generated.join("\n");
  });
  return { sql: rewrittenSql, rewrittenRows, generatedStatements, maxGeneratedStatementBytes };
}

/**
 * D1 caps an individual SQL statement at 100 KB. Wrangler exports metadata-heavy
 * package manifests as one INSERT, so both the active package row (`installed_apps`)
 * and append-only package history (`app_revisions`) can exceed that limit.
 *
 * Rewrite only oversized manifest-bearing rows as a minimal INSERT followed by JSON1
 * updates. Every intermediate manifest remains valid JSON, which preserves the table
 * CHECK constraints while keeping package history byte-for-byte equivalent after replay.
 */
export function rewriteOversizedInstalledAppRows(
  sql,
  { maxStatementBytes = DEFAULT_MAX_STATEMENT_BYTES } = {},
) {
  let rewrittenSql = sql;
  let rewrittenRows = 0;
  let generatedStatements = 0;
  let maxGeneratedStatementBytes = 0;
  const rewrittenByTable = {};

  for (const spec of APP_MANIFEST_TABLES) {
    const result = rewriteManifestTableRows(rewrittenSql, spec, maxStatementBytes);
    rewrittenSql = result.sql;
    if (result.rewrittenRows > 0) rewrittenByTable[spec.table] = result.rewrittenRows;
    rewrittenRows += result.rewrittenRows;
    generatedStatements += result.generatedStatements;
    maxGeneratedStatementBytes = Math.max(maxGeneratedStatementBytes, result.maxGeneratedStatementBytes);
  }

  return {
    sql: rewrittenSql,
    rewrittenRows,
    generatedStatements,
    maxGeneratedStatementBytes,
    rewrittenByTable,
  };
}
