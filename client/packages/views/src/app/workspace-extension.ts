import type { ReactNode } from "react";
import type { UrlStateBridge } from "../list/useListState.js";

/**
 * Extension point for business workbenches that intentionally replace the canonical CRUD surface.
 *
 * Generic CRUD remains the default. An extension may replace create/detail only when the interaction
 * model is materially different (for example a lifecycle workbench). Keeping this contract in the
 * generic app layer prevents DoctypeWorkspace from accumulating vertical `if (doctype === ...)`
 * branches while still preserving the specialized screens that cannot be represented by FormView.
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
  /** Specialized detail/workbench. Undefined keeps the canonical FormContainer. */
  detail?: ReactNode;
  /** Specialized create workbench. Undefined keeps the canonical NewFormContainer. */
  create?: ReactNode;
  /** Detail may exist without a route name, e.g. Stock Entry opened from Work Order context. */
  hasDetail?: boolean;
  contextTitle?: string;
  onCloseDetail?: () => void;
  /** A specialized workbench owns the surface while active; hide the generic Bulk switcher. */
  suppressBulk?: boolean;
  /** Force the create dialog size when the extension supplies create content. */
  createSurface?: "quick" | "full";
  /** data-surface marker for diagnostics/visual regression tests. */
  createDataSurface?: string;
}

export interface DoctypeWorkspaceExtension {
  id: string;
  resolve(context: DoctypeWorkspaceExtensionContext): DoctypeWorkspaceExtensionResolution | undefined;
}
