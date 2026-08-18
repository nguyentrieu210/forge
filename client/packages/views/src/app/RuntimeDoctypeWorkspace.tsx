/** @jsxImportSource react */
import { useMetaForge } from "../container/provider.js";
import { DoctypeWorkspace as CanonicalDoctypeWorkspace, type DoctypeWorkspaceProps } from "./DoctypeWorkspace.js";
import { alumdoorWorkspaceExtension } from "./vertical/alumdoor/workspace-extension.js";

function activeRuntimeApp(contextAppId?: string): string | undefined {
  const explicit = contextAppId?.trim().toLowerCase();
  if (explicit) return explicit;
  if (typeof document !== "undefined") {
    const stamped = document.documentElement.dataset.app?.trim().toLowerCase();
    if (stamped) return stamped;
  }
  if (typeof localStorage !== "undefined") {
    try {
      const remembered = localStorage.getItem("metaforge-app")?.trim().toLowerCase();
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
 * extensions at the edge from the explicit app identity carried by the provider. The DOM
 * app stamp is accepted as the primary runtime fallback and the remembered manifest id is a
 * final fallback for service/Vite restarts where the provider can mount before the stamp is
 * visible. This keeps Alumdoor's TSX workbench connected without enabling it for other apps.
 */
export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const { appId } = useMetaForge();
  const runtimeApp = activeRuntimeApp(appId);
  return <CanonicalDoctypeWorkspace {...props} extension={props.extension ?? (runtimeApp === "alumdoor" ? alumdoorWorkspaceExtension : undefined)} />;
}

export type { DoctypeWorkspaceProps };
