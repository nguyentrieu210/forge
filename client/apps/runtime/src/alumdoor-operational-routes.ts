import type { AppManifest } from "@metaforge/core";

export const ALUMDOOR_OPERATIONAL_ROUTES = [
  {
    doctype: "Purchase Receipt",
    action: "nhap-nhom-fifo",
    legacyActions: ["don-mua-thanh-phieu-nhap"],
  },
  {
    doctype: "Delivery Note",
    action: "giao-nhieu-don-fifo",
    legacyActions: ["don-ban-thanh-phieu-xuat"],
  },
] as const;

export type AlumdoorOperationalRoute = (typeof ALUMDOOR_OPERATIONAL_ROUTES)[number];

function isAlumdoorManifest(manifest: Pick<AppManifest, "id" | "domain">): boolean {
  return manifest.id === "alumdoor" || manifest.domain === "alumdoor";
}

/** The collection route owns the workbench; named documents keep the detail route. */
export function alumdoorOperationalRouteForDoctype(manifest: AppManifest, doctype: string): AlumdoorOperationalRoute | undefined {
  if (!isAlumdoorManifest(manifest)) return undefined;
  const route = ALUMDOOR_OPERATIONAL_ROUTES.find((candidate) => candidate.doctype === doctype);
  return route && (manifest.actions ?? []).some((action) => action.name === route.action) ? route : undefined;
}

/** Old action bookmarks and the canonical action URL resolve to the same workbench. */
export function alumdoorOperationalRouteForAction(manifest: AppManifest, actionName: string): AlumdoorOperationalRoute | undefined {
  if (!isAlumdoorManifest(manifest)) return undefined;
  const route = ALUMDOOR_OPERATIONAL_ROUTES.find((candidate) =>
    candidate.action === actionName || (candidate.legacyActions as readonly string[]).includes(actionName));
  return route && (manifest.actions ?? []).some((action) => action.name === route.action) ? route : undefined;
}
