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
    searchLink: async (doctype, txt, opts) => {
      const contextFilters: Record<string, unknown> = {};
      /**
       * Áp lọc `company` khi DocType đích THỰC SỰ có field đó — hỏi metadata, không đoán
       * theo TÊN.
       *
       * Trước đây đây là một danh sách tên cứng (`Warehouse`, `Branch`, `Employee`…), tức
       * là giả định mọi thứ tên `Branch` đều là Branch của ERPNext. Một app tự khai DocType
       * `Branch` không có `company` — chuyện hoàn toàn bình thường khi app là dữ liệu — sẽ
       * bị client gắn thêm `filters={"company":…}`, server từ chối đúng luật
       * (`Filter field is not allowed: company`), và ô Link đó **không bao giờ trả về kết
       * quả nào**. Hệ quả: mọi form có trường Link bắt buộc đều không lưu nổi, mà thông báo
       * duy nhất người dùng thấy là "Bắt buộc".
       *
       * `getMeta` có cache ở adapter nên chi phí là một lần cho mỗi DocType.
       */
      if (context.company) {
        try {
          const target = await adapter.getMeta(doctype);
          if (target.fields?.some((field) => field.fieldname === "company")) contextFilters.company = context.company;
        } catch {
          // Không đọc được metadata thì KHÔNG lọc: một ô Link trả về rộng hơn cần thiết vẫn
          // dùng được, còn lọc nhầm thì nó rỗng vĩnh viễn.
        }
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
    fetchDocument: async (doctype, name) => (await adapter.getDoc(doctype, name)).doc,
    callPost: <T = unknown>(method: string, args?: Record<string, unknown>) => adapter.callPost<T>(method, args),
    resolveDisplay: async (doctype, name) => {
      const [resolved] = await adapter.resolveDisplayValues([{ doctype, name }]);
      return { label: resolved?.label ?? name, description: resolved?.description, image: resolved?.image };
    },
  };
}
