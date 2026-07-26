/**
 * Installing, upgrading and removing an app.
 *
 * The whole point of an app being data is that installation is a single metadata
 * write. Every guard here exists because the alternative failure is silent: a
 * half-installed app, a doctype two apps both claim, or an uninstall that takes a
 * customer's own work with it.
 */

import { errors, sha256Hex } from "../../core/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";
import type { MetadataStore } from "../../frappe-model/src/index.js";
import type { D1UserStore } from "../../auth/src/index.js";
import { parseAppManifest, satisfiesVersion, type AppManifest } from "./manifest.js";

export interface InstalledAppRecord {
  app_id: string;
  app_name: string;
  version: string;
  content_hash: string;
  installed_at: string;
  nav: AppManifest["nav"];
  worker: string | null;
}

export interface InstallResult {
  app_id: string;
  version: string;
  outcome: "installed" | "upgraded" | "unchanged";
  doctypes: number;
  workflows: number;
  print_formats: number;
  roles: number;
  fixtures: number;
}

export interface UninstallResult {
  app_id: string;
  removed: { doctypes: number; workflows: number; print_formats: number; roles: number; fixtures: number };
}

type ObjectType = "DocType" | "Workflow" | "Print Format" | "Role" | "Master Record";

export class AppInstaller {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(
    db: D1Database,
    private readonly metadata: MetadataStore,
    private readonly users: D1UserStore,
  ) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async list(tenantId: string): Promise<InstalledAppRecord[]> {
    const result = await this.db.prepare(
      `SELECT app_id, app_name, version, content_hash, manifest_json, installed_at
       FROM installed_apps WHERE tenant_id=?1 ORDER BY app_id`,
    ).bind(tenantId).all<{ app_id: string; app_name: string; version: string; content_hash: string; manifest_json: string; installed_at: string }>();
    return (result.results ?? []).map((row) => {
      const manifest = JSON.parse(row.manifest_json) as AppManifest;
      return {
        app_id: row.app_id,
        app_name: row.app_name,
        version: row.version,
        content_hash: row.content_hash,
        installed_at: row.installed_at,
        nav: manifest.nav ?? [],
        worker: manifest.worker ?? null,
      };
    });
  }

  /**
   * Installs or upgrades an app.
   *
   * Re-installing the identical package is a no-op rather than a rewrite, so a
   * retried or repeated provisioning call cannot churn metadata revisions and
   * invalidate every client cache for nothing.
   */
  async install(tenantId: string, packageValue: unknown, actor: string, now: string): Promise<InstallResult> {
    const manifest = parseAppManifest(packageValue);
    const contentHash = await sha256Hex(packageValue);

    const existing = await this.db.prepare(
      `SELECT version, content_hash FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`,
    ).bind(tenantId, manifest.id).first<{ version: string; content_hash: string }>();

    if (existing?.content_hash === contentHash) {
      return { app_id: manifest.id, version: manifest.version, outcome: "unchanged", doctypes: 0, workflows: 0, print_formats: 0, roles: 0, fixtures: 0 };
    }
    if (existing && !satisfiesVersion(manifest.version, existing.version)) {
      // Downgrades are refused: the older package's DocTypes may lack fields the
      // stored documents already use, and no migration runs backwards.
      throw errors.validation(`${manifest.id} ${existing.version} is installed; downgrading to ${manifest.version} is not supported`);
    }

    await this.assertDependencies(tenantId, manifest);
    await this.assertNoForeignOwnership(tenantId, manifest);

    // Roles first: a DocPerm referencing a role that does not exist yet would be
    // ungrantable, and the storage trigger on user_roles would reject the grant.
    for (const role of manifest.roles) {
      await this.users.ensureRole(tenantId, role.role, now, { deskAccess: role.desk_access });
    }

    for (const doctype of manifest.doctypes) {
      const current = await this.metadata.getDocType(tenantId, doctype.name);
      // Carry the stored revision so putDocType's optimistic check passes on an
      // upgrade; a fresh install starts at 0.
      await this.metadata.putDocType(tenantId, { ...doctype, revision: current?.revision ?? 0 }, actor, now);
    }
    for (const workflow of manifest.workflows) {
      await this.metadata.putWorkflow(tenantId, workflow, actor, now);
    }
    for (const format of manifest.print_formats) {
      await this.metadata.putPrintFormat(tenantId, format, actor, now);
    }

    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `INSERT INTO installed_apps(tenant_id,app_id,app_name,version,content_hash,manifest_json,installed_by,installed_at,modified_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)
         ON CONFLICT(tenant_id,app_id) DO UPDATE SET
           app_name=excluded.app_name, version=excluded.version, content_hash=excluded.content_hash,
           manifest_json=excluded.manifest_json, modified_at=excluded.modified_at`,
      ).bind(tenantId, manifest.id, manifest.name, manifest.version, contentHash, JSON.stringify(manifest), actor, now),
    ];

    for (const fixture of manifest.fixtures) {
      statements.push(this.db.prepare(
        `INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
         VALUES(?1,?2,?3,0,?4,?5)
         ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json, modified_at=excluded.modified_at`,
      ).bind(tenantId, fixture.record_type, fixture.name, JSON.stringify(fixture.data), now));
    }

    // Ownership is recorded last, once every object exists, and is rewritten
    // wholesale so an upgrade that drops an object also drops its claim.
    statements.push(this.db.prepare(`DELETE FROM app_objects WHERE tenant_id=?1 AND app_id=?2`).bind(tenantId, manifest.id));
    for (const [type, scope, name] of this.ownedObjects(manifest)) {
      statements.push(this.db.prepare(
        `INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope) VALUES(?1,?2,?3,?4,?5)`,
      ).bind(tenantId, manifest.id, type, name, scope));
    }
    await this.db.batch(statements);

    return {
      app_id: manifest.id,
      version: manifest.version,
      outcome: existing ? "upgraded" : "installed",
      doctypes: manifest.doctypes.length,
      workflows: manifest.workflows.length,
      print_formats: manifest.print_formats.length,
      roles: manifest.roles.length,
      fixtures: manifest.fixtures.length,
    };
  }

  /**
   * Removes an app and everything it owns.
   *
   * Refuses while any of its DocTypes still hold documents. Deleting the
   * definition would leave rows whose schema no longer exists — unreadable,
   * unexportable, and impossible to recover without reinstalling the exact
   * package. Data outlives apps, so the data wins.
   */
  async uninstall(tenantId: string, appId: string, now: string): Promise<UninstallResult> {
    const record = await this.db.prepare(
      `SELECT manifest_json FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`,
    ).bind(tenantId, appId).first<{ manifest_json: string }>();
    if (!record) throw errors.notFound(`App is not installed: ${appId}`);
    const manifest = JSON.parse(record.manifest_json) as AppManifest;

    const dependents = await this.db.prepare(
      `SELECT app_id FROM installed_apps
       WHERE tenant_id=?1 AND app_id<>?2
         AND EXISTS(SELECT 1 FROM json_each(json_extract(manifest_json,'$.requires')) WHERE json_extract(json_each.value,'$.id')=?2)`,
    ).bind(tenantId, appId).all<{ app_id: string }>();
    if ((dependents.results ?? []).length) {
      throw errors.validation(`Other apps depend on ${appId}: ${(dependents.results ?? []).map((row) => row.app_id).join(", ")}`);
    }

    for (const doctype of manifest.doctypes) {
      const used = await this.db.prepare(
        `SELECT 1 AS found FROM documents WHERE tenant_id=?1 AND doctype=?2 LIMIT 1`,
      ).bind(tenantId, doctype.name).first<{ found: number }>();
      if (used) throw errors.validation(`${doctype.name} still holds documents; uninstalling would orphan them`);
    }

    const statements: D1PreparedStatement[] = [];
    for (const doctype of manifest.doctypes) {
      statements.push(this.db.prepare(`DELETE FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM workflows WHERE tenant_id=?1 AND document_type=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM print_formats WHERE tenant_id=?1 AND doc_type=?2`).bind(tenantId, doctype.name));
      // Customisations of an app's doctype go with it; keeping them would leave
      // overlay rows referring to a definition that no longer exists.
      statements.push(this.db.prepare(`DELETE FROM custom_fields WHERE tenant_id=?1 AND dt=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM property_setters WHERE tenant_id=?1 AND doc_type=?2`).bind(tenantId, doctype.name));
      statements.push(this.db.prepare(`DELETE FROM customization_revisions WHERE tenant_id=?1 AND doctype=?2`).bind(tenantId, doctype.name));
    }
    for (const fixture of manifest.fixtures) {
      statements.push(this.db.prepare(
        `DELETE FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3`,
      ).bind(tenantId, fixture.record_type, fixture.name));
    }
    // Roles are left in place on purpose: users still hold grants for them, and
    // deleting a role would silently strip permissions that other apps may also rely on.
    statements.push(this.db.prepare(`DELETE FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`).bind(tenantId, appId));
    await this.db.batch(statements);

    return {
      app_id: appId,
      removed: {
        doctypes: manifest.doctypes.length,
        workflows: manifest.workflows.length,
        print_formats: manifest.print_formats.length,
        roles: 0,
        fixtures: manifest.fixtures.length,
      },
    };
  }

  private async assertDependencies(tenantId: string, manifest: AppManifest): Promise<void> {
    for (const dependency of manifest.requires) {
      const installed = await this.db.prepare(
        `SELECT version FROM installed_apps WHERE tenant_id=?1 AND app_id=?2`,
      ).bind(tenantId, dependency.id).first<{ version: string }>();
      if (!installed) throw errors.validation(`${manifest.id} requires ${dependency.id} ${dependency.version}, which is not installed`);
      if (!satisfiesVersion(installed.version, dependency.version)) {
        throw errors.validation(`${manifest.id} requires ${dependency.id} ${dependency.version} or later; ${installed.version} is installed`);
      }
    }
  }

  /**
   * Refuses to claim an object another app already owns, or a DocType that exists
   * outside any app.
   *
   * The second case matters most: overwriting a definition the customer built by
   * hand would destroy their work, and the app would then own it, so uninstalling
   * the app would delete it too.
   */
  private async assertNoForeignOwnership(tenantId: string, manifest: AppManifest): Promise<void> {
    for (const [type, scope, name] of this.ownedObjects(manifest)) {
      const owner = await this.db.prepare(
        `SELECT app_id FROM app_objects WHERE tenant_id=?1 AND object_type=?2 AND object_scope=?3 AND object_name=?4`,
      ).bind(tenantId, type, scope, name).first<{ app_id: string }>();
      if (owner && owner.app_id !== manifest.id) {
        throw errors.validation(`${type} ${name} is already owned by app ${owner.app_id}`);
      }
      if (!owner && type === "DocType") {
        const unowned = await this.db.prepare(
          `SELECT 1 AS found FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2`,
        ).bind(tenantId, name).first<{ found: number }>();
        if (unowned) throw errors.validation(`DocType ${name} already exists and is not owned by an app`);
      }
    }
  }

  private ownedObjects(manifest: AppManifest): Array<[ObjectType, string, string]> {
    const owned: Array<[ObjectType, string, string]> = [];
    for (const doctype of manifest.doctypes) owned.push(["DocType", "", doctype.name]);
    for (const workflow of manifest.workflows) owned.push(["Workflow", "", workflow.name]);
    for (const format of manifest.print_formats) owned.push(["Print Format", "", format.name]);
    for (const role of manifest.roles) owned.push(["Role", "", role.role]);
    for (const fixture of manifest.fixtures) owned.push(["Master Record", fixture.record_type, fixture.name]);
    return owned;
  }
}

/** Combined navigation for the client, in install order. */
export function combinedNavigation(apps: InstalledAppRecord[]): JsonObject[] {
  const items: JsonObject[] = [];
  const seen = new Set<string>();
  for (const app of apps) {
    for (const item of app.nav) {
      // Two apps offering the same nav key would give the client two routes that
      // resolve to one path, and only the first would ever be reachable.
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      items.push({ ...item, app_id: app.app_id } as unknown as JsonObject);
    }
  }
  return items;
}
