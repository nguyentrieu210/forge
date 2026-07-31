/** @jsxImportSource react */
import { resolveField, type Doc, type DocField, type DocTypeMeta } from "@metaforge/core";
import { FallbackControl } from "@metaforge/controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metaforge/ui";
import {
  ChildGrid as BaseChildGrid,
  deriveAverageWeight,
  derivePurchaseOrderBarem,
  resolveChildGridColumns as resolveBaseColumns,
  defaultChildGridHiddenColumns as resolveBaseHiddenColumns,
  type AverageWeightResult,
  type ChildGridProps,
} from "./ChildGrid.js";

export { deriveAverageWeight, derivePurchaseOrderBarem };
export type { AverageWeightResult, ChildGridProps };

const SALES_STANDARD_FIELDS = new Set([
  "item_code", "door_type", "width_m", "height_m", "mesh_height_m", "set_count", "color", "sales_mode",
  "has_butterfly_bracket", "leaf_variant", "leaf_height_deduction_m", "leaf_divisor_m", "leaf_rounding",
  "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count", "cut_width_m", "billable_area_sqm",
  "estimated_weight_kg", "estimated_minutes", "formula_policy", "formula_version", "formula_explanation",
  "uom", "qty", "rate", "amount", "motor_model", "accessories", "install_note", "warehouse",
  "availability_status", "note",
]);

const LAYOUT_TYPES = new Set([
  "Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect",
]);

function isSalesGrid(meta: DocTypeMeta): boolean {
  return meta.name === "Quotation Item" || meta.name === "Sales Order Item";
}

function extensionColumns(meta: DocTypeMeta): DocField[] {
  if (!isSalesGrid(meta)) return [];
  return (meta.fields ?? []).filter((field) =>
    field.in_list_view === 1
    && !LAYOUT_TYPES.has(field.fieldtype)
    && !SALES_STANDARD_FIELDS.has(field.fieldname));
}

export function resolveChildGridColumns(
  meta: DocTypeMeta,
  rows: Doc[],
  parentDoc?: Record<string, unknown>,
  roles?: string[],
): DocField[] {
  const base = resolveBaseColumns(meta, rows, parentDoc, roles);
  const known = new Set(base.map((field) => field.fieldname));
  return [...base, ...extensionColumns(meta).filter((field) => !known.has(field.fieldname))];
}

export function defaultChildGridHiddenColumns(
  meta: DocTypeMeta,
  columns: DocField[],
  expanded: boolean,
): string[] {
  if (!isSalesGrid(meta)) return resolveBaseHiddenColumns(meta, columns, expanded);
  return resolveBaseHiddenColumns(meta, columns, expanded)
    .filter((fieldname) => SALES_STANDARD_FIELDS.has(fieldname));
}

function dynamicLinkTarget(field: DocField, row: Doc): string | undefined {
  if (field.fieldtype === "Link") return field.options;
  if (field.fieldtype !== "Dynamic Link" || !field.options) return undefined;
  const target = row[field.options];
  return typeof target === "string" && target.trim() ? target.trim() : undefined;
}

function ExtensionGrid(props: ChildGridProps) {
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles } = props;
  const columns = extensionColumns(childMeta);
  if (!columns.length) return null;

  const setCell = (rowIndex: number, fieldname: string, value: unknown) => {
    onChange(rows.map((row, index) => index === rowIndex ? { ...row, [fieldname]: value } : row));
  };

  return (
    <div className="mt-2 overflow-x-auto rounded-md border" data-child-grid-extensions={childMeta.name}>
      <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
        Trường mở rộng
      </div>
      <Table className="w-full text-sm">
        <TableHeader>
          <TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableHead className="w-10 text-right">#</TableHead>
            {columns.map((field) => (
              <TableHead key={field.fieldname} className="min-w-32">
                {field.label || field.fieldname}{field.reqd ? <span className="ml-0.5 text-destructive">*</span> : null}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={String(row.name ?? rowIndex)}>
              <TableCell className="text-right text-xs text-muted-foreground">{rowIndex + 1}</TableCell>
              {columns.map((field) => {
                const gridField = field.list_only ? { ...field, list_only: 0 } : field;
                const resolved = resolveField(gridField, childMeta, {
                  doc: row,
                  parent: parentDoc,
                  roles,
                  assumeWritable: true,
                });
                if (!resolved.visible) {
                  return (
                    <TableCell key={field.fieldname} className="bg-muted/60 text-center text-xs text-muted-foreground">
                      —
                    </TableCell>
                  );
                }
                const Control = registry.resolve(field.fieldtype) ?? FallbackControl;
                return (
                  <TableCell key={field.fieldname} className="min-w-32 align-top">
                    <Control
                      field={gridField}
                      value={row[field.fieldname]}
                      onChange={(value: unknown) => setCell(rowIndex, field.fieldname, value)}
                      readOnly={Boolean(readOnly || resolved.readOnly)}
                      masked={resolved.masked}
                      services={services}
                      docname={String(row.name ?? "")}
                      linkTarget={dynamicLinkTarget(field, row)}
                      parentDoctype={childMeta.name}
                      docValues={row}
                      roles={roles}
                      compact
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ChildGrid(props: ChildGridProps) {
  return (
    <>
      <BaseChildGrid {...props} />
      <ExtensionGrid {...props} />
    </>
  );
}
