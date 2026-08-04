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
import { errors } from "../../core/src/index.js";
import type { MetadataStore } from "../../frappe-model/src/index.js";
import {
  AppInstaller as CoreAppInstaller,
  type InstallResult,
} from "./installer.js";
import { assertAppUpgradeMaterializationCompatible } from "./app-upgrade-guard.js";
import { parseAppManifest } from "./manifest.js";
import { satisfiesMinimumVersionRequirement } from "./version-requirement.js";

type D1Target = D1Database | D1DatabaseSession;

type AdoptionState = {
  adoptableDocTypes: Set<string>;
};

const UNOWNED_DOCTYPE_PROBE =
  "SELECT 1 AS found FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2";

/** Exported so the security boundary has a small deterministic regression surface. */
export function canAdoptPlatformDocType(existingIsCustom: unknown, incomingCustom: boolean): boolean {
  const isStandardDefinition = existingIsCustom === 0 || existingIsCustom === "0";
  return isStandardDefinition && incomingCustom === false;
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
                    if (firstArgs.length) {
                      const first = Reflect.get(boundStatement, "first", boundStatement) as (...args: unknown[]) => Promise<unknown>;
                      return first.apply(boundStatement, firstArgs);
                    }

                    const tenantId = String(values[0] ?? "");
                    const doctype = String(values[1] ?? "");
                    const existing = await current.prepare(
                      "SELECT is_custom FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2",
                    ).bind(tenantId, doctype).first<{ is_custom: number | string }>();

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
 * The incoming manifest is parsed before delegating to identify which declarations are
 * authoritative non-custom DocTypes and to keep app upgrades fail-closed when a package
 * drops metadata that the core installer materialized outside `installed_apps`.
 */
export class AppInstaller extends CoreAppInstaller {
  private readonly adoptionState: AdoptionState;
  private readonly sourceDb: D1Database;

  constructor(
    db: D1Database,
    metadata: MetadataStore,
    users: D1UserStore,
    platformVersion = "1.0.0",
  ) {
    const state: AdoptionState = { adoptableDocTypes: new Set() };
    super(platformOwnershipView(db, state), metadata, users, platformVersion);
    this.adoptionState = state;
    this.sourceDb = db;
  }

  override async install(
    tenantId: string,
    packageValue: unknown,
    actor: string,
    now: string,
  ): Promise<InstallResult> {
    const manifest = parseAppManifest(packageValue);

    // The historical core comparator treats version strings as numeric components.
    // That is correct for the original bare-minimum contract but permissive for an
    // operator-prefixed requirement such as `>=1.3.0` (`>=1` became 0). Enforce the
    // canonical requirement grammar and minimum here before delegating so a malformed
    // or too-old dependency cannot reach the transactional installer.
    if (manifest.requires.length) {
      const rows = await this.sourceDb.prepare(
        "SELECT app_id,version FROM installed_apps WHERE tenant_id=?1",
      ).bind(tenantId).all<{ app_id: string; version: string }>();
      const installedVersions = new Map((rows.results ?? []).map((row) => [row.app_id, row.version]));
      for (const dependency of manifest.requires) {
        const installedVersion = installedVersions.get(dependency.id);
        if (!installedVersion) {
          throw errors.validation(`${manifest.id} requires ${dependency.id} ${dependency.version}`);
        }
        if (!satisfiesMinimumVersionRequirement(installedVersion, dependency.version)) {
          throw errors.validation(
            `${manifest.id} requires ${dependency.id} ${dependency.version}; installed is ${installedVersion}`,
          );
        }
      }
    }

    const installed = await this.sourceDb.prepare(
      "SELECT manifest_json FROM installed_apps WHERE tenant_id=?1 AND app_id=?2",
    ).bind(tenantId, manifest.id).first<{ manifest_json: string }>();
    if (installed) {
      const current = parseAppManifest(JSON.parse(installed.manifest_json));
      assertAppUpgradeMaterializationCompatible(current, manifest);
    }

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
