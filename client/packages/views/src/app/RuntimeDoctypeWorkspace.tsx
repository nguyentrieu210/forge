/** @jsxImportSource react */
import { useMetaForge } from "../container/provider.js";
import { DoctypeWorkspace as CanonicalDoctypeWorkspace, type DoctypeWorkspaceProps } from "./DoctypeWorkspace.js";
import { alumdoorWorkspaceExtension } from "./vertical/alumdoor/workspace-extension.js";

/**
 * Runtime composition root.
 *
 * The canonical DoctypeWorkspace is vertical-agnostic. This wrapper selects optional product
 * extensions at the edge of the runtime, where tenant/app identity is already known through the
 * provider. Keeping the selection here prevents the generic List/Form implementation from gaining
 * another business branch every time a specialized workbench is added.
 */
export function DoctypeWorkspace(props: DoctypeWorkspaceProps) {
  const { formProfiles } = useMetaForge();
  const isAlumdoorProfile = Boolean(formProfiles?.["Item Group"]?.keep?.includes("default_measurement_profile"));
  return <CanonicalDoctypeWorkspace {...props} extension={props.extension ?? (isAlumdoorProfile ? alumdoorWorkspaceExtension : undefined)} />;
}

export type { DoctypeWorkspaceProps };
