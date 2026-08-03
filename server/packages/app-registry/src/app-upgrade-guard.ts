import { errors } from "../../core/src/index.js";
import type { AppManifest } from "./manifest.js";

type MaterializedAppObject = {
  kind: "DocType" | "Workflow" | "Print Format" | "Fixture" | "Custom Field";
  key: string;
};

function materializedObjects(manifest: AppManifest): MaterializedAppObject[] {
  return [
    ...manifest.doctypes.map((item) => ({ kind: "DocType" as const, key: item.name })),
    ...manifest.workflows.map((item) => ({ kind: "Workflow" as const, key: item.name })),
    ...manifest.print_formats.map((item) => ({ kind: "Print Format" as const, key: item.name })),
    ...manifest.fixtures.map((item) => ({ kind: "Fixture" as const, key: `${item.record_type}:${item.name}` })),
    ...manifest.custom_fields.map((item) => ({ kind: "Custom Field" as const, key: `${item.dt}:${item.name}` })),
  ];
}

/**
 * Refuse an app upgrade that silently drops metadata which is materialized outside
 * `installed_apps`.
 *
 * The core installer safely upserts declarations that remain in the package, but it
 * intentionally has no reverse-migration language. Rewriting `app_objects` while a new
 * manifest omits an old DocType/workflow/fixture/custom field would therefore leave a
 * live tenant object whose package no longer owns or describes it. That is worse than a
 * failed upgrade because future uninstall/rollback cannot reason about the orphan.
 *
 * Presentation-only surfaces (nav/reports/charts/client) are not included: they are read
 * from `installed_apps` itself and disappear atomically when that row changes.
 */
export function assertAppUpgradeMaterializationCompatible(current: AppManifest, next: AppManifest): void {
  if (current.id !== next.id) {
    throw errors.validation(`Cannot upgrade ${current.id} with package ${next.id}`);
  }

  const nextObjects = new Set(materializedObjects(next).map((entry) => `${entry.kind}\u0000${entry.key}`));
  const dropped = materializedObjects(current).filter((entry) => !nextObjects.has(`${entry.kind}\u0000${entry.key}`));
  if (!dropped.length) return;

  const evidence = dropped
    .slice(0, 12)
    .map((entry) => `${entry.kind} ${entry.key}`)
    .join(", ");
  const suffix = dropped.length > 12 ? ` (+${dropped.length - 12} more)` : "";
  throw errors.validation(
    `${next.id} upgrade removes materialized app objects: ${evidence}${suffix}. `
      + "An explicit reverse migration or uninstall contract is required before those declarations can be removed.",
  );
}
