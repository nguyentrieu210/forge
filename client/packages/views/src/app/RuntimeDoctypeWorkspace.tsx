/** @jsxImportSource react */
import { useMetaForge } from "../container/provider.js";
import { DoctypeWorkspace as CanonicalDoctypeWorkspace, type DoctypeWorkspaceProps } from "./DoctypeWorkspace.js";
import { alumdoorWorkspaceExtension } from "./vertical/alumdoor/workspace-extension.js";

function normalizeApp(value?: string | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function activeRuntimeApp(contextAppId?: string): string | undefined {
  const explicit = normalizeApp(contextAppId);
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    const requested = normalizeApp(new URLSearchParams(window.location.search).get("app"));
    if (requested) return requested;
  }

  if (typeof document !== "undefined") {
    const stamped = normalizeApp(document.documentElement.dataset.app);
    if (stamped) return stamped;
  }

  if (typeof localStorage !== "undefined") {
    try {
      const remembered = normalizeApp(localStorage.getItem("metaforge-app"));
      if (remembered) return remembered;
    } catch {
      // Private/locked-down browser storage: app identity simply falls through.
    }
  }
  return undefined;
}

/**
 * Runtime composition root.
 *
 * The canonical DoctypeWorkspace is vertical-agnostic. This wrapper selects optional product
 * extensions at the edge from the installed/requested app identity. Prefer the provider app id;
 * then honor the explicit ?app= query used by the generic runtime; finally fall back to the DOM
 * stamp and remembered manifest id. Alumdoor therefore gets its dedicated TSX workbenches without
 * globally replacing shared DocTypes such as Sales Order for every installed app.
 */
export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const { appId } = useMetaForge();
  const runtimeApp = activeRuntimeApp(appId);
  return <CanonicalDoctypeWorkspace {...props} extension={props.extension ?? (runtimeApp === "alumdoor" ? alumdoorWorkspaceExtension : undefined)} />;
}

export type { DoctypeWorkspaceProps };
