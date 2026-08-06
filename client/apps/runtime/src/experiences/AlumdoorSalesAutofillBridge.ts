import type { Doc, DocInfo } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";

type InstalledBridge = {
  refs: number;
  restore: () => void;
};

type PriceListRow = Doc & {
  price_list_name?: unknown;
  disabled?: unknown;
};

const installed = new WeakMap<FrappeAdapter, InstalledBridge>();

const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();
const normalized = (value: unknown) => text(value).toLocaleLowerCase("vi");
const disabled = (value: unknown) => value === true || value === 1 || value === "1"
  || ["true", "yes", "có", "co"].includes(normalized(value));

function canonicalCustomerGroup(value: unknown): "Đại lý" | "Lẻ" | "" {
  const valueNormalized = normalized(value);
  if (!valueNormalized) return "";
  if (valueNormalized.includes("đại lý") || valueNormalized.includes("dai ly") || valueNormalized.includes("dealer")) return "Đại lý";
  if (
    valueNormalized === "lẻ"
    || valueNormalized.includes("khách lẻ")
    || valueNormalized.includes("khach le")
    || valueNormalized.includes("bán lẻ")
    || valueNormalized.includes("ban le")
    || valueNormalized.includes("retail")
    || valueNormalized.includes("công trình")
    || valueNormalized.includes("cong trinh")
    || valueNormalized.includes("nhà thầu")
    || valueNormalized.includes("nha thau")
  ) return "Lẻ";
  return "";
}

function rowIdentity(row: PriceListRow): string {
  return text(row.name ?? row.price_list_name);
}

function rowSearchText(row: PriceListRow): string {
  return normalized(`${text(row.name)} ${text(row.price_list_name)}`);
}

function findExact(rows: PriceListRow[], candidate: unknown): PriceListRow | undefined {
  const wanted = normalized(candidate);
  if (!wanted) return undefined;
  return rows.find((row) => normalized(row.name) === wanted || normalized(row.price_list_name) === wanted);
}

function resolveApplicablePriceList(rows: PriceListRow[], preferred: unknown, customerGroup: unknown): string {
  const active = rows.filter((row) => !disabled(row.disabled));
  const preferredRow = findExact(active, preferred);
  if (preferredRow) return rowIdentity(preferredRow);

  const group = canonicalCustomerGroup(customerGroup);
  const groupRow = group === "Đại lý"
    ? active.find((row) => {
      const haystack = rowSearchText(row);
      return haystack.includes("đại lý") || haystack.includes("dai ly") || haystack.includes("dealer");
    })
    : group === "Lẻ"
      ? active.find((row) => {
        const haystack = rowSearchText(row);
        return haystack.includes("bán lẻ") || haystack.includes("ban le") || haystack.includes("retail") || haystack.includes("khách lẻ") || haystack.includes("khach le");
      })
      : undefined;
  if (groupRow) return rowIdentity(groupRow);

  const standard = active.find((row) => {
    const haystack = rowSearchText(row);
    return haystack.includes("giá niêm yết") || haystack.includes("gia niem yet") || haystack.includes("standard selling");
  });
  if (standard) return rowIdentity(standard);

  return active.length === 1 ? rowIdentity(active[0]!) : "";
}

/**
 * Compatibility bridge for Sales Sheet V2 automatic context hydration.
 *
 * The sheet currently resolves Customer -> Price List with repeated generic CRUD reads and can
 * launch overlapping `alumdoor.sales.item_context` requests while customer/currency/warehouse
 * context is still settling. That creates two operator-visible failures: an active price list can
 * be missed because a second single-record read is unavailable, and an older `rate=null` response
 * can arrive after a newer priced response and overwrite it.
 *
 * This bridge does not calculate or invent a price. It only:
 * - projects an already-active Price List row as a generic Price List document when the row is
 *   visible through the caller's normal list permission;
 * - supplements a Customer that has no explicit price list with an active list resolved from the
 *   same existing naming convention (preferred -> customer-group list -> standard -> sole list);
 * - serializes read-only item-context requests per item/warehouse so the newest request finishes
 *   last and therefore wins in the legacy component state.
 *
 * Authoritative Item Price / Pricing Rule validation remains in the server pricing path.
 */
export function installAlumdoorSalesAutofillBridge(adapter: FrappeAdapter): () => void {
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

  const originalGetDoc = adapter.getDoc.bind(adapter);
  const originalGetList = adapter.getList.bind(adapter);
  const originalCallPost = adapter.callPost.bind(adapter);
  let activePriceLists: Promise<PriceListRow[]> | null = null;
  const itemContextQueues = new Map<string, Promise<unknown>>();

  const loadActivePriceLists = () => {
    if (!activePriceLists) {
      activePriceLists = originalGetList("Price List", {
        fields: ["name", "price_list_name", "disabled"],
        filters: [["disabled", "=", 0]],
        orderBy: "name asc",
        pageLength: 200,
      }).then((rows) => rows as PriceListRow[]).catch(() => [] as PriceListRow[]);
    }
    return activePriceLists;
  };

  adapter.getDoc = async (doctype, name) => {
    if (doctype === "Price List") {
      try {
        return await originalGetDoc(doctype, name);
      } catch (error) {
        if (adapter.mapError(error).kind !== "not_found") throw error;
        const rows = await loadActivePriceLists();
        const row = findExact(rows, name);
        if (!row || disabled(row.disabled)) throw error;
        const canonicalName = rowIdentity(row) || text(name);
        return {
          doc: {
            ...row,
            doctype: "Price List",
            name: canonicalName,
            disabled: 0,
          } as Doc,
          docinfo: {} as DocInfo,
        };
      }
    }

    const result = await originalGetDoc(doctype, name);
    if (doctype !== "Customer") return result;

    const doc = result.doc as Doc & Record<string, unknown>;
    const preferred = text(doc.default_price_list ?? doc.selling_price_list ?? doc.price_list);
    if (preferred) return result;

    const rows = await loadActivePriceLists();
    const selected = resolveApplicablePriceList(rows, "", doc.price_group ?? doc.customer_group);
    if (!selected) return result;
    return {
      ...result,
      doc: {
        ...doc,
        default_price_list: selected,
      } as Doc,
    };
  };

  adapter.callPost = async function <T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    if (method !== "alumdoor.sales.item_context") return originalCallPost<T>(method, args);

    const key = `${text(args?.item_code)}|${text(args?.warehouse)}`;
    const previous = itemContextQueues.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => originalCallPost<T>(method, args));
    itemContextQueues.set(key, current as Promise<unknown>);
    try {
      return await current;
    } finally {
      if (itemContextQueues.get(key) === current) itemContextQueues.delete(key);
    }
  };

  const bridge: InstalledBridge = {
    refs: 1,
    restore: () => {
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
