import type { Doc, DocInfo } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";

type FormulaPolicyContext = Record<string, unknown> & {
  policy_name?: string;
  door_type?: string;
  item_group?: string;
  ray_type?: string | null;
  ray_options?: string[];
  leaf_variant_options?: string[];
  default_discount_pct?: number;
};

type InstalledBridge = {
  refs: number;
  restore: () => void;
};

type CalculationMode = "QUANTITY" | "HEIGHT" | "WIDTH" | "AREA";

export const ALUMDOOR_SALES_CUSTOMER_EVENT = "alumdoor:sales-customer-context";

const installed = new WeakMap<FrappeAdapter, InstalledBridge>();
const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();
const key = (value: unknown) => text(value).toLocaleLowerCase("vi");
const number = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Exact display rule imported from the former sales sheet.
 * Prefix is authoritative for ray/shaft; door metadata is authoritative for area goods.
 * Everything else stays quantity-based rather than guessing from a broad Item Group name.
 */
function calculationMode(context: Record<string, unknown>): { mode: CalculationMode; error: string | null } {
  const code = text(context.item_code).toLocaleUpperCase("vi");
  if (text(context.inventory_mode) === "Thành phẩm theo m2" || text(context.door_type)) return { mode: "AREA", error: null };
  if (code.startsWith("TRUC-")) return { mode: "WIDTH", error: null };
  if (code.startsWith("RAY-")) return { mode: "HEIGHT", error: null };
  const group = key(context.item_group);
  const hasRay = group.includes("ray");
  const hasShaft = group.includes("trục") || group.includes("truc");
  if (hasShaft && !hasRay) return { mode: "WIDTH", error: null };
  if (hasRay && !hasShaft) return { mode: "HEIGHT", error: null };
  if (hasRay && hasShaft) return {
    mode: "QUANTITY",
    error: `${code || "Mặt hàng"}: nhóm có cả Ray và Trục nhưng mã chưa theo chuẩn RAY-/TRUC-; hệ thống không tự đoán công thức.`,
  };
  return { mode: "QUANTITY", error: null };
}

/**
 * Compatibility bridge for the Alumdoor sales Experience.
 *
 * It never invents a price list or a price. `alumdoor.sales.item_context` remains the price/stock
 * authority. This bridge only adapts its current response to the richer spreadsheet vocabulary:
 * calculation mode, billable preview and the domain-provided door discount/basis. Final document
 * totals are still recalculated by the selling controller on save/submit.
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
    if (doctype === "Cutting Policy") {
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
    }

    const result = await originalGetDoc(doctype, name);
    if (doctype === "Customer" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ALUMDOOR_SALES_CUSTOMER_EVENT, {
        detail: { name, doc: result.doc },
      }));
    }
    return result;
  };

  adapter.callPost = async function <T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    const result = await originalCallPost<T>(method, args);
    if (!result || typeof result !== "object") return result;

    if (method === "alumdoor.sales.production_line_context") {
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
    }

    if (method !== "alumdoor.sales.item_context") return result;

    const context = result as Record<string, unknown>;
    const modeResolution = calculationMode({ ...context, item_code: args?.item_code });
    const quantity = number(args?.quantity ?? args?.qty ?? args?.set_count);
    const height = number(args?.height_m);
    const width = number(args?.width_m);
    const area = number(args?.billable_area_sqm);
    const billableQty = quantity == null ? null
      : modeResolution.mode === "HEIGHT" ? (height == null ? null : height * quantity)
      : modeResolution.mode === "WIDTH" ? (width == null ? null : width * quantity)
      : modeResolution.mode === "AREA" ? area
      : quantity;

    let domainDiscount: number | null = null;
    const explicitDiscount = args?.discount_percentage == null || args.discount_percentage === ""
      ? null : Number(args.discount_percentage);
    if (Number.isFinite(explicitDiscount) && explicitDiscount! >= 0 && explicitDiscount! <= 100) {
      domainDiscount = explicitDiscount;
    } else if (modeResolution.mode === "AREA" && text(args?.customer_group)) {
      try {
        const basis = await originalCallPost<FormulaPolicyContext>("alumdoor.sales.production_line_context", {
          item_code: args?.item_code,
          customer_group: args?.customer_group,
          sales_mode: "Trọn bộ",
          basis_only: true,
        });
        const resolved = Number(basis?.default_discount_pct);
        if (Number.isFinite(resolved) && resolved >= 0 && resolved <= 100) domainDiscount = resolved;
      } catch {
        // A missing formula policy is surfaced by the normal production-line call once dimensions
        // are entered. Never replace that failure with a client-side guess.
      }
    }

    const rate = Number(context.rate);
    const grossAmount = Number.isFinite(rate) && rate >= 0 && billableQty != null
      ? roundMoney(rate * billableQty)
      : null;
    const discountAmount = grossAmount != null && domainDiscount != null
      ? roundMoney(grossAmount * domainDiscount / 100)
      : null;
    const netAmount = grossAmount == null ? null : roundMoney(grossAmount - (discountAmount ?? 0));

    return {
      ...context,
      item_name: text(context.item_name) || text(args?.item_code),
      calculation_mode: modeResolution.mode,
      calculation_error: modeResolution.error,
      require_color: Boolean(context.default_color),
      customer_group: text(args?.customer_group) || null,
      price_list: text(args?.price_list) || null,
      discount_percentage: domainDiscount,
      billable_qty: billableQty,
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      net_amount: netAmount,
    } as T;
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
