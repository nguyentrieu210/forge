import { useState } from "react";
import type { DocTypeMeta } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import { FormView } from "@metaforge/views";
import { toast } from "@metaforge/ui";
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
        <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
          <DocTypeBuilder initial={builtMeta} onChange={setBuiltMeta} onSave={(m) => toast.success(`Đã lưu bản thiết kế ${m.name} (${m.fields.length} trường)`)} />
          <aside className="space-y-2 2xl:sticky 2xl:top-3">
            <h3 className="text-sm font-medium text-muted-foreground">Xem trước trực tiếp</h3>
            <div className="h-[min(42rem,75vh)] rounded-lg border p-3">
              <FormView key={builtMeta.fields.length} meta={builtMeta} doc={{ name: "preview", doctype: builtMeta.name }} registry={registry} services={services} roles={["System Manager"]} />
            </div>
          </aside>
        </div>
      </div>
    );
  }
  if (which === "b-workflow") return <WorkflowBuilder initial={blankWorkflow("Task")} onSave={(w) => toast.success(`Đã lưu Workflow ${w.name}`)} />;
  if (which === "b-print") return <PrintFormatBuilder initial={printModelFromFields("Task Print", "Task", taskMeta.fields)} onSave={(m) => toast.success(`Đã lưu mẫu in ${m.name}`)} />;
  if (which === "b-dashboard") return <DashboardBuilder initial={blankDashboard("Task Dashboard")} onSave={(m) => toast.success(`Đã lưu Dashboard ${m.name}`)} />;
  return null;
}
