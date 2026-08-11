import "./index.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { applyBrand } from "@metaforge/shell";
import { createFullRegistry } from "@metaforge/views";
import { MetadataChildGrid } from "../../../packages/views/src/form/MetadataChildGrid.js";

applyBrand("enterprise");

const registry = createFullRegistry();

const childMeta = {
  name: "QA Line",
  istable: 1,
  fields: [
    { fieldname: "item_code", fieldtype: "Data", label: "Item", reqd: 1, surface: "quick", editMode: "editable" },
    { fieldname: "kind", fieldtype: "Select", label: "Kind", options: "Standard\nDimension", reqd: 1, surface: "quick", editMode: "editable" },
    { fieldname: "dimension", fieldtype: "Float", label: "Dimension", depends_on: "eval:doc.kind=='Dimension'", surface: "quick", editMode: "editable" },
    { fieldname: "qty", fieldtype: "Float", label: "Qty", reqd: 1, surface: "quick", editMode: "editable" },
    { fieldname: "net_amount", fieldtype: "Currency", label: "Server total", read_only: 1, surface: "quick", editMode: "readonly" },
    { fieldname: "note", fieldtype: "Data", label: "Note", surface: "expanded", editMode: "editable" },
    { fieldname: "secret_snapshot", fieldtype: "Data", label: "Secret snapshot", hidden: 1, read_only: 1, surface: "internal", editMode: "hidden" },
  ],
  permissions: [{ role: "All", permlevel: 0, read: 1, write: 1 }],
  viewPolicy: {
    quickEntry: {
      enabled: true,
      columns: ["item_code", "kind", "dimension", "qty", "net_amount"],
      previewMethod: "qa.preview",
      previewParentFields: ["transaction_date"],
      version: "grid-04-qa-v1",
    },
    form: {
      enabled: true,
      columns: ["item_code", "kind", "dimension", "qty", "net_amount", "note"],
      previewMethod: "qa.preview",
      previewParentFields: ["transaction_date"],
      version: "grid-04-qa-v1",
    },
  },
} as unknown as DocTypeMeta;

const services = {
  getMeta: async () => childMeta,
  searchLink: async (_doctype: string, text: string) => [{ value: `${text}-A` }, { value: `${text}-B` }],
  callPost: async (_method: string, args: Record<string, unknown>) => {
    const row = (args.row ?? {}) as Record<string, unknown>;
    const kind = String(row.kind ?? "Standard");
    const qty = Number(row.qty ?? 0);
    return {
      patch: { net_amount: Number.isFinite(qty) ? qty * 10 : 0 },
      clear: kind === "Standard" ? ["dimension"] : [],
      field_overrides: {
        dimension: kind === "Dimension"
          ? { hidden: 0, reqd: 1, label: "Dimension" }
          : { hidden: 1, reqd: 0, label: "Dimension" },
        net_amount: { read_only: 1, label: "Server total" },
      },
      source: "grid-04-fixture",
    };
  },
} as unknown as FieldServices;

const initialRows: Doc[] = [
  {
    name: "qa-line-1",
    doctype: "QA Line",
    item_code: "STD-001",
    kind: "Standard",
    qty: 1,
    net_amount: 10,
    secret_snapshot: "must-never-render",
  } as Doc,
  {
    name: "qa-line-2",
    doctype: "QA Line",
    item_code: "DIM-001",
    kind: "Dimension",
    dimension: 2.5,
    qty: 2,
    net_amount: 20,
    secret_snapshot: "must-never-render",
  } as Doc,
];

function Harness() {
  const [rows, setRows] = useState<Doc[]>(initialRows);
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header>
          <h1 className="text-xl font-semibold">GRID-04 Smart Child Grid QA</h1>
          <p className="text-sm text-muted-foreground">Generic metadata fixture; server preview owns projected values.</p>
        </header>
        <MetadataChildGrid
          childMeta={childMeta}
          rows={rows}
          onChange={setRows}
          registry={registry}
          services={services}
          parentDoc={{ doctype: "QA Parent", name: "QA-PARENT-1", transaction_date: "2026-08-11" }}
          roles={["All"]}
        />
        <pre data-testid="qa-state" className="max-h-48 overflow-auto rounded-md border bg-muted/20 p-2 text-xs">
          {JSON.stringify(rows)}
        </pre>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<StrictMode><Harness /></StrictMode>);
