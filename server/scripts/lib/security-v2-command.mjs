const PREFIX = "/forge-security-v2-bootstrap";
const ALLOWED_KEYS = new Set(["target_sha", "confirm"]);

export function parseSecurityV2IssueCommand(body) {
  const text = String(body ?? "").trim();
  const newline = text.indexOf("\n");
  const first = newline === -1 ? text : text.slice(0, newline).trim();
  if (first !== PREFIX) throw new Error(`first line must be exactly ${PREFIX}`);
  const jsonText = newline === -1 ? "" : text.slice(newline + 1).trim();
  if (!jsonText) throw new Error("security-v2 bootstrap command requires a JSON payload");
  let raw;
  try { raw = JSON.parse(jsonText); } catch { throw new Error("security-v2 bootstrap payload must be valid JSON"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("security-v2 bootstrap payload must be an object");
  const unknown = Object.keys(raw).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknown.length) throw new Error(`unknown security-v2 bootstrap keys: ${unknown.join(", ")}`);
  const targetSha = String(raw.target_sha ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(targetSha)) throw new Error("target_sha must be an exact 40-character commit SHA");
  if (raw.confirm !== "security-v2") throw new Error("confirm must be exactly security-v2");
  return { target_sha: targetSha, confirm: "security-v2" };
}

export function securityV2GithubOutputLines(command) {
  return [`target_sha=${command.target_sha}`, `confirm=${command.confirm}`];
}
