export type CatalogItemKind = "doctype" | "report" | "page" | "dashboard" | "route" | "workspace" | "experience" | "system";
export type CatalogSectionKind = "overview" | "process" | "transactions" | "masters" | "reports" | "tools" | "settings" | "other";

export interface CatalogCapability {
  read?: boolean;
  create?: boolean;
  write?: boolean;
  submit?: boolean;
  manage?: boolean;
}

export interface CatalogItem {
  key: string;
  label: string;
  kind: CatalogItemKind;
  route: string;
  icon?: string;
  description?: string;
  doctype?: string;
  report?: string;
  page?: string;
  badge?: number;
  capabilities?: CatalogCapability;
  disabledReason?: string;
  order?: number;
}

export interface CatalogSection {
  key: string;
  label: string;
  kind: CatalogSectionKind;
  items: CatalogItem[];
  order?: number;
}

export interface CatalogWorkspace {
  key: string;
  label: string;
  icon?: string;
  module?: string;
  route: string;
  public?: boolean;
  sections: CatalogSection[];
  order?: number;
}

export interface CatalogApplication {
  key: string;
  label: string;
  icon?: string;
  module?: string;
  workspaces: CatalogWorkspace[];
  order?: number;
}

export interface ApplicationCatalog {
  apps: CatalogApplication[];
  generatedAt?: string;
}

export function flattenCatalog(catalog: ApplicationCatalog): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const app of catalog.apps) {
    for (const ws of app.workspaces) {
      out.push({ key: `workspace:${ws.key}`, label: ws.label, kind: "workspace", route: ws.route, icon: ws.icon });
      for (const section of ws.sections) out.push(...section.items);
    }
  }
  return out;
}
