import { errors, type JsonObject, type JsonValue } from "./router-platform.js";
import { toKernelFilters } from "./filters.js";
import type { FrappeArgs } from "./args.js";
import { clampPageLength, dedupe, requireMeta, stripFieldQualifier } from "./router-helpers.js";
import { LINK_DISPLAY_RULES } from "./vertical-display.js";
import type { FrappeRouterContext } from "./router.js";

// Ô chọn link và việc tra nhãn cho link.
//
// Cùng một câu hỏi "hiển thị bản ghi này ra chữ gì" được trả lời ở ba nơi: lúc gợi ý trong ô
// chọn, lúc tra một nhãn, và lúc tra hàng loạt. Để chúng cạnh nhau thì lần sau sửa luật hiển
// thị còn thấy đủ ba; nằm rải trong 4200 dòng thì không.

export async function searchLink(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const doctype = args.requireText("doctype", 160);
  const text = args.text("txt") ?? "";
  if (doctype === "User") {
    const needle = text.trim().toLocaleLowerCase();
    const users = await context.users.list(context.tenantId, 1000);
    return users
      .filter((user) => user.enabled && user.user_type === "System User")
      .filter((user) => !needle || `${user.user_id}\n${user.full_name}\n${user.email}`.toLocaleLowerCase().includes(needle))
      .slice(0, clampPageLength(args.int("page_length", 10)))
      .map((user) => ({
        value: user.user_id,
        label: user.full_name || user.user_id,
        description: user.full_name && user.full_name !== user.user_id ? user.user_id : user.email,
      }));
  }
  const meta = await requireMeta(doctype, context);
  // Item data imported from legacy ERPNext snapshots is not guaranteed to carry
  // `title_field`, while `item_name` is still the canonical human-readable title.
  // Link results must therefore degrade to that real field instead of showing the
  // item code twice in the sales picker.
  const titleField = meta.title_field
    || (doctype === "Item" && meta.fields.some((field) => field.fieldname === "item_name") ? "item_name" : undefined);

  const linkDisplay = LINK_DISPLAY_RULES[doctype];
  const fields = dedupe([
    "name",
    ...(titleField ? [titleField] : []),
    ...(linkDisplay ? linkDisplay.fields : []),
  ]);
  const stringFieldTypes = new Set([
    "Data", "Small Text", "Text", "Long Text", "Code", "Select", "Link", "Dynamic Link",
    "Attach", "Attach Image", "Text Editor", "Markdown Editor", "HTML Editor", "Autocomplete",
    "Read Only", "Barcode", "Icon", "Image", "Signature", "Phone", "Color",
  ]);
  const stringFields = new Set([
    "name", "status", "owner",
    ...meta.fields.filter((field) => stringFieldTypes.has(field.fieldtype)).map((field) => field.fieldname),
  ]);
  const filters = toKernelFilters(args.json("filters"), doctype, { stringFields });
  const rows = await context.listService.list(context.actor, context.tenantId, {
    doctype,
    fields,
    filters: filters as unknown as JsonValue,
    ...(text ? { search: text } : {}),
    limit: clampPageLength(args.int("page_length", 10)),
  });
  return rows.rows.map((row) => {
    const record = row as JsonObject;
    if (linkDisplay) {
      return { value: String(record.name ?? ""), label: linkDisplay.label(record), description: "" };
    }
    const label = titleField && typeof record[titleField] === "string" ? String(record[titleField]) : String(record.name ?? "");
    return { value: String(record.name ?? ""), label, description: label === String(record.name ?? "") ? "" : String(record.name ?? "") };
  });
}

export async function resolveDisplayValues(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const items = args.array<JsonObject>("items") ?? [];
  if (items.length > 200) throw errors.validation("Too many display values requested at once");
  const valid = items
    .map((item) => ({
      doctype: typeof item.doctype === "string" ? item.doctype : "",
      name: typeof item.name === "string" ? item.name : "",
    }))
    .filter((item) => item.doctype && item.name);
  return batchDisplayValues(valid, context);
}

export async function batchDisplayValues(
  items: Array<{ doctype: string; name: string }>,
  context: FrappeRouterContext,
  resolveLinkedTitle = true,
): Promise<JsonObject[]> {
  const labels = new Map(items.map((item) => [`${item.doctype}\u0000${item.name}`, item.name]));
  const grouped = new Map<string, Set<string>>();
  for (const item of items) {
    const names = grouped.get(item.doctype) ?? new Set<string>();
    names.add(item.name);
    grouped.set(item.doctype, names);
  }

  await Promise.all([...grouped].map(async ([doctype, nameSet]) => {
    try {
      const meta = await context.metadata.getDocType(context.tenantId, doctype);
      const displayRule = LINK_DISPLAY_RULES[doctype];
      if (displayRule && meta) {
        const names = [...nameSet];
        for (let index = 0; index < names.length; index += 50) {
          const chunk = names.slice(index, index + 50);
          const page = await context.listService.list(context.actor, context.tenantId, {
            doctype,
            fields: ["name", ...displayRule.fields],
            filters: [{ field: "name", operator: "in", value: chunk }] as unknown as JsonValue,
            limit: chunk.length,
          });
          for (const raw of page.rows) {
            const row = raw as JsonObject;
            const name = typeof row.name === "string" ? row.name : "";
            if (name) labels.set(`${doctype}\u0000${name}`, displayRule.label(row));
          }
        }
        return;
      }
      const titleField = meta?.title_field
        || (doctype === "Item" && meta?.fields.some((field) => field.fieldname === "item_name") ? "item_name" : undefined);
      if (!meta || !titleField) return;

      const firstHop = new Map<string, string>();
      const names = [...nameSet];
      for (let index = 0; index < names.length; index += 50) {
        const chunk = names.slice(index, index + 50);
        const page = await context.listService.list(context.actor, context.tenantId, {
          doctype,
          fields: ["name", titleField],
          filters: [{ field: "name", operator: "in", value: chunk }] as unknown as JsonValue,
          limit: chunk.length,
        });
        for (const raw of page.rows) {
          const row = raw as JsonObject;
          const name = typeof row.name === "string" ? row.name : "";
          const label = typeof row[titleField] === "string" ? String(row[titleField]) : "";
          if (name && label) {
            firstHop.set(name, label);
            labels.set(`${doctype}\u0000${name}`, label);
          }
        }
      }

      const titleMeta = meta.fields.find((field) => field.fieldname === titleField);
      if (!resolveLinkedTitle || titleMeta?.fieldtype !== "Link" || !titleMeta.options) return;
      const referenced = [...new Set(firstHop.values())].map((name) => ({ doctype: titleMeta.options!, name }));
      const resolved = await batchDisplayValues(referenced, context, false);
      const deeper = new Map(resolved.map((item) => [String(item.name), String(item.label)]));
      for (const [name, firstLabel] of firstHop) {
        labels.set(`${doctype}\u0000${name}`, deeper.get(firstLabel) ?? firstLabel);
      }
    } catch {
      // Missing or unreadable references intentionally fall back to their ids.
    }
  }));

  return items.map(({ doctype, name }) => ({
    doctype,
    name,
    label: labels.get(`${doctype}\u0000${name}`) ?? name,
  }));
}
