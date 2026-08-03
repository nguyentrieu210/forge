import { useState, type ReactNode } from "react";
import { Boxes, Eye, LayoutDashboard, Printer, Sparkles, Workflow } from "lucide-react";
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

interface StudioHeaderProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  meta: string;
}

function StudioHeader({ icon, eyebrow, title, description, meta }: StudioHeaderProps) {
  return (
    <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="relative isolate overflow-hidden bg-primary px-4 py-5 text-primary-foreground sm:px-5">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full border border-primary-foreground/15" />
        <div className="pointer-events-none absolute -right-4 top-8 size-32 rounded-full border border-primary-foreground/10" />
        <div className="relative flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 shadow-inner">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">{eyebrow}</div>
            <h1 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 opacity-75 sm:text-sm">{description}</p>
          </div>
          <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-primary-foreground/15 bg-primary-foreground/10 px-2.5 py-1 text-[11px] font-medium sm:flex">
            <Sparkles className="size-3.5" /> {meta}
          </div>
        </div>
      </div>
    </header>
  );
}

export default function BuilderRoutes(props: BuilderRoutesProps) {
  const { which, taskMeta, registry, services } = props;
  const [builtMeta, setBuiltMeta] = useState<DocTypeMeta>(taskMeta);

  if (which === "b-doctype") {
    return (
      <div className="space-y-4">
        <StudioHeader
          icon={<Boxes className="size-5" />}
          eyebrow="Meta Studio · Data model"
          title="DocType Builder"
          description="Thiết kế cấu trúc dữ liệu bằng metadata, sắp xếp trường trực quan và kiểm tra ngay trên form runtime thật."
          meta={`${builtMeta.fields.length} trường`}
        />
        <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
          <DocTypeBuilder
            initial={builtMeta}
            onChange={setBuiltMeta}
            onSave={(m) => toast.success(`Đã lưu bản thiết kế ${m.name} (${m.fields.length} trường)`)}
          />
          <aside className="overflow-hidden rounded-2xl border bg-card shadow-sm 2xl:sticky 2xl:top-3">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="size-2 rounded-full bg-destructive/70" />
                <span className="size-2 rounded-full bg-warning/70" />
                <span className="size-2 rounded-full bg-success/70" />
              </div>
              <div className="ml-1 flex min-w-0 items-center gap-1.5 text-xs font-medium">
                <Eye className="size-3.5 text-primary" />
                <span className="truncate">Xem trước runtime</span>
              </div>
              <span className="ml-auto rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success-text">LIVE</span>
            </div>
            <div className="h-[min(42rem,75vh)] overflow-auto bg-background/60 p-3 sm:p-4">
              <FormView
                key={builtMeta.fields.length}
                meta={builtMeta}
                doc={{ name: "preview", doctype: builtMeta.name }}
                registry={registry}
                services={services}
                roles={["System Manager"]}
              />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (which === "b-workflow") {
    return (
      <div className="space-y-4">
        <StudioHeader
          icon={<Workflow className="size-5" />}
          eyebrow="Meta Studio · Process"
          title="Workflow Builder"
          description="Mô hình hóa trạng thái, hành động và quyền chuyển tiếp trên một canvas quy trình duy nhất."
          meta="Node graph"
        />
        <WorkflowBuilder initial={blankWorkflow("Task")} onSave={(w) => toast.success(`Đã lưu Workflow ${w.name}`)} />
      </div>
    );
  }

  if (which === "b-print") {
    return (
      <div className="space-y-4">
        <StudioHeader
          icon={<Printer className="size-5" />}
          eyebrow="Meta Studio · Output"
          title="Print Format Builder"
          description="Chọn dữ liệu cần in, sắp xếp thứ tự và kiểm tra bố cục giấy trước khi phát hành mẫu."
          meta="Paper blocks"
        />
        <PrintFormatBuilder initial={printModelFromFields("Task Print", "Task", taskMeta.fields)} onSave={(m) => toast.success(`Đã lưu mẫu in ${m.name}`)} />
      </div>
    );
  }

  if (which === "b-dashboard") {
    return (
      <div className="space-y-4">
        <StudioHeader
          icon={<LayoutDashboard className="size-5" />}
          eyebrow="Meta Studio · Analytics"
          title="Dashboard Builder"
          description="Ghép chỉ tiêu và biểu đồ trên lưới responsive để tạo cockpit vận hành bằng metadata."
          meta="Responsive grid"
        />
        <DashboardBuilder initial={blankDashboard("Task Dashboard")} onSave={(m) => toast.success(`Đã lưu Dashboard ${m.name}`)} />
      </div>
    );
  }

  return null;
}
