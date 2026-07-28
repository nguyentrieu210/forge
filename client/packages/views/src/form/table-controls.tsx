import { linkDisplay } from "@metaforge/core";
/** @jsxImportSource react */
/**
 * Table / Table MultiSelect controls — sống ở @metaforge/views (tránh cycle controls→views).
 * Đăng ký qua registerTableControls(registry). Cần services.getMeta để nạp child DocType meta.
 */
import { type ChangeEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import type { DocTypeMeta, Doc } from "@metaforge/core";
import { ControlRegistry, type FieldControlProps } from "@metaforge/controls";
import { Badge, Button, Input, useT } from "@metaforge/ui";
import { ChildGrid } from "./ChildGrid.js";
import { useMetaForgeOptional } from "../container/provider.js";

interface WithRegistry {
  registry: ControlRegistry;
}

function useChildMeta(doctype: string | undefined, services: FieldControlProps["services"]) {
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  useEffect(() => {
    let alive = true;
    if (!doctype || !services?.getMeta) return;
    void services.getMeta(doctype).then((m) => alive && setMeta(m as DocTypeMeta));
    return () => {
      alive = false;
    };
  }, [doctype, services]);
  return meta;
}

/** Table — bảng con (ChildGrid). */
function TableField(p: FieldControlProps & WithRegistry) {
  const t = useT();
  const childMeta = useChildMeta(p.field.options, p.services);
  const rows = Array.isArray(p.value) ? (p.value as Doc[]) : [];
  /**
   * Bối cảnh đang chọn (vd KHO hiện tại) chảy xuống dòng mới của bảng con.
   *
   * `blankDoc` chỉ gieo bối cảnh cho chứng từ CHA. Nhưng ở phân hệ mua, kho nằm trên TỪNG
   * DÒNG — nên thủ kho đang đứng ở "Kho mua" vẫn phải chọn lại đúng cái kho đó cho từng
   * dòng, mỗi lần lập phiếu. `useMetaForgeOptional` để control vẫn dựng được ngoài provider
   * (test, storybook) thay vì ném lỗi.
   */
  const rowDefaults = useMetaForgeOptional()?.businessContext;
  if (p.masked) return <span className="mf-masked">••••••</span>;
  if (!childMeta) return <div className="mf-grid-loading">{t("grid.loading_table_prefix")} {p.field.options}…</div>;
  return (
    <ChildGrid
      childMeta={childMeta}
      rows={rows}
      onChange={(r) => p.onChange(r)}
      registry={p.registry}
      services={p.services}
      readOnly={p.readOnly}
      parentDoc={p.docValues}
      roles={p.roles}
      {...(rowDefaults ? { rowDefaults } : {})}
    />
  );
}

/** Table MultiSelect — chip các Link (child có 1 field Link). */
function TableMultiSelectField(p: FieldControlProps) {
  const t = useT();
  const childMeta = useChildMeta(p.field.options, p.services);
  const [txt, setTxt] = useState("");
  const [opts, setOpts] = useState<Array<{ value: string; description?: string }>>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const rows = Array.isArray(p.value) ? (p.value as Doc[]) : [];
  const linkField = childMeta?.fields.find((f) => f.fieldtype === "Link");
  const target = linkField?.options;

  useEffect(() => {
    let alive = true;
    const search = p.services?.searchLink;
    if (!search || !target || txt.length < 1) {
      setOpts([]);
      return;
    }
    void search(target, txt).then((r) => alive && setOpts(r));
    return () => {
      alive = false;
    };
  }, [txt, target, p.services]);

  useEffect(() => {
    const resolve = p.services?.resolveDisplay;
    if (!resolve || !target) return;
    let alive = true;
    const values = rows.map((row) => String(row[linkField?.fieldname ?? ""] ?? "")).filter(Boolean);
    void Promise.all(values.map(async (value) => {
      try { const result = await resolve(target, value); return [value, result.label || value] as const; }
      catch { return [value, value] as const; }
    })).then((pairs) => { if (alive) setLabels(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, [rows, target, linkField?.fieldname, p.services]);

  if (p.masked) return <span className="mf-masked text-sm text-muted-foreground">••••••</span>;
  if (!childMeta || !linkField) return <div className="text-sm text-muted-foreground">{t("grid.loading_prefix")} {p.field.options}…</div>;
  const fn = linkField.fieldname;

  const add = (value: string) => {
    if (!value || rows.some((r) => r[fn] === value)) return;
    p.onChange([...rows, { [fn]: value, name: `new-${Date.now()}`, doctype: childMeta.name } as Doc]);
    setTxt("");
  };
  const remove = (idx: number) => p.onChange(rows.filter((_, i) => i !== idx));

  return (
    <div className="mf-multiselect space-y-2">
      {rows.length ? (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r, i) => (
            <Badge key={String(r.name ?? i)} variant="secondary" className="gap-1 pr-1 font-normal">
              {labels[String(r[fn] ?? "")] ?? String(r[fn] ?? "")}
              {!p.readOnly ? (
                <Button type="button" variant="ghost" onClick={() => remove(i)} aria-label={t("common.remove_prefix")} className="size-4 rounded-sm p-0 hover:bg-background/60 [&_svg]:size-3">
                  <X />
                </Button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
      {!p.readOnly ? (
        <div className="relative">
          <Input
            id={p.id}
            className="mf-control"
            value={txt}
            placeholder={`${t("grid.add_prefix")} ${target ?? ""}…`}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTxt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const normalized = txt.trim().toLowerCase();
              const exact = opts.find((option) => option.value.toLowerCase() === normalized || option.description?.toLowerCase() === normalized);
              if (exact) add(exact.value);
            }}
          />
          {opts.length && txt ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {opts.slice(0, 8).map((o) => (
                <Button key={o.value} type="button" variant="ghost" className="w-full justify-start rounded-none font-normal" onClick={() => add(o.value)}>
                  <span className="min-w-0"><span className="block truncate">{linkDisplay(o).primary}</span>{linkDisplay(o).secondary ? <span className="block truncate text-xs text-muted-foreground">{linkDisplay(o).secondary}</span> : null}</span>
                </Button>
              ))}
            </div>
          ) : txt ? <div className="mt-1 text-xs text-muted-foreground">{t("grid.pick_valid_result")}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Đăng ký Table + Table MultiSelect vào registry (registry dùng để render cell). */
export function registerTableControls(registry: ControlRegistry): ControlRegistry {
  registry.register("Table", (p) => <TableField {...p} registry={registry} />);
  registry.register("Table MultiSelect", (p) => <TableMultiSelectField {...p} />);
  return registry;
}
