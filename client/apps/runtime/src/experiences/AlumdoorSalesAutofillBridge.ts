import type { Doc } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";

type InstalledBridge = { refs: number; restore: () => void };
const installed = new WeakMap<FrappeAdapter, InstalledBridge>();
const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();

/**
 * Alumdoor Sales compatibility is deliberately transport-only.
 * Pricing, customer type and measurement rules stay in the Sales Sheet / worker authorities.
 * This bridge only serializes racing item-context reads and adapts the sheet's compact calls to
 * the canonical adapter / reservation endpoints.
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

  const originalGetDoc = adapter.getDoc.bind(adapter);
  const originalUpdateDoc = adapter.updateDoc.bind(adapter);
  const originalSubmit = adapter.submit.bind(adapter);
  const originalCallPost = adapter.callPost.bind(adapter);
  const itemContextQueues = new Map<string, Promise<unknown>>();

  const mutable = adapter as FrappeAdapter & {
    updateDoc: (dt: string, name: string, doc: Partial<Doc>, modified?: string) => Promise<Doc>;
    submit: (docOrDoctype: Doc | string, name?: string) => Promise<Doc>;
  };

  mutable.updateDoc = async (dt, name, doc, modified) => {
    if (modified) return originalUpdateDoc(dt, name, doc, modified);
    const current = await originalGetDoc(dt, name);
    return originalUpdateDoc(dt, name, doc, String(current.doc.modified ?? ""));
  };

  mutable.submit = async (docOrDoctype, name) => {
    if (typeof docOrDoctype !== "string") return originalSubmit(docOrDoctype);
    if (!name) throw new Error("Cần tên chứng từ để xác nhận.");
    const current = await originalGetDoc(docOrDoctype, name);
    return originalSubmit(current.doc);
  };

  adapter.callPost = async function <T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    if (method === "alumdoor.cut.reserve") {
      return originalCallPost<T>("alumdoor.reserve.create", {
        item_code: text(args?.item_code),
        warehouse: text(args?.warehouse),
        ...(text(args?.color) ? { color: text(args?.color) } : {}),
        min_length_m: Number(args?.required_length_m ?? 0),
        qty_reserved: Number(args?.quantity ?? 0),
        source_doctype: "Sales Order",
        source_name: text(args?.sales_order),
      });
    }
    if (method === "alumdoor.cut.release") {
      return originalCallPost<T>("alumdoor.reserve.release", {
        reservation: text(args?.reservation),
        released_reason: "Hoàn tác tự động vì xác nhận Sales Order không hoàn tất.",
      });
    }
    if (method !== "alumdoor.sales.item_context") return originalCallPost<T>(method, args);

    const key = `${text(args?.item_code)}|${text(args?.warehouse)}|${text(args?.price_list)}|${text(args?.uom)}`;
    const previous = itemContextQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => originalCallPost<T>(method, args));
    itemContextQueues.set(key, current as Promise<unknown>);
    try { return await current; }
    finally { if (itemContextQueues.get(key) === current) itemContextQueues.delete(key); }
  };

  const bridge: InstalledBridge = {
    refs: 1,
    restore: () => {
      mutable.updateDoc = originalUpdateDoc as typeof mutable.updateDoc;
      mutable.submit = originalSubmit as typeof mutable.submit;
      adapter.callPost = originalCallPost;
    },
  };
  installed.set(adapter, bridge);
  return () => {
    bridge.refs -= 1;
    if (bridge.refs === 0) { bridge.restore(); installed.delete(adapter); }
  };
}
