/**
 * Asking an app to approve a write BEFORE it is committed — Frappe's `validate`.
 *
 * An after-commit hook can react but never refuse, so every rule that had to BLOCK a
 * write was forced to become platform code. This is the seam that gives that back.
 *
 * WHERE IT RUNS, AND WHY NOT INSIDE THE WRITE. The check happens at the API layer,
 * before the command is handed to the aggregate's Durable Object. Putting a third-party
 * Worker inside the DO would be worse in two specific ways: one slow app would stall
 * every write to that aggregate for everybody, and a timeout mid-transaction would
 * leave the platform unable to say whether the write happened. Outside the lock, a slow
 * app delays only its own tenant's request, and a timeout means the write simply did
 * not start.
 *
 * WHAT THAT COSTS, STATED PLAINLY. Checking outside the transaction is check-then-act:
 * state can change between the approval and the commit. So this is the right home for
 * BUSINESS rules ("leave beyond the remaining balance", "supplier is blocked") where a
 * rare race is acceptable and the next write will catch it. It is the WRONG home for an
 * invariant that must never be violated even once — those belong in a SQL guard or in
 * metadata, which the kernel enforces inside the transaction. Do not move accounting or
 * stock invariants here.
 *
 * FAIL CLOSED. An app that cannot be reached refuses the write. The alternative —
 * allowing it — would mean a rule the tenant declared silently stops applying the
 * moment an app Worker is down, which is the failure mode nobody notices until an audit.
 */

import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { createTrustedIdentity, deriveAppCallKey, IDENTITY_HEADER, IDENTITY_SIGNATURE_HEADER } from "../../auth/src/index.js";
import { errors } from "../../core/src/index.js";
import type { AppMethodEnv } from "./method-dispatch.js";

/**
 * Wall-clock budget for one validator.
 *
 * Still tight — a user is waiting and the write has not started — but 2 000 ms was set for a
 * validator that only COMPUTES, and that is not the shape the platform actually gives apps.
 * An app Worker holds no data bindings by design: every master it needs comes back through
 * the gateway under the caller's identity, so one read is app → gateway → tenant → back. A
 * purchase receipt has to see the Item, its Measurement Profile and its Item Color before it
 * can say yes, and those cannot all be fetched in a single wave because the profile name is
 * inside the Item.
 *
 * Measured on the real tenant: a three-line aluminium receipt spent ~2 800 ms and was refused
 * for being SLOW rather than wrong — so the rule never ran at all, on any document, since the
 * seam shipped. A budget no correct validator can meet does not protect anything; it only
 * makes the feature look broken.
 *
 * 5 000 ms is the cost of about three sequential waves with headroom, and still bounds how
 * long an uncommitted write may hold. Apps are expected to batch — see `warmMasters` in the
 * alumdoor Worker — and this budget is not the place to absorb an unbatched one.
 */
export const VALIDATOR_TIMEOUT_MS = 5_000;

export interface ValidatorTarget {
  appId: string;
  worker: string;
}

export interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: JsonObject;
}

/** Apps that asked to inspect this doctype and action. */
export function validatorsFor(
  installed: Array<{ app_id: string; worker: string | null; validators?: Array<{ doctype: string; actions?: string[] }> }>,
  doctype: string,
  action: string,
): ValidatorTarget[] {
  const targets: ValidatorTarget[] = [];
  for (const app of installed) {
    if (!app.worker) continue;
    const matches = (app.validators ?? []).some((rule) =>
      (rule.doctype === "*" || rule.doctype === doctype)
      && (!rule.actions || rule.actions.includes(action)));
    if (matches) targets.push({ appId: app.app_id, worker: app.worker });
  }
  return targets;
}

function isLoopbackOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Production uses a Workers-for-Platforms DispatchNamespace. Wrangler cannot simulate
 * user Workers inside a local dispatch namespace, so the authenticated browser gate runs
 * the real app Worker beside the tenant Worker and binds it as a single Fetcher named
 * DISPATCHER.
 *
 * The fallback is intentionally narrow: loopback callback, exactly one validator target,
 * and an actual Fetcher. A deployed origin, or a tenant with more than one validating app,
 * still requires a real DispatchNamespace and fails closed.
 */
function validatorWorker(env: AppMethodEnv, target: ValidatorTarget, targetCount: number): Fetcher {
  const dispatcher = env.DISPATCHER;
  if (!dispatcher) throw errors.misconfigured("App validator dispatcher is missing");

  const maybeGet = Reflect.get(dispatcher as object, "get");
  if (typeof maybeGet === "function") {
    return maybeGet.call(dispatcher, target.worker, {}, { limits: { cpuMs: 100, subRequests: 20 } }) as Fetcher;
  }

  const localFetcher = dispatcher as unknown as Fetcher;
  if (targetCount !== 1 || !isLoopbackOrigin(env.PUBLIC_ORIGIN) || typeof localFetcher.fetch !== "function") {
    throw errors.misconfigured("App validator dispatcher is not a DispatchNamespace");
  }
  return localFetcher;
}

/**
 * Runs every matching validator; throws on the first refusal.
 *
 * Sequential rather than parallel: a refusal makes the remaining checks pointless, and
 * a tenant with several validating apps should not pay for all of them on every write.
 */
export async function runAppValidators(input: {
  env: AppMethodEnv;
  tenantId: string;
  actor: Actor;
  traceId: string;
  subject: ValidatorSubject;
  targets: ValidatorTarget[];
}): Promise<void> {
  const { env, tenantId, actor, traceId, subject, targets } = input;
  if (!targets.length) return;
  if (!env.DISPATCHER || !env.INTERNAL_AUTH_SECRET) {
    // Validators were declared and cannot be run. Allowing the write would drop the
    // rule silently; this says so instead.
    throw errors.misconfigured("App validators are declared but this deployment cannot reach app Workers");
  }

  const keyId = env.INTERNAL_AUTH_KEY_ID ?? "k1";
  for (const target of targets) {
    const [callKey, identity] = await Promise.all([
      deriveAppCallKey(env.INTERNAL_AUTH_SECRET, tenantId, target.appId),
      createTrustedIdentity({
        tenantId, actor, traceId, masterSecret: env.INTERNAL_AUTH_SECRET, keyId,
        ttlSeconds: Math.ceil(VALIDATOR_TIMEOUT_MS / 1000) + 5,
      }),
    ]);

    const worker = validatorWorker(env, target, targets.length);
    let response: Response;
    try {
      response = await withTimeout(worker.fetch("https://app.internal/hooks/validate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cloudforge-tenant": tenantId,
          "x-cloudforge-app": target.appId,
          "x-cloudforge-trace-id": traceId,
          authorization: `Bearer ${callKey}`,
          [IDENTITY_HEADER]: identity.encoded,
          [IDENTITY_SIGNATURE_HEADER]: identity.signature,
          ...(env.PUBLIC_ORIGIN ? { "x-cloudforge-callback": `${env.PUBLIC_ORIGIN.replace(/\/$/, "")}/_app/` } : {}),
        },
        body: JSON.stringify(subject),
      }), VALIDATOR_TIMEOUT_MS);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "no answer";
      throw errors.validation(`${target.appId} could not check this change: ${detail}`, { app_id: target.appId });
    }

    if (response.ok) continue;

    const text = await response.text();
    let message = "";
    try {
      const body = JSON.parse(text) as JsonObject;
      if (typeof body.message === "string") message = body.message;
    } catch {
      message = "";
    }
    // The app's own wording, attributed. A refusal is a VALIDATION_ERROR whatever status
    // the app chose — an app must not be able to answer 401 and log the user out.
    throw errors.validation(message || `${target.appId} refused this change`, { app_id: target.appId });
  }
}

async function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<Response>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
