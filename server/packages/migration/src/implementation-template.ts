import { errors } from "../../core/src/index.js";
import type { ImplementationChecklistItem } from "./implementation.js";

export type ImplementationDomain = "finance" | "stock" | "hr" | "tax";

export interface ImplementationScope {
  domains: ImplementationDomain[];
  data_migration: boolean;
  production: boolean;
}

/**
 * Produces a generic implementation checklist from explicitly enabled domains.
 *
 * It does not guess customer scope. The caller decides whether finance/stock/HR/tax and
 * data migration are in the project; WS13 only derives a consistent dependency graph.
 */
export function buildEnterpriseImplementationChecklist(scope: ImplementationScope): ImplementationChecklistItem[] {
  const domains = [...new Set(scope.domains)];
  for (const domain of domains) {
    if (!["finance", "stock", "hr", "tax"].includes(domain)) throw errors.validation(`Unknown implementation domain: ${String(domain)}`);
  }

  const items: ImplementationChecklistItem[] = [
    item("company-setup", "Company setup completed", "setup"),
  ];
  const setupKeys = ["company-setup"];

  if (domains.includes("finance")) {
    items.push(item("accounting-setup", "Accounting setup completed", "setup", ["company-setup"]));
    setupKeys.push("accounting-setup");
  }
  if (domains.includes("stock")) {
    items.push(item("warehouse-setup", "Warehouse setup completed", "setup", ["company-setup"]));
    setupKeys.push("warehouse-setup");
  }
  if (domains.includes("hr")) {
    items.push(item("hr-setup", "HR setup completed", "setup", ["company-setup"]));
    setupKeys.push("hr-setup");
  }
  if (domains.includes("tax")) {
    const dependencies = domains.includes("finance") ? ["company-setup", "accounting-setup"] : ["company-setup"];
    items.push(item("tax-localization-setup", "Tax and localization setup completed", "setup", dependencies));
    setupKeys.push("tax-localization-setup");
  }

  let dataReadyDependencies = [...setupKeys];
  if (scope.data_migration) {
    items.push(item("master-data-migration", "Master data migration completed", "master_data", setupKeys));
    dataReadyDependencies = ["master-data-migration"];
    if (domains.includes("finance") || domains.includes("stock")) {
      items.push(item("opening-data-migration", "Opening data migration completed", "opening_data", ["master-data-migration"]));
      dataReadyDependencies = ["opening-data-migration"];
    }
    items.push(item("post-migration-reconciliation", "Post-migration reconciliation passed", "reconciliation", dataReadyDependencies));
    dataReadyDependencies = ["post-migration-reconciliation"];
  }

  items.push(item("key-user-training", "Key-user training completed", "training", setupKeys));
  const goLiveDependencies = [...new Set([...dataReadyDependencies, "key-user-training"])];
  if (scope.production) {
    items.push(item("production-safety-preflight", "Production backup and rollback preflight passed", "go_live", goLiveDependencies));
    goLiveDependencies.splice(0, goLiveDependencies.length, "production-safety-preflight");
  }
  items.push(item("go-live-approval", "Go-live approval recorded", "go_live", goLiveDependencies));
  return items;
}

function item(
  key: string,
  label: string,
  stage: ImplementationChecklistItem["stage"],
  dependsOn: string[] = [],
): ImplementationChecklistItem {
  return {
    key,
    label,
    stage,
    required: true,
    status: "pending",
    ...(dependsOn.length ? { depends_on: [...new Set(dependsOn)] } : {}),
  };
}
