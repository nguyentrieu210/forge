import type { AppDesign } from "@metaforge/core";

const ATTRIBUTES = {
  density: "data-density",
  radius: "data-radius",
  content_width: "data-content-width",
} as const;

/**
 * Applies the installable design contract to the document root.
 *
 * Missing values remove their attribute so moving between apps in the same browser
 * cannot leak one app's density or radius into the next one.
 */
export function applyDesign(design?: AppDesign): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, attribute] of Object.entries(ATTRIBUTES) as Array<[keyof AppDesign, string]>) {
    const value = design?.[key];
    if (value) root.setAttribute(attribute, value);
    else root.removeAttribute(attribute);
  }
}
