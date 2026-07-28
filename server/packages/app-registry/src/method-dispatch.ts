/**
 * Calling an APP's own API method, synchronously, inside the request.
 *
 * This is the seam that replaces Frappe's `@frappe.whitelist()`. An app cannot ship
 * Python into the kernel, so a method it wants to expose lives in its own Worker in
 * the dispatch namespace, and the façade forwards `<app_id>.<anything>` to it.
 *
 * Without this an app can only REACT: hooks run after commit, so there is nowhere to
 * put a computed value, a button's action, or a business query. Every such need had to
 * become platform code — which is what made this a kit rather than a framework.
 *
 * WHY IT IS SAFE TO PUT A THIRD PARTY IN THE REQUEST PATH HERE, having refused to put
 * one inside the aggregate's write path (see hooks.ts): this call happens at the API
 * layer, outside the Durable Object. A slow app delays its own caller's request and
 * nothing else — it does not hold an aggregate lock, and a timeout leaves no ambiguity
 * about whether a write happened, because no write is in flight.
 *
 * WHAT THE APP RECEIVES: the method name, the caller's arguments, the tenant, and the
 * caller's identity SIGNED by the platform. It does NOT receive the user's session
 * cookie — an app that could replay that would act as the user everywhere, for twelve
 * hours, rather than for this call.
 *
 * HOW AN APP READS OR WRITES: it calls back through the gateway's `/_app/` prefix,
 * presenting the two things it was given — its per-app credential and the signed
 * identity. The gateway re-verifies both and forwards as that user, so an app can do
 * exactly what the caller could do, for as long as the call lasts, and nothing more.
 * It never holds rights of its own. See `resolveAppCallback` in the gateway.
 */

import type { Actor, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { createTrustedIdentity, deriveAppCallKey, IDENTITY_HEADER, IDENTITY_SIGNATURE_HEADER } from "../../auth/src/index.js";
import { errors } from "../../core/src/index.js";
import type { AppManifest } from "./manifest.js";

/**
 * Wall-clock budget for one app method call.
 *
 * Raised from 5s, and the reason matters more than the number. 5s was chosen when an app
 * method was assumed to be a COMPUTATION — "a user waiting for a screen". Methods that
 * write turned out to be the common case, and a write costs several callbacks: measured on
 * a live tenant, one callback is ~1.2s, because it travels app → gateway → tenant while a
 * direct client call travels one hop. So a method that reads a document, checks for a
 * duplicate, writes one, and stamps another spends ~5.9s doing nothing wrong.
 *
 * That is not a slow app; it is a budget set below the floor of the operation it funds.
 * And exceeding it is not a harmless delay: a write method that is cut off has ALREADY
 * written, while its caller is told it failed — so the user clicks again and the document
 * is created twice. Making the budget realistic removes the most common way that happens.
 *
 * Still bounded, and still shorter than a request would otherwise run for: an app cannot
 * hold a request open indefinitely, and it never holds an aggregate lock (see above), so a
 * slow app delays its own caller and nothing else. Matching the hook budget keeps one
 * number to remember rather than two.
 */
export const APP_METHOD_TIMEOUT_MS = 10_000;

/** Everything the dispatcher needs, so the router does not reach into bindings itself. */
export interface AppMethodEnv {
  DISPATCHER?: DispatchNamespace;
  INTERNAL_AUTH_SECRET?: string;
  INTERNAL_AUTH_KEY_ID?: string;
  /**
   * Public origin of the gateway, so the app knows where to call back.
   *
   * Told rather than configured in the app: an app that hard-coded its platform's URL
   * would break the moment it was installed on a tenant reached by another hostname.
   */
  PUBLIC_ORIGIN?: string;
}

export interface AppMethodTarget {
  appId: string;
  worker: string;
}

/**
 * The app whose namespace a method name falls in, or null.
 *
 * Matched on the FIRST dotted segment and only against apps that declare a worker.
 * An app called `hrm` owns `hrm.*` and nothing else, so one app can never intercept
 * another's methods — nor any of the platform's, since `frappe.*`, `metaforge.*` and
 * `forge.*` are handled before this is reached and no app may take those ids.
 */
export function appMethodTarget(
  installed: Array<{ app_id: string; worker: string | null }>,
  methodName: string,
): AppMethodTarget | null {
  const separator = methodName.indexOf(".");
  if (separator <= 0) return null;
  const appId = methodName.slice(0, separator);
  const entry = installed.find((candidate) => candidate.app_id === appId);
  // An app with no Worker has no method to call. Returning null rather than throwing
  // keeps the caller's honest "not implemented" answer for that case too.
  if (!entry?.worker) return null;
  return { appId, worker: entry.worker };
}

export interface AppMethodResult {
  /** Whatever the app returned, placed under `message` by the caller. */
  value: JsonValue;
}

/**
 * Forwards one method call to an app Worker and normalises its answer.
 *
 * Errors from an app are reported AS the app's, never laundered into a platform error:
 * a tenant debugging a failing screen must be able to tell "the app said no" from "the
 * platform broke", and an app must not be able to fabricate, say, an authentication
 * failure that would log the user out.
 */
export async function dispatchAppMethod(input: {
  env: AppMethodEnv;
  tenantId: string;
  target: AppMethodTarget;
  methodName: string;
  args: JsonObject;
  actor: Actor;
  traceId: string;
}): Promise<AppMethodResult> {
  const { env, tenantId, target, methodName, args, actor, traceId } = input;
  if (!env.DISPATCHER) throw errors.misconfigured("DISPATCHER binding is required to call app methods");
  if (!env.INTERNAL_AUTH_SECRET) throw errors.misconfigured("INTERNAL_AUTH_SECRET is required to call app methods");

  const keyId = env.INTERNAL_AUTH_KEY_ID ?? "k1";
  const [callKey, identity] = await Promise.all([
    deriveAppCallKey(env.INTERNAL_AUTH_SECRET, tenantId, target.appId),
    createTrustedIdentity({
      tenantId, actor, traceId, masterSecret: env.INTERNAL_AUTH_SECRET, keyId,
      // Just longer than the call budget. The app is given the caller's identity so it
      // can act on their behalf; a long-lived one would be a bearer credential for that
      // user sitting in third-party code.
      ttlSeconds: Math.ceil(APP_METHOD_TIMEOUT_MS / 1000) + 5,
    }),
  ]);

  const worker = env.DISPATCHER.get(target.worker, {}, {
    // The app runs on its own budget, as hooks do: a runaway app must exhaust its own
    // allowance rather than the platform's.
    limits: { cpuMs: 200, subRequests: 50 },
  });

  let response: Response;
  try {
    response = await withTimeout(worker.fetch(`https://app.internal/api/method/${encodeURIComponent(methodName)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cloudforge-tenant": tenantId,
        "x-cloudforge-app": target.appId,
        "x-cloudforge-trace-id": traceId,
        authorization: `Bearer ${callKey}`,
        [IDENTITY_HEADER]: identity.encoded,
        [IDENTITY_SIGNATURE_HEADER]: identity.signature,
        // Where to call back, and under which prefix. Both are sent so an app never
        // has to know how this platform is deployed.
        ...(env.PUBLIC_ORIGIN ? { "x-cloudforge-callback": `${env.PUBLIC_ORIGIN.replace(/\/$/, "")}/_app/` } : {}),
      },
      body: JSON.stringify({ method: methodName, args }),
    }), APP_METHOD_TIMEOUT_MS);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "call failed";
    throw errors.validation(`App ${target.appId} did not answer: ${detail}`);
  }

  const text = await response.text();
  let body: JsonObject | null = null;
  try {
    body = text ? JSON.parse(text) as JsonObject : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    // The app's own message is surfaced, attributed to the app. Its STATUS is not
    // honoured: letting an app answer 401 would let it log a user out of the platform.
    const message = typeof body?.message === "string" && body.message
      ? body.message
      : `App ${target.appId} returned ${response.status}`;
    throw errors.validation(message, { app_id: target.appId, method: methodName });
  }

  // `message` if the app used the Frappe envelope, otherwise the body as-is: an app
  // author should not have to know which convention the platform prefers.
  const value = (body && Object.hasOwn(body, "message") ? body.message : body) ?? null;
  return { value: value as JsonValue };
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
