const COMMAND = "/forge-demo-provision";
const ALLOWED_KEYS = new Set([
  "customer_name",
  "slug",
  "brief",
  "admin_user",
  "plan",
  "provision_standard",
  "target_sha",
  "confirm",
]);

function assertText(value, name, max = 120) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  if (value.length > max) throw new Error(`${name} is too long`);
  if (/\r|\n/.test(value)) throw new Error(`${name} must be one line`);
  return value.trim();
}

export function parseDemoIssueCommand(body) {
  if (typeof body !== "string") throw new Error("command body must be a string");
  const normalized = body.trim();
  const newline = normalized.indexOf("\n");
  const firstLine = (newline < 0 ? normalized : normalized.slice(0, newline)).trim();
  if (firstLine !== COMMAND) throw new Error(`first line must be exactly ${COMMAND}`);

  const payloadText = newline < 0 ? "" : normalized.slice(newline + 1).trim();
  if (!payloadText) throw new Error("command must include a JSON payload on the following lines");

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`command JSON is invalid: ${error.message}`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("command payload must be a JSON object");

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_KEYS.has(key)) throw new Error(`unsupported command key: ${key}`);
  }
  for (const key of ALLOWED_KEYS) {
    if (!(key in payload)) throw new Error(`missing command key: ${key}`);
  }

  const customerName = assertText(payload.customer_name, "customer_name", 100);
  const slug = assertText(payload.slug, "slug", 63).toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(slug) || slug.endsWith("-")) throw new Error("slug must be a lowercase DNS label starting with a letter");

  const brief = assertText(payload.brief, "brief", 80);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(brief)) throw new Error("brief must be a simple server/briefs name");

  const adminUser = assertText(payload.admin_user, "admin_user", 100);
  if (!/^[A-Za-z0-9._@+-]+$/.test(adminUser)) throw new Error("admin_user contains unsupported characters");

  const plan = assertText(payload.plan, "plan", 20);
  if (!["free", "pro", "enterprise"].includes(plan)) throw new Error("plan must be free, pro or enterprise");
  if (typeof payload.provision_standard !== "boolean") throw new Error("provision_standard must be boolean");

  const targetSha = assertText(payload.target_sha, "target_sha", 40).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(targetSha)) throw new Error("target_sha must be an exact 40-character commit SHA");
  if (payload.confirm !== "demo") throw new Error('confirm must be exactly "demo"');

  return {
    customer_name: customerName,
    slug,
    brief,
    admin_user: adminUser,
    plan,
    provision_standard: payload.provision_standard,
    target_sha: targetSha,
    confirm: "demo",
  };
}

export function githubOutputLines(command) {
  return [
    `customer_name=${command.customer_name}`,
    `slug=${command.slug}`,
    `brief=${command.brief}`,
    `admin_user=${command.admin_user}`,
    `plan=${command.plan}`,
    `provision_standard=${command.provision_standard}`,
    `target_sha=${command.target_sha}`,
    `confirm=${command.confirm}`,
  ];
}
