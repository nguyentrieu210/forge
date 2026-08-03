#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const RISK_ORDER = { FAST: 0, STANDARD: 1, CRITICAL: 2 };
const CLAIMS = new Set(["UI_PROMOTION", "RC", "HARDENED", "DEPLOYED"]);
const SHA_RE = /^[0-9a-f]{40}$/i;

function parseArgs(argv) {
  const args = { plan: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--plan" || token === "--dry-run") args.plan = true;
    else if (token === "--json") args.json = true;
    else if (["--profile", "--matrix", "--risk", "--report"].includes(token)) {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${token}`);
      args[token.slice(2)] = value;
      i += 1;
    } else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeProfile(input, cliRisk) {
  return {
    ...input,
    risk: String(cliRisk ?? input.risk ?? "").toUpperCase(),
    domains: Array.isArray(input.domains) ? input.domains.map((item) => String(item).toLowerCase()) : [],
    claims: Array.isArray(input.claims) ? input.claims.map((item) => String(item).toUpperCase()) : [],
    touches: {
      ui: false,
      mobile: false,
      migration: false,
      authoritativeMutation: false,
      tenantBoundary: false,
      ...(input.touches ?? {})
    },
    checks: input.checks ?? {},
    diagnostics: Array.isArray(input.diagnostics) ? input.diagnostics : []
  };
}

function validateProfile(profile, matrix) {
  const errors = [];
  if (!(profile.risk in RISK_ORDER)) errors.push(`risk must be FAST, STANDARD or CRITICAL; got ${profile.risk || "<empty>"}`);
  if (!profile.changeId || typeof profile.changeId !== "string") errors.push("changeId is required");
  if (!SHA_RE.test(profile.baseSha ?? "")) errors.push("baseSha must be an exact 40-character Git SHA");
  if (!SHA_RE.test(profile.headSha ?? "")) errors.push("headSha must be an exact 40-character Git SHA");
  for (const claim of profile.claims) {
    if (!CLAIMS.has(claim)) errors.push(`unknown claim ${claim}`);
  }
  for (const [key, value] of Object.entries(profile.touches)) {
    if (typeof value !== "boolean") errors.push(`touches.${key} must be boolean`);
  }
  if (profile.claims.includes("UI_PROMOTION") && !profile.touches.ui) {
    errors.push("UI_PROMOTION claim requires touches.ui=true");
  }
  if (profile.touches.mobile && !profile.touches.ui) {
    errors.push("touches.mobile=true requires touches.ui=true");
  }
  if (profile.domains.some((domain) => ["finance", "stock", "payroll"].includes(domain)) && profile.risk !== "CRITICAL") {
    errors.push("finance/stock/payroll changes must use CRITICAL risk");
  }
  const knownRequirements = new Set(Object.keys(matrix.requirements ?? {}));
  for (const checkId of Object.keys(profile.checks)) {
    if (!knownRequirements.has(checkId)) errors.push(`checks.${checkId} is not defined in the matrix`);
  }
  return errors;
}

function minRiskMatches(actual, minimum) {
  return RISK_ORDER[actual] >= RISK_ORDER[minimum];
}

function ruleMatches(rule, profile) {
  const when = rule.when ?? {};
  if (when.risk && profile.risk !== when.risk) return false;
  if (when.minRisk && !minRiskMatches(profile.risk, when.minRisk)) return false;
  if (when.touch && profile.touches[when.touch] !== true) return false;
  if (when.claim && !profile.claims.includes(when.claim)) return false;
  if (when.claimAny && !when.claimAny.some((claim) => profile.claims.includes(claim))) return false;
  if (when.domainAny && !when.domainAny.some((domain) => profile.domains.includes(String(domain).toLowerCase()))) return false;
  return true;
}

function requiredChecks(profile, matrix) {
  const lane = matrix.lanes?.[profile.risk];
  if (!lane) throw new Error(`No matrix lane for risk ${profile.risk}`);
  const required = new Map();
  for (const id of lane.required ?? []) required.set(id, [`lane:${profile.risk}`]);
  for (const rule of matrix.conditionalRules ?? []) {
    if (!ruleMatches(rule, profile)) continue;
    for (const id of rule.require ?? []) {
      const reasons = required.get(id) ?? [];
      reasons.push(`rule:${rule.id}`);
      required.set(id, reasons);
    }
  }
  return required;
}

function normalizeCheckSpec(profileSpec, requirement) {
  if (typeof profileSpec === "string") return { command: profileSpec, source: "profile" };
  if (profileSpec && typeof profileSpec === "object") return { ...profileSpec, source: "profile" };
  if (requirement.defaultCommand) return { command: requirement.defaultCommand, source: "matrix-default" };
  return { source: "missing" };
}

function verifyEvidencePaths(paths, cwd) {
  const list = Array.isArray(paths) ? paths : paths ? [paths] : [];
  if (!list.length) return { ok: false, message: "no evidencePaths configured" };
  const missing = list.filter((path) => !existsSync(resolve(cwd, path)));
  if (missing.length) return { ok: false, message: `missing evidence path(s): ${missing.join(", ")}` };
  const empty = list.filter((path) => {
    const absolute = resolve(cwd, path);
    const stat = statSync(absolute);
    return stat.isFile() && stat.size === 0;
  });
  if (empty.length) return { ok: false, message: `empty evidence file(s): ${empty.join(", ")}` };
  return { ok: true, message: list.join(", ") };
}

function verifyReleaseEvidence(spec, profile, cwd) {
  const evidencePath = spec.path ?? spec.evidencePath ?? spec.evidencePaths?.[0];
  if (!evidencePath) return { ok: false, message: "production release evidence requires path/evidencePath" };
  const absolute = resolve(cwd, evidencePath);
  if (!existsSync(absolute)) return { ok: false, message: `missing production release evidence: ${evidencePath}` };
  let data;
  try {
    data = loadJson(absolute);
  } catch (error) {
    return { ok: false, message: `invalid release evidence JSON: ${error.message}` };
  }
  const expectedSha = String(spec.releaseSha ?? profile.headSha ?? "");
  if (!SHA_RE.test(expectedSha)) return { ok: false, message: "release evidence requires an exact 40-character releaseSha/headSha" };
  if (data.releaseSha !== expectedSha) return { ok: false, message: `releaseSha mismatch: expected ${expectedSha}, got ${data.releaseSha ?? "<missing>"}` };
  if (data.deployedSha != null && data.deployedSha !== expectedSha) {
    return { ok: false, message: `deployedSha mismatch: expected ${expectedSha}, got ${data.deployedSha}` };
  }
  if (typeof data.bundleHash !== "string" || data.bundleHash.trim().length < 8) {
    return { ok: false, message: "bundleHash must be a non-empty release bundle marker (>=8 chars)" };
  }
  if (typeof data.completedAt !== "string" || Number.isNaN(Date.parse(data.completedAt))) {
    return { ok: false, message: "completedAt must be a valid timestamp" };
  }
  return { ok: true, message: `${evidencePath} releaseSha=${data.releaseSha} bundleHash=${data.bundleHash}` };
}

function commandResult(command, cwd, env = process.env) {
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd,
    env,
    shell: true,
    stdio: "inherit"
  });
  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    durationMs: Date.now() - startedAt,
    error: result.error?.message ?? null
  };
}

function classifyInherited(diagnostic, profile) {
  const inherited = diagnostic.inherited;
  if (!inherited) return { inherited: false, reason: "not classified" };
  if (inherited.baseSha !== profile.baseSha) {
    return { inherited: false, reason: `inherited.baseSha must equal profile.baseSha (${profile.baseSha})` };
  }
  if (!inherited.tracking || !inherited.reason) {
    return { inherited: false, reason: "inherited classification requires tracking and reason" };
  }
  return { inherited: true, reason: inherited.reason, tracking: inherited.tracking };
}

function buildPlan(profile, matrix) {
  const required = requiredChecks(profile, matrix);
  const items = [];
  const missing = [];
  for (const [id, reasons] of required.entries()) {
    const requirement = matrix.requirements[id];
    if (!requirement) {
      missing.push(`${id}: requirement missing from matrix`);
      continue;
    }
    const spec = normalizeCheckSpec(profile.checks[id], requirement);
    const hasImplementation = requirement.kind === "releaseEvidence"
      ? Boolean(spec.path || spec.evidencePath || spec.evidencePaths)
      : Boolean(spec.command || spec.evidencePaths);
    if (!hasImplementation) missing.push(`${id}: no command/evidence implementation`);
    items.push({ id, label: requirement.label ?? id, reasons, requirement, spec, hasImplementation });
  }
  return { items, missing };
}

function executePlan(plan, profile, cwd) {
  const results = [];
  for (const item of plan.items) {
    if (!item.hasImplementation) {
      results.push({ id: item.id, status: "MISSING", reasons: item.reasons, message: "no command/evidence implementation" });
      continue;
    }
    const spec = item.spec;
    let command = null;
    let evidence = null;
    let release = null;
    if (spec.command) command = commandResult(spec.command, cwd, { ...process.env, FORGE_VALIDATION_CHECK: item.id });
    if (!command || command.ok) {
      if (spec.evidencePaths) evidence = verifyEvidencePaths(spec.evidencePaths, cwd);
      if (item.requirement.kind === "releaseEvidence") release = verifyReleaseEvidence(spec, profile, cwd);
    }
    const ok = (!command || command.ok) && (!evidence || evidence.ok) && (!release || release.ok);
    results.push({
      id: item.id,
      status: ok ? "PASS" : "FAIL",
      reasons: item.reasons,
      source: spec.source,
      command: spec.command ?? null,
      commandResult: command,
      evidence,
      release,
      message: command?.error ?? evidence?.message ?? release?.message ?? null
    });
    if (!ok) break;
  }
  return results;
}

function executeDiagnostics(profile, cwd) {
  const results = [];
  for (const diagnostic of profile.diagnostics) {
    if (!diagnostic.id || !diagnostic.command) {
      results.push({ id: diagnostic.id ?? "<missing>", status: "INVALID", message: "diagnostic requires id and command" });
      continue;
    }
    const result = commandResult(diagnostic.command, cwd, { ...process.env, FORGE_VALIDATION_DIAGNOSTIC: diagnostic.id });
    if (result.ok) {
      results.push({ id: diagnostic.id, status: "PASS", command: diagnostic.command, commandResult: result });
      continue;
    }
    const classification = classifyInherited(diagnostic, profile);
    results.push({
      id: diagnostic.id,
      status: classification.inherited ? "INHERITED" : "UNTRIAGED_FAIL",
      command: diagnostic.command,
      commandResult: result,
      inherited: classification
    });
  }
  return results;
}

function summarize(report) {
  const gateFailures = report.gates.filter((item) => item.status !== "PASS");
  const untriaged = report.diagnostics.filter((item) => ["UNTRIAGED_FAIL", "INVALID"].includes(item.status));
  const inherited = report.diagnostics.filter((item) => item.status === "INHERITED");
  if (report.configurationErrors.length || report.missingImplementations.length) return { status: "CONFIG_FAIL", exitCode: 2 };
  if (gateFailures.length) return { status: "GATE_FAIL", exitCode: 1 };
  if (untriaged.length) return { status: "PASS_GATES_DIAGNOSTIC_TRIAGE_REQUIRED", exitCode: 3 };
  if (inherited.length) return { status: "PASS_WITH_INHERITED_DEBT", exitCode: 0 };
  return { status: "PASS", exitCode: 0 };
}

function humanPrint(report) {
  console.log(`\nForge validation gate: ${report.profile.changeId}`);
  console.log(`risk=${report.profile.risk} base=${report.profile.baseSha} head=${report.profile.headSha}`);
  for (const item of report.plan) {
    console.log(`- ${item.id}: ${item.hasImplementation ? "READY" : "MISSING"} [${item.reasons.join(", ")}] (${item.source})`);
  }
  for (const item of report.gates) {
    console.log(`  gate ${item.id}: ${item.status}${item.message ? ` — ${item.message}` : ""}`);
  }
  for (const item of report.diagnostics) {
    const detail = item.inherited?.tracking ? ` — ${item.inherited.tracking}` : "";
    console.log(`  diagnostic ${item.id}: ${item.status}${detail}`);
  }
  if (report.configurationErrors.length) console.error(`configuration errors:\n- ${report.configurationErrors.join("\n- ")}`);
  if (report.missingImplementations.length) console.error(`missing implementations:\n- ${report.missingImplementations.join("\n- ")}`);
  console.log(`result=${report.summary.status}`);
}

function usage() {
  return "Usage:\n  node scripts/run-validation-gate.mjs --profile <json> [--matrix validation/rc-gates.json] [--plan] [--json] [--report <json>]\n\nThe profile binds the gate to exact base/head SHA, risk, domains, touched invariants and promotion claims.";
}

async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return 2;
  }
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.profile) {
    console.error("--profile is required so validation is tied to exact base/head evidence");
    console.error(usage());
    return 2;
  }
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const matrixPath = resolve(cwd, args.matrix ?? resolve(repoRoot, "validation/rc-gates.json"));
  const profilePath = resolve(cwd, args.profile);
  let matrix;
  let rawProfile;
  try {
    matrix = loadJson(matrixPath);
    rawProfile = loadJson(profilePath);
  } catch (error) {
    console.error(`Unable to load validation input: ${error.message}`);
    return 2;
  }
  const profile = normalizeProfile(rawProfile, args.risk);
  const configurationErrors = validateProfile(profile, matrix);
  let plan = { items: [], missing: [] };
  if (!configurationErrors.length) plan = buildPlan(profile, matrix);
  const report = {
    matrixVersion: matrix.version,
    generatedAt: new Date().toISOString(),
    mode: args.plan ? "plan" : "execute",
    profile,
    configurationErrors,
    missingImplementations: plan.missing,
    plan: plan.items.map((item) => ({
      id: item.id,
      label: item.label,
      reasons: item.reasons,
      source: item.spec.source,
      hasImplementation: item.hasImplementation,
      command: item.spec.command ?? null,
      evidencePaths: item.spec.evidencePaths ?? null,
      evidencePath: item.spec.path ?? item.spec.evidencePath ?? null
    })),
    gates: [],
    diagnostics: [],
    summary: { status: "PENDING", exitCode: 2 }
  };
  if (!args.plan && !configurationErrors.length && !plan.missing.length) {
    report.gates = executePlan(plan, profile, cwd);
    if (report.gates.every((item) => item.status === "PASS")) report.diagnostics = executeDiagnostics(profile, cwd);
  }
  report.summary = summarize(report);
  if (args.plan && !configurationErrors.length && !plan.missing.length) report.summary = { status: "PLAN_READY", exitCode: 0 };
  if (args.report) writeFileSync(resolve(cwd, args.report), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else humanPrint(report);
  return report.summary.exitCode;
}

export {
  buildPlan,
  classifyInherited,
  loadJson,
  normalizeProfile,
  requiredChecks,
  ruleMatches,
  summarize,
  validateProfile,
  verifyReleaseEvidence
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
