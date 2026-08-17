/** @jsxImportSource react */
import { useMetaForge } from "../container/provider.js";
import { DoctypeWorkspace as CanonicalDoctypeWorkspace, type DoctypeWorkspaceProps } from "./DoctypeWorkspace.js";
import { alumdoorWorkspaceExtension } from "./vertical/alumdoor/workspace-extension.js";

/**
 * Runtime composition root.
 *
 * The canonical DoctypeWorkspace is vertical-agnostic. This wrapper selects optional product
 * extensions at the edge from the explicit app identity carried by the provider. Keeping the
 * selection here prevents generic List/Form code from learning product-specific branches.
 */
export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const { appId } = useMetaForge();
  return <CanonicalDoctypeWorkspace {...props} extension={props.extension ?? (appId === "alumdoor" ? alumdoorWorkspaceExtension : undefined)} />;
}

export type { DoctypeWorkspaceProps };
