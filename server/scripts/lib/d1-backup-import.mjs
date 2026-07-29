const DEFAULT_MAX_STATEMENT_BYTES = 80_000;

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
  if (inString) throw new Error("unterminated SQL string literal in installed_apps backup row");
  values.push(source.slice(start).trim());
  return values;
}

function jsonPath(parent, key) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`unsupported JSON object key in installed app manifest: ${key}`);
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

function manifestUpdates({ manifest, tenantToken, appToken, maxStatementBytes }) {
  const statements = [];
  const literalBudget = Math.max(1_024, Math.floor(maxStatementBytes * 0.55));
  const where = `WHERE "tenant_id"=${tenantToken} AND "app_id"=${appToken}`;
  const updateWithJson = (fn, path, value) => {
    statements.push(
      `UPDATE "installed_apps" SET "manifest_json"=${fn}("manifest_json",${sqlString(path)},json(${sqlString(JSON.stringify(value))})) ${where};`,
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
      throw new Error(`installed app manifest contains an oversized non-string primitive at ${path}`);
    }
    updateWithJson("json_set", path, "");
    for (const chunk of utf8Chunks(value, literalBudget)) {
      statements.push(
        `UPDATE "installed_apps" SET "manifest_json"=json_set("manifest_json",${sqlString(path)},json_quote(COALESCE(json_extract("manifest_json",${sqlString(path)}),'')||${sqlString(chunk)})) ${where};`,
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

/**
 * D1 rejects very large individual SQL statements. Wrangler exports one
 * installed_apps row with the complete app manifest in a single INSERT, so a
 * metadata-heavy app can exceed that limit. Rewrite only those oversized rows
 * as a valid minimal INSERT followed by JSON1 updates. Every intermediate value
 * remains valid JSON, preserving the table CHECK constraint.
 */
export function rewriteOversizedInstalledAppRows(
  sql,
  { maxStatementBytes = DEFAULT_MAX_STATEMENT_BYTES } = {},
) {
  let rewrittenRows = 0;
  let generatedStatements = 0;
  let maxGeneratedStatementBytes = 0;
  const pattern = /^INSERT INTO "installed_apps" \((.+)\) VALUES\((.*)\);$/gm;
  const rewrittenSql = sql.replace(pattern, (statement, rawColumns, rawValues) => {
    if (Buffer.byteLength(statement) <= maxStatementBytes) return statement;
    const columns = rawColumns.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
    const values = splitSqlValues(rawValues);
    if (columns.length !== values.length) throw new Error("installed_apps backup column/value count mismatch");
    const manifestIndex = columns.indexOf("manifest_json");
    const tenantIndex = columns.indexOf("tenant_id");
    const appIndex = columns.indexOf("app_id");
    if (manifestIndex < 0 || tenantIndex < 0 || appIndex < 0) {
      throw new Error("installed_apps backup row is missing tenant_id, app_id, or manifest_json");
    }
    const manifest = JSON.parse(decodeSqlString(values[manifestIndex]));
    const baseValues = [...values];
    baseValues[manifestIndex] = "'{}'";
    const base = `INSERT INTO "installed_apps" (${rawColumns}) VALUES(${baseValues.join(",")});`;
    const updates = manifestUpdates({
      manifest,
      tenantToken: values[tenantIndex],
      appToken: values[appIndex],
      maxStatementBytes,
    });
    const generated = [base, ...updates];
    for (const item of generated) {
      maxGeneratedStatementBytes = Math.max(maxGeneratedStatementBytes, Buffer.byteLength(item));
    }
    rewrittenRows += 1;
    generatedStatements += generated.length;
    return generated.join("\n");
  });
  return { sql: rewrittenSql, rewrittenRows, generatedStatements, maxGeneratedStatementBytes };
}
