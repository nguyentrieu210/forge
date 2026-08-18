/** @jsxImportSource react */
import { useMetaForge } from "../container/provider.js";
import { DoctypeWorkspace as CanonicalDoctypeWorkspace, type DoctypeWorkspaceProps } from "./DoctypeWorkspace.js";
import { alumdoorWorkspaceExtension } from "./vertical/alumdoor/workspace-extension.js";

function activeRuntimeApp(contextAppId?: string): string | undefined {
  const explicit = contextAppId?.trim().toLowerCase();
  if (explicit) return explicit;
  if (typeof document === "undefined") return undefined;
  return document.documentElement.dataset.app?.trim().toLowerCase();
}

/**
 * Runtime composition root.
 *
 * The canonical DoctypeWorkspace is vertical-agnostic. This wrapper selects optional product
 * extensions at the edge from the explicit app identity carried by the provider. The DOM
 * app stamp is also accepted as a runtime fallback because the generic Desk writes it from
 * the installed manifest before mounting the workspace. That keeps Alumdoor's TSX workbench
 * connected even when a host mounts MetaForgeProvider without forwarding appId explicitly.
 */
export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const { appId } = useMetaForge();
  const runtimeApp = activeRuntimeApp(appId);
  return <CanonicalDoctypeWorkspace {...props} extension={props.extension ?? (runtimeApp === "alumdoor" ? alumdoorWorkspaceExtension : undefined)} />;
}

export type { DoctypeWorkspaceProps };
