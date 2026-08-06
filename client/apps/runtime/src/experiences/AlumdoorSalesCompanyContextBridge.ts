import type { Doc, DocInfo } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";

type InstalledBridge = {
  refs: number;
  restore: () => void;
};

const installed = new WeakMap<FrappeAdapter, InstalledBridge>();

/**
 * Sales Sheet V2 predates the server-resolved Business Context currency and still re-reads
 * `Company` through generic document CRUD on mount. On some Alumdoor tenants the Company context
 * is authoritative/valid while that generic read is not materialized, producing a misleading
 * `DoesNotExistError -> Không tìm thấy bản ghi.` before the operator enters anything.
 *
 * Keep the compatibility fix local to Sales Sheet: only the exact context Company is intercepted,
 * only a not-found read may fall back, and only when Business Context already supplied currency.
 * Every other Company/document call delegates unchanged. This does not create or mutate Company.
 */
export function installAlumdoorSalesCompanyContextBridge(
  adapter: FrappeAdapter,
  contextCompany: string,
  contextCurrency: string,
): () => void {
  const company = contextCompany.trim();
  const currency = contextCurrency.trim();
  if (!company || !currency) return () => undefined;

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

  adapter.getDoc = async (doctype, name) => {
    if (doctype !== "Company" || String(name).trim() !== company) {
      return originalGetDoc(doctype, name);
    }

    try {
      return await originalGetDoc(doctype, name);
    } catch (error) {
      if (adapter.mapError(error).kind !== "not_found") throw error;
      return {
        doc: {
          doctype: "Company",
          name: company,
          default_currency: currency,
          currency,
        } as Doc,
        docinfo: {} as DocInfo,
      };
    }
  };

  const bridge: InstalledBridge = {
    refs: 1,
    restore: () => {
      adapter.getDoc = originalGetDoc;
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
