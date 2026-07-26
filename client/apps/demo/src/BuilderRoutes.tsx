import { useState } from "react";
import type { DocTypeMeta } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { FormView } from "@metaforge/views";
import type { ControlRegistry } from "@metaforge/controls";
import {
  DocTypeBuilder, WorkflowBuilder, PrintFormatBuilder, DashboardBuilder,
  blankWorkflow, printModelFromFields, blankDashboard,
} from "@metaforge/builder";

/**
 * BuilderRoutes — gom 4 builder vào 1 chunk async (lazy-load ở App).
 * Kéo theo reactflow / react-grid-layout / dnd-kit ra khỏi bundle chính (chiến lược >100KB).
 */
export interface BuilderRoutesProps {
  which: string;
  taskMeta: DocTypeMeta;
  registry: ControlRegistry;
  services: FieldServices;
}

export default function BuilderRoutes(props: BuilderRoutesProps) {
  const { which, taskMeta, registry, services } = props;
  const [builtMeta, setBuiltMeta] = useState<DocTypeMeta>(taskMeta);

  if (which === "b-doctype") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">DocType Builder — kéo fieldtype → xem Form render LIVE</h2>
        <DocTypeBuilder initial={builtMeta} onChange={setBuiltMeta} onSave={(m) => alert("saveMeta:\n" + JSON.stringify(m.fields.map((f) => f.fieldname), null, 2))} />
        <h3 className="text-sm font-medium text-muted-foreground">Preview (FormView từ meta vừa dựng)</h3>
        <div className="rounded-lg border p-3">
          <FormView key={builtMeta.fields.length} meta={builtMeta} doc={{ name: "preview", doctype: builtMeta.name }} registry={registry} services={services} roles={["System Manager"]} />
        </div>
      </div>
    );
  }
  if (which === "b-workflow") return <WorkflowBuilder initial={blankWorkflow("Task")} onSave={(w) => alert(JSON.stringify(w, null, 2))} />;
  if (which === "b-print") return <PrintFormatBuilder initial={printModelFromFields("Task Print", "Task", taskMeta.fields)} onSave={(m) => alert(JSON.stringify(m, null, 2))} />;
  if (which === "b-dashboard") return <DashboardBuilder initial={blankDashboard("Task Dashboard")} onSave={(m) => alert(JSON.stringify(m, null, 2))} />;
  return null;
}
