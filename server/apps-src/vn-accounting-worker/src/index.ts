import {
  evaluateTaxRuleset,
  parseTaxRuleset,
  parseTaxTestVectors,
  validateTaxTestVectors,
} from "./evaluator.js";

interface Env {
  PLATFORM?: Fetcher;
}

interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

interface MethodBody {
  method?: string;
  args?: Record<string, unknown>;
}

type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});
const accept = () => json({ ok: true });
const refuse = (message: string) => json({ message }, 422);

function callbackBase(request: Request): string {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("platform callback origin is required");
  return declared.replace(/\/$/, "");
}

function platformCaller(request: Request, env: Env): PlatformCall {
  const base = callbackBase(request);
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...forwarded,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

function isoDate(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  return text;
}

function validateRulesetPayload(payload: Record<string, unknown>): void {
  const schemaVersion = Number(payload.schema_version ?? 1);
  if (schemaVersion !== 1) throw new Error("VN Tax Ruleset schema_version must be 1");
  const schema = parseTaxRuleset(payload.expression_json);
  const vectors = parseTaxTestVectors(payload.test_vectors_json);
  validateTaxTestVectors(schema, vectors);
}

async function handleValidation(request: Request): Promise<Response> {
  const subject = await request.json<ValidatorSubject>();
  if (subject.doctype !== "VN Tax Ruleset" || subject.action !== "submit") return accept();
  try {
    validateRulesetPayload(subject.payload ?? {});
    return accept();
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Tax ruleset validation failed");
  }
}

async function readDocument(call: PlatformCall, doctype: string, name: string): Promise<Record<string, unknown>> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`${doctype} ${name} could not be read (HTTP ${response.status})`);
  const body = await response.json<{ data?: Record<string, unknown> }>();
  if (!body.data) throw new Error(`${doctype} ${name} was not returned by the platform`);
  return body.data;
}

async function evaluateMethod(request: Request, env: Env, args: Record<string, unknown>): Promise<Response> {
  const rulesetName = String(args.ruleset ?? "").trim();
  if (!rulesetName) return refuse("ruleset is required");
  const effectiveAt = isoDate(args.effective_at, "effective_at");
  const company = String(args.company ?? "").trim();
  if (!company) return refuse("company is required");
  const call = platformCaller(request, env);
  const ruleset = await readDocument(call, "VN Tax Ruleset", rulesetName);
  if (Number(ruleset.docstatus) !== 1) return refuse(`VN Tax Ruleset ${rulesetName} must be submitted`);
  if (String(ruleset.company ?? "") !== company) return refuse(`VN Tax Ruleset ${rulesetName} belongs to another company`);
  const from = isoDate(ruleset.effective_from, "ruleset effective_from");
  const to = ruleset.effective_to ? isoDate(ruleset.effective_to, "ruleset effective_to") : "9999-12-31";
  if (effectiveAt < from || effectiveAt > to) return refuse(`VN Tax Ruleset ${rulesetName} is not effective on ${effectiveAt}`);
  try {
    validateRulesetPayload(ruleset);
    const schema = parseTaxRuleset(ruleset.expression_json);
    const inputs = args.inputs ?? args.input_json ?? {};
    const result = evaluateTaxRuleset(schema, inputs);
    return json({
      message: {
        ruleset: rulesetName,
        company,
        rule_type: ruleset.rule_type,
        legal_rule: ruleset.legal_rule,
        source_hash: ruleset.source_hash,
        effective_at: effectiveAt,
        outputs: result.outputs,
        trace: result.trace,
      },
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Tax ruleset evaluation failed");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/hooks/validate") return handleValidation(request);
    if (request.method === "POST" && url.pathname.startsWith("/api/method/")) {
      const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
      const body = await request.json<MethodBody>().catch(() => ({}));
      if (method === "vn-accounting.tax.evaluate") return evaluateMethod(request, env, body.args ?? {});
      return json({ message: `Unknown vn-accounting method: ${method}` }, 404);
    }
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, app: "vn-accounting" });
    return json({ message: "Not found" }, 404);
  },
};
