import type { Doc } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";

type InstalledBridge = { refs: number; restore: () => void };
const installed = new WeakMap<FrappeAdapter, InstalledBridge>();
const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();

/**
 * Alumdoor Sales compatibility is deliberately transport-only.
 * Pricing, customer type and measurement rules stay in the Sales Sheet / worker authorities.
 * This bridge serializes racing item-context reads and adapts compact operator calls to the
 * canonical Frappe adapter / reservation endpoints.
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
  const reservationCursor = new Map<string, number>();

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
      const sourceName = text(args?.sales_order);
      let cutWidth = Number(args?.required_length_m ?? 0);
      let expiresAt: string | undefined;
      if (sourceName) {
        try {
          const { doc } = await originalGetDoc("Sales Order", sourceName);
          const candidates = Array.isArray(doc.items)
            ? (doc.items as Array<Record<string, unknown>>).filter((item) => Number(item.cut_width_m ?? 0) > 0)
            : [];
          const cursor = reservationCursor.get(sourceName) ?? 0;
          const snapshot = candidates[cursor];
          reservationCursor.set(sourceName, cursor + 1);
          if (snapshot && Number(snapshot.cut_width_m) > 0) cutWidth = Number(snapshot.cut_width_m);
          const deliveryDate = text(doc.delivery_date);
          if (deliveryDate) expiresAt = new Date(`${deliveryDate}T23:59:59.999`).toISOString();
        } catch { /* fallback keeps the caller value if draft read fails */ }
      }
      return originalCallPost<T>("alumdoor.reserve.create", {
        item_code: text(args?.item_code),
        warehouse: text(args?.warehouse),
        ...(text(args?.color) ? { color: text(args?.color) } : {}),
        min_length_m: cutWidth,
        qty_reserved: Number(args?.quantity ?? 0),
        source_doctype: "Sales Order",
        source_name: sourceName,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
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
      reservationCursor.clear();
    },
  };
  installed.set(adapter, bridge);
  return () => {
    bridge.refs -= 1;
    if (bridge.refs === 0) { bridge.restore(); installed.delete(adapter); }
  };
}
