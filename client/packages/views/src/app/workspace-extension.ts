import type { ReactNode } from "react";
import type { ListRuntimeAction } from "../list/runtime-actions.js";
import type { UrlStateBridge } from "../list/useListState.js";

/**
 * Extension point for business workbenches that intentionally replace the canonical CRUD surface.
 * Generic CRUD remains the default; vertical behavior is registered at the composition edge.
 */
export interface DoctypeWorkspaceExtensionContext {
  doctype: string;
  isNew: boolean;
  decoded?: string;
  bridge: UrlStateBridge;
  base: string;
  printBase: string;
  listPath: string;
  closeRequest: number;
  onNavigate: (path: string) => void;
}

export interface DoctypeWorkspaceExtensionResolution {
  detail?: ReactNode;
  create?: ReactNode;
  hasDetail?: boolean;
  contextTitle?: string;
  onCloseDetail?: () => void;
  suppressBulk?: boolean;
  createSurface?: "quick" | "full";
  createDataSurface?: string;
  /** Business-specific actions injected into the canonical list selection runtime. */
  listActions?: ListRuntimeAction[];
}

export interface DoctypeWorkspaceExtension {
  id: string;
  resolve(context: DoctypeWorkspaceExtensionContext): DoctypeWorkspaceExtensionResolution | undefined;
}
