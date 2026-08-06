import type { Doc, DocInfo } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";

type FormulaPolicyContext = Record<string, unknown> & {
  policy_name?: string;
  door_type?: string;
  item_group?: string;
  ray_type?: string | null;
  ray_options?: string[];
  leaf_variant_options?: string[];
};

type InstalledBridge = {
  refs: number;
  restore: () => void;
};

const installed = new WeakMap<FrappeAdapter, InstalledBridge>();

const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();

/**
 * Compatibility bridge for the Alumdoor sales composer.
 *
 * The composer used to read Cutting Policy directly through generic document CRUD. That makes
 * the sales screen depend on the operator's permission to list/read a technical master and is
 * what produced the HTTP 417 blocker. The domain method already owns policy resolution, so this
 * bridge keeps those legacy composer reads inside the domain boundary until the composer source
 * itself is fully migrated.
 *
 * Only Cutting Policy is intercepted. Every other adapter call is delegated unchanged, and the
 * original methods are restored when the sales route unmounts.
 */
export function installAlumdoorSalesPolicyBridge(adapter: FrappeAdapter): () => void {
  const existing = installed.get(adapter);
  if (existing) {
    existing.refs += 1;
    return () => {
      existing.refs -= 1;
      if (existing.refs === 0) {
        existing.restore();
        installed.delete(adapter);
      }
    };
  }

  const originalGetList = adapter.getList.bind(adapter);
  const originalGetDoc = adapter.getDoc.bind(adapter);
  const originalCallPost = adapter.callPost.bind(adapter);
  const policyRows: Doc[] = [];
  const variantsByPolicy = new Map<string, string[]>();

  adapter.getList = async (doctype, opts) => {
    if (doctype !== "Cutting Policy") return originalGetList(doctype, opts);
    return policyRows;
  };

  adapter.getDoc = async (doctype, name) => {
    if (doctype !== "Cutting Policy") return originalGetDoc(doctype, name);
    const variants = variantsByPolicy.get(name);
    if (!variants) return originalGetDoc(doctype, name);
    return {
      doc: {
        doctype: "Cutting Policy",
        name,
        policy_name: name,
        leaf_variants: variants.map((variant_label) => ({ variant_label })),
      } as Doc,
      docinfo: {} as DocInfo,
    };
  };

  adapter.callPost = async function <T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    const result = await originalCallPost<T>(method, args);
    if (method !== "alumdoor.sales.production_line_context" || !result || typeof result !== "object") return result;

    const context = result as FormulaPolicyContext;
    const doorType = text(context.door_type);
    const itemGroup = text(context.item_group);
    const policyName = text(context.policy_name);
    const rays = Array.isArray(context.ray_options)
      ? [...new Set(context.ray_options.map(text).filter(Boolean))]
      : [];
    const variants = Array.isArray(context.leaf_variant_options)
      ? [...new Set(context.leaf_variant_options.map(text).filter(Boolean))]
      : [];

    for (const rayType of rays) {
      if (policyRows.some((row) => text(row.door_type) === doorType && text(row.item_group) === itemGroup && text(row.ray_type) === rayType)) continue;
      policyRows.push({
        doctype: "Cutting Policy",
        name: `${policyName || doorType || "policy"}::${rayType}`,
        policy_name: policyName,
        door_type: doorType,
        item_group: itemGroup,
        ray_type: rayType,
        disabled: 0,
      } as Doc);
    }
    if (policyName) variantsByPolicy.set(policyName, variants);
    return result;
  };

  const bridge: InstalledBridge = {
    refs: 1,
    restore: () => {
      adapter.getList = originalGetList;
      adapter.getDoc = originalGetDoc;
      adapter.callPost = originalCallPost;
    },
  };
  installed.set(adapter, bridge);

  return () => {
    bridge.refs -= 1;
    if (bridge.refs === 0) {
      bridge.restore();
      installed.delete(adapter);
    }
  };
}
