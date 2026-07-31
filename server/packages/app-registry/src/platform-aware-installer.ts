/**
 * App installer boundary for tenants that already carry the platform's standard
 * metadata catalogue.
 *
 * Tenant migrations provision non-custom DocTypes such as UOM so the generic Desk can
 * boot before an application is installed. A full authoritative application then ships
 * the complete definition for those same DocTypes. The core installer correctly refuses
 * to overwrite unowned metadata, because an unowned CUSTOM DocType can be customer work.
 * The distinction the generic guard cannot see is `is_custom`.
 *
 * This adapter changes only that one ownership probe:
 *
 * - an existing `is_custom=0` definition may be adopted when the incoming application
 *   also declares it as non-custom;
 * - customer-created/custom metadata remains visible to the core guard and is refused;
 * - metadata owned by another app is checked by the unchanged core installer first;
 * - no ownership row is written before the install batch, so installation remains
 *   all-or-nothing.
 */

import type { D1UserStore } from "../../auth/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";
import type { MetadataStore } from "../../frappe-model/src/index.js";
import {
  AppInstaller as CoreAppInstaller,
  type InstallResult,
} from "./installer.js";
import { parseAppManifest } from "./manifest.js";

type D1Target = D1Database | D1DatabaseSession;

type AdoptionState = {
  adoptableDocTypes: Set<string>;
};

const UNOWNED_DOCTYPE_PROBE =
  "SELECT 1 AS found FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2";

/** Exported so the security boundary has a small deterministic regression surface. */
export function canAdoptPlatformDocType(existingIsCustom: unknown, incomingCustom: boolean): boolean {
  return Number(existingIsCustom) === 0 && incomingCustom === false;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function bindMethod<T extends object>(target: T, property: PropertyKey): unknown {
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
}

/**
 * Presents platform-standard metadata as absent only to the core installer's
 * "unowned DocType" probe. Every other query and every write goes to the original D1
 * object unchanged.
 */
function platformOwnershipView(db: D1Database, state: AdoptionState): D1Database {
  const wrap = (target: D1Target): D1Target => new Proxy(target, {
    get(current, property) {
      if (property === "withSession") {
        const withSession = Reflect.get(current, property, current) as
          | ((constraintOrBookmark?: string) => D1DatabaseSession)
          | undefined;
        if (typeof withSession !== "function") return undefined;
        return (constraintOrBookmark?: string) =>
          wrap(withSession.call(current, constraintOrBookmark));
      }

      if (property !== "prepare") return bindMethod(current, property);

      return (sql: string) => {
        const prepared = current.prepare(sql);
        if (normalizeSql(sql) !== UNOWNED_DOCTYPE_PROBE) return prepared;

        return new Proxy(prepared, {
          get(statement, statementProperty) {
            if (statementProperty !== "bind") return bindMethod(statement, statementProperty);

            return (...values: unknown[]) => {
              const bound = statement.bind(...values);
              return new Proxy(bound, {
                get(boundStatement, boundProperty) {
                  if (boundProperty !== "first") return bindMethod(boundStatement, boundProperty);

                  return async (...firstArgs: unknown[]) => {
                    // The core guard calls `first()` without a column name. Preserve any
                    // future overload rather than guessing its return shape.
                    if (firstArgs.length) {
                      const first = Reflect.get(boundStatement, "first", boundStatement) as (...args: unknown[]) => Promise<unknown>;
                      return first.apply(boundStatement, firstArgs);
                    }

                    const tenantId = String(values[0] ?? "");
                    const doctype = String(values[1] ?? "");
                    const existing = await current.prepare(
                      "SELECT is_custom FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2",
                    ).bind(tenantId, doctype).first<{ is_custom: number }>();

                    if (
                      existing
                      && state.adoptableDocTypes.has(doctype)
                      && canAdoptPlatformDocType(existing.is_custom, false)
                    ) {
                      return null;
                    }

                    return existing ? ({ found: 1 } as JsonObject) : null;
                  };
                },
              });
            };
          },
        });
      };
    },
  });

  return wrap(db) as D1Database;
}

/**
 * Drop-in replacement exported as `AppInstaller` from the package barrel.
 *
 * The incoming manifest is parsed before delegating only to identify which declarations
 * are authoritative non-custom DocTypes. The core installer parses and validates it again
 * before any write, so this adapter does not become a second validation implementation.
 */
export class AppInstaller extends CoreAppInstaller {
  private readonly adoptionState: AdoptionState;

  constructor(
    db: D1Database,
    metadata: MetadataStore,
    users: D1UserStore,
    platformVersion = "1.0.0",
  ) {
    const state: AdoptionState = { adoptableDocTypes: new Set() };
    super(platformOwnershipView(db, state), metadata, users, platformVersion);
    this.adoptionState = state;
  }

  override async install(
    tenantId: string,
    packageValue: unknown,
    actor: string,
    now: string,
  ): Promise<InstallResult> {
    const manifest = parseAppManifest(packageValue);
    this.adoptionState.adoptableDocTypes = new Set(
      manifest.doctypes
        .filter((doctype) => doctype.custom !== true)
        .map((doctype) => doctype.name),
    );

    try {
      return await super.install(tenantId, packageValue, actor, now);
    } finally {
      this.adoptionState.adoptableDocTypes.clear();
    }
  }
}
