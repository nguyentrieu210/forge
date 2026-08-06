import type { DocTypeMeta, ListOpts } from "@metaforge/core";
import { deriveStandardFilters } from "./filters.js";

/**
 * Một standard Link filter trỏ tới DocType cây không có nghĩa là `field = node` khi node là NHÓM.
 * Người dùng chọn một nhóm cha (vd Item Group / Department / Warehouse group) mong thấy mọi bản ghi
 * thuộc node đó HOẶC bất kỳ node con nào. Frappe có operator `descendants of`, nhưng CloudForge
 * cố ý chưa hỗ trợ operator này ở list kernel; vì vậy runtime mở rộng cây bằng API tree chuẩn rồi
 * gửi một filter `in` hoàn toàn server-authoritative.
 */
export interface TreeLinkFilterSpec {
  fieldname: string;
  targetDoctype: string;
  selected: string;
}

export interface ExpandedTreeLinkFilter {
  selected: string;
  values: string[];
}

export type ExpandedTreeLinkFilters = Record<string, ExpandedTreeLinkFilter>;

export interface TreeLinkFilterSource {
  getMeta(doctype: string): Promise<DocTypeMeta>;
  getChildren(doctype: string, parent: string): Promise<Array<{ value: string; expandable?: boolean }>>;
}

export function activeTreeLinkCandidates(meta: DocTypeMeta, filters: Record<string, string>): TreeLinkFilterSpec[] {
  return deriveStandardFilters(meta).flatMap((filter) => {
    const selected = filters[filter.fieldname];
    if (filter.fieldtype !== "Link" || !filter.linkDoctype || !selected) return [];
    return [{ fieldname: filter.fieldname, targetDoctype: filter.linkDoctype, selected }];
  });
}

/**
 * Resolve chỉ những Link thực sự trỏ tới Tree DocType. Link thường giữ nguyên `=`.
 *
 * `getMeta` lỗi thì giữ semantics cũ thay vì khóa toàn bộ danh sách: chưa chứng minh được target là
 * cây thì không được tự đổi query. Khi đã biết là cây, lỗi nạp children được đẩy lên UI — trả một
 * tập hậu duệ thiếu còn nguy hiểm hơn báo lỗi vì người dùng sẽ tin nhầm vào danh sách không đủ.
 */
export async function resolveTreeLinkFilters(
  specs: TreeLinkFilterSpec[],
  source: TreeLinkFilterSource,
  nodeLimit = 5_000,
): Promise<ExpandedTreeLinkFilters> {
  const resolved: ExpandedTreeLinkFilters = {};
  const expansionCache = new Map<string, Promise<string[]>>();

  for (const spec of specs) {
    let targetMeta: DocTypeMeta;
    try {
      targetMeta = await source.getMeta(spec.targetDoctype);
    } catch {
      continue;
    }
    if (targetMeta.is_tree !== 1 && targetMeta.kind !== "tree") continue;

    const cacheKey = `${spec.targetDoctype}\u0000${spec.selected}`;
    let expansion = expansionCache.get(cacheKey);
    if (!expansion) {
      expansion = expandTreeSelection(spec.targetDoctype, spec.selected, source, nodeLimit);
      expansionCache.set(cacheKey, expansion);
    }
    resolved[spec.fieldname] = { selected: spec.selected, values: await expansion };
  }

  return resolved;
}

async function expandTreeSelection(
  doctype: string,
  selected: string,
  source: TreeLinkFilterSource,
  nodeLimit: number,
): Promise<string[]> {
  const values = new Set<string>([selected]);
  const queue = [selected];

  while (queue.length) {
    const parent = queue.shift()!;
    const children = await source.getChildren(doctype, parent);
    for (const child of children) {
      const value = String(child.value ?? "").trim();
      if (!value || values.has(value)) continue;
      values.add(value);
      if (values.size > nodeLimit) {
        throw new Error(`Bộ lọc cây ${doctype} vượt quá ${nodeLimit} node; hãy chọn một nhóm hẹp hơn.`);
      }
      if (child.expandable) queue.push(value);
    }
  }

  return [...values];
}

/**
 * Chỉ thay đúng equality filter do toolbar sinh ra cho giá trị đang chọn. Nếu cùng field còn có
 * route/KPI filter khác, điều kiện đó phải được giữ nguyên — không được vô tình nới scope KPI.
 */
export function applyTreeLinkExpansions(opts: ListOpts, expanded: ExpandedTreeLinkFilters): ListOpts {
  if (!Array.isArray(opts.filters) || !Object.keys(expanded).length) return opts;

  let changed = false;
  const filters = opts.filters.map((filter) => {
    const [field, operator, value] = filter;
    const expansion = expanded[field];
    if (!expansion || operator !== "=" || String(value ?? "") !== expansion.selected || !expansion.values.length) return filter;
    changed = true;
    return [field, "in", expansion.values] as [string, "in", string[]];
  });

  return changed ? { ...opts, filters } : opts;
}
