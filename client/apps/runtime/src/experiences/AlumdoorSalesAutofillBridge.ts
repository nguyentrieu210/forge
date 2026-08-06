import type { FrappeAdapter } from "@metaforge/adapter-frappe";

type InstalledBridge = { refs: number; restore: () => void };
const installed = new WeakMap<FrappeAdapter, InstalledBridge>();
const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();

/**
 * Compatibility bridge is transport-only. It never chooses a customer group, price list,
 * measurement basis or formula. Those decisions stay in the operator sheet and Alumdoor worker.
 * The only retained behavior is serialization of identical item-context reads so rapid UOM/price
 * refreshes cannot race each other through the Frappe compatibility projection.
 */
export function installAlumdoorSalesAutofillBridge(adapter: FrappeAdapter): () => void {
  const existing = installed.get(adapter);
  if (existing) {
    existing.refs += 1;
    return () => {
      existing.refs -= 1;
      if (existing.refs === 0) { existing.restore(); installed.delete(adapter); }
    };
  }

  const originalCallPost = adapter.callPost.bind(adapter);
  const queues = new Map<string, Promise<unknown>>();

  adapter.callPost = async function <T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    if (method !== "alumdoor.sales.item_context") return originalCallPost<T>(method, args);
    const key = `${text(args?.item_code)}|${text(args?.warehouse)}|${text(args?.price_list)}|${text(args?.uom)}`;
    const previous = queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => originalCallPost<T>(method, args));
    queues.set(key, current as Promise<unknown>);
    try { return await current; }
    finally { if (queues.get(key) === current) queues.delete(key); }
  };

  const bridge: InstalledBridge = {
    refs: 1,
    restore: () => {
      adapter.callPost = originalCallPost;
      queues.clear();
    },
  };
  installed.set(adapter, bridge);
  return () => {
    bridge.refs -= 1;
    if (bridge.refs === 0) { bridge.restore(); installed.delete(adapter); }
  };
}
