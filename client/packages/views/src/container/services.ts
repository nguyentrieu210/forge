/**
 * adapterServices — map FrappeAdapter → FieldServices (searchLink/uploadFile/getMeta).
 * Global Business Context chỉ thu hẹp theo quan hệ AN TOÀN ở DocType đích; không ép Warehouse
 * hiện tại thành lựa chọn duy nhất vì các chứng từ chuyển kho cần chọn kho đích khác.
 */
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { deriveContextLinkCapabilityFilters, type BusinessContextPolicy, type BusinessContextSelection } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";

export function adapterServices(
  adapter: FrappeAdapter,
  context: BusinessContextSelection = {},
  policies?: Record<string, BusinessContextPolicy>,
): FieldServices {
  return {
    searchLink: async (doctype, txt, opts) => {
      const contextFilters: Record<string, unknown> = {};
      const parentPolicy = opts?.referenceDoctype ? policies?.[opts.referenceDoctype] : undefined;
      /**
       * Ask target metadata once, then derive only capabilities the target actually exposes.
       * This prevents schema-name guesses (`Warehouse`, `Price List`, ...) in a generic service.
       */
      if (context.company || parentPolicy) {
        try {
          const target = await adapter.getMeta(doctype);
          if (context.company && target.fields?.some((field) => field.fieldname === "company")) {
            contextFilters.company = context.company;
          }
          Object.assign(contextFilters, deriveContextLinkCapabilityFilters(parentPolicy, target));
        } catch {
          // Metadata unavailable => fail open on filtering, never make a required Link permanently empty.
        }
      }
      const existing = opts?.filters;
      const filters = existing && !Array.isArray(existing)
        ? { ...contextFilters, ...existing }
        : (Object.keys(contextFilters).length ? contextFilters : existing);
      return adapter.searchLink(doctype, txt, { ...opts, filters });
    },
    uploadFile: (file, opts) => adapter.uploadFile(file, { isPrivate: opts.isPrivate, doctype: opts.doctype, docname: opts.docname, fieldname: opts.fieldname }),
    getMeta: (doctype) => adapter.getMeta(doctype),
    fetchValue: (doctype, name, field) => adapter.getValue(doctype, { name }, field),
    fetchDocument: async (doctype, name) => (await adapter.getDoc(doctype, name)).doc,
    callPost: <T = unknown>(method: string, args?: Record<string, unknown>) => adapter.callPost<T>(method, args),
    resolveDisplay: async (doctype, name) => {
      const [resolved] = await adapter.resolveDisplayValues([{ doctype, name }]);
      return { label: resolved?.label ?? name, description: resolved?.description, image: resolved?.image };
    },
  };
}
