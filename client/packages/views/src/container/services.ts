/**
 * adapterServices — map FrappeAdapter → FieldServices (searchLink/uploadFile/getMeta).
 * Global Business Context chỉ thu hẹp theo quan hệ AN TOÀN ở DocType đích; không ép Warehouse
 * hiện tại thành lựa chọn duy nhất vì các chứng từ chuyển kho cần chọn kho đích khác.
 */
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import type { BusinessContextPolicy, BusinessContextSelection } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";

export function adapterServices(
  adapter: FrappeAdapter,
  context: BusinessContextSelection = {},
  policies?: Record<string, BusinessContextPolicy>,
): FieldServices {
  return {
    searchLink: (doctype, txt, opts) => {
      const contextFilters: Record<string, unknown> = {};
      // Chỉ áp các quan hệ phổ quát, không đoán field nghiệp vụ của parent DocType.
      if (context.company && ["Warehouse", "Account", "Cost Center", "Branch", "Project", "Asset", "Employee"].includes(doctype)) {
        contextFilters.company = context.company;
      }
      if (doctype === "Price List") {
        const parentPolicy = opts?.referenceDoctype ? policies?.[opts.referenceDoctype] : undefined;
        const supportsSelling = parentPolicy?.supported.includes("selling_price_list");
        const supportsBuying = parentPolicy?.supported.includes("buying_price_list");
        if (supportsSelling && !supportsBuying) contextFilters.selling = 1;
        if (supportsBuying && !supportsSelling) contextFilters.buying = 1;
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
    resolveDisplay: async (doctype, name) => {
      const [resolved] = await adapter.resolveDisplayValues([{ doctype, name }]);
      return { label: resolved?.label ?? name, description: resolved?.description, image: resolved?.image };
    },
  };
}
