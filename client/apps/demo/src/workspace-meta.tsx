import { useState, type ReactNode } from "react";
import {
  ArrowRight, BarChart3, FilePlus2, FileText, LayoutDashboard, ListChecks, Plus,
  Receipt, Route, Workflow, Wrench,
} from "lucide-react";
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, Separator, cn,
} from "@metaforge/ui";
import type { WorkspaceMeta } from "./DemoShell.js";

/**
 * MISA-style workspace contract:
 * 1. Quy trình nghiệp vụ.
 * 2. Báo cáo tổng quan.
 * 3+. Một tab cho từng nghiệp vụ/DocType; các route list/form/view là trạng thái con của tab đó.
 */
export const WORKSPACE_META: WorkspaceMeta = {
  modules: [
    {
      key: "operations",
      label: "Nghiệp vụ",
      icon: <ListChecks />,
      tabs: [
        { key: "process", label: "Quy trình nghiệp vụ", targetKey: "process", kind: "process" },
        {
          key: "overview",
          label: "Báo cáo tổng quan",
          targetKey: "dashboard",
          activeKeys: ["dashboard", "report"],
          kind: "overview",
        },
        {
          key: "task",
          label: "Công việc",
          targetKey: "list",
          activeKeys: ["list", "form", "kanban", "tree", "calendar", "gantt", "print"],
          kind: "doctype",
          doctype: "Task",
        },
      ],
    },
    {
      key: "meta",
      label: "Meta",
      icon: <Wrench />,
      tabs: [
        { key: "meta-process", label: "Quy trình nghiệp vụ", targetKey: "meta-process", kind: "process" },
        { key: "meta-overview", label: "Báo cáo tổng quan", targetKey: "meta-overview", kind: "overview" },
        { key: "doctype", label: "DocType", targetKey: "b-doctype", kind: "doctype", doctype: "DocType" },
        { key: "workflow", label: "Workflow", targetKey: "b-workflow", kind: "doctype", doctype: "Workflow" },
        { key: "print-format", label: "Print Format", targetKey: "b-print", kind: "doctype", doctype: "Print Format" },
        { key: "dashboard", label: "Dashboard", targetKey: "b-dashboard", kind: "doctype", doctype: "Dashboard" },
      ],
    },
  ],
};

interface NavigateProps {
  onNavigate: (key: string) => void;
}

interface ShortcutCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
}

function ShortcutCard({ title, description, icon, onClick, primary }: ShortcutCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-28 w-full items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        primary && "border-primary/30 bg-primary/[0.04]",
      )}
    >
      <span className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary [&_svg]:size-5",
        primary && "bg-primary/10 text-primary",
      )}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function ProcessFlow({ steps }: { steps: string[] }) {
  return (
    <div className="flex min-w-max items-center justify-center gap-2 overflow-x-auto px-1 py-2" aria-label="Các bước quy trình">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2">
          <div className="rounded-lg border bg-background px-4 py-3 text-center text-sm font-medium shadow-sm">{step}</div>
          {index < steps.length - 1 ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

export function OperationsProcessWorkspace({ onNavigate }: NavigateProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4 bg-muted/20 p-4 md:p-6">
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h1 className="text-base font-semibold">QUY TRÌNH NGHIỆP VỤ CÔNG VIỆC</h1>
          <p className="mt-1 text-sm text-muted-foreground">Đi từ khởi tạo, phân công, theo dõi đến hoàn tất công việc.</p>
        </div>
        <div className="border-b bg-muted/20 p-5">
          <ProcessFlow steps={["Khởi tạo", "Phân công", "Theo dõi", "Hoàn tất"]} />
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <ShortcutCard title="Danh sách công việc" description="Mở DocType Task ở chế độ danh sách." icon={<ListChecks />} onClick={() => onNavigate("list")} />
          <ShortcutCard title="Tạo công việc" description="Chọn cách khởi tạo trước khi mở biểu mẫu." icon={<FilePlus2 />} onClick={() => setCreateOpen(true)} primary />
          <ShortcutCard title="Kanban xử lý" description="Theo dõi và chuyển trạng thái công việc theo cột." icon={<Route />} onClick={() => onNavigate("kanban")} />
          <ShortcutCard title="Báo cáo tổng quan" description="Xem KPI, biểu đồ và số liệu tổng hợp." icon={<BarChart3 />} onClick={() => onNavigate("dashboard")} />
        </div>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tạo mới công việc</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Chọn thao tác phù hợp để tiếp tục.</p>
          <div className="grid gap-2 pt-2">
            <Button className="justify-start gap-2" onClick={() => { setCreateOpen(false); onNavigate("form"); }}><Plus className="size-4" /> Mở biểu mẫu Task mới</Button>
            <Button variant="outline" className="justify-start gap-2" onClick={() => { setCreateOpen(false); onNavigate("list"); }}><ListChecks className="size-4" /> Mở danh sách công việc</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface MetaCreateOption {
  label: string;
  description: string;
  target: string;
  icon: ReactNode;
}

const META_CREATE_OPTIONS: MetaCreateOption[] = [
  { label: "DocType mới", description: "Cấu trúc dữ liệu và trường", target: "b-doctype", icon: <FileText /> },
  { label: "Workflow mới", description: "Trạng thái và chuyển tiếp", target: "b-workflow", icon: <Workflow /> },
  { label: "Print Format mới", description: "Mẫu in chứng từ", target: "b-print", icon: <Receipt /> },
  { label: "Dashboard mới", description: "KPI và biểu đồ", target: "b-dashboard", icon: <LayoutDashboard /> },
];

export function MetaProcessWorkspace({ onNavigate }: NavigateProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="bg-muted/20 p-4 md:p-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4 text-center">
            <h1 className="text-base font-semibold">QUY TRÌNH THIẾT KẾ META</h1>
            <p className="mt-1 text-sm text-muted-foreground">Tạo cấu trúc dữ liệu, quy trình, mẫu in và dashboard từ một điểm bắt đầu.</p>
          </div>
          <div className="border-b bg-muted/20 p-5">
            <ProcessFlow steps={["DocType", "Workflow", "Giao diện", "Báo cáo"]} />
          </div>
          <div className="p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ShortcutCard title="DocType" description="Mở danh sách và trình thiết kế cấu trúc dữ liệu." icon={<FileText />} onClick={() => onNavigate("b-doctype")} />
              <ShortcutCard title="Workflow" description="Thiết kế trạng thái và chuyển tiếp nghiệp vụ." icon={<Workflow />} onClick={() => onNavigate("b-workflow")} />
              <ShortcutCard title="Print Format" description="Thiết kế biểu mẫu in cho chứng từ." icon={<Receipt />} onClick={() => onNavigate("b-print")} />
              <ShortcutCard title="Dashboard" description="Ghép chỉ số và biểu đồ tổng quan." icon={<LayoutDashboard />} onClick={() => onNavigate("b-dashboard")} />
            </div>
            <Button onClick={() => setCreateOpen(true)} className="mx-auto mt-6 flex gap-2"><Plus className="size-4" /> Tạo mới cấu hình Meta</Button>
          </div>
        </section>

        <aside className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 font-semibold">Lối tắt</div>
          <div className="divide-y">
            {[
              ["Danh sách DocType", "b-doctype"],
              ["Thiết kế Workflow", "b-workflow"],
              ["Thiết kế mẫu in", "b-print"],
              ["Thiết kế Dashboard", "b-dashboard"],
              ["Báo cáo tổng quan", "meta-overview"],
            ].map(([label, target]) => (
              <Button key={target} variant="ghost" className="h-11 w-full justify-start rounded-none px-4 font-normal" onClick={() => onNavigate(target!)}>{label}</Button>
            ))}
          </div>
        </aside>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tạo mới cấu hình Meta</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Chọn loại tài nguyên cần tạo để mở builder tương ứng.</p>
          <Separator />
          <div className="grid gap-2 sm:grid-cols-2">
            {META_CREATE_OPTIONS.map((option) => (
              <button
                key={option.target}
                type="button"
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.04]"
                onClick={() => { setCreateOpen(false); onNavigate(option.target); }}
              >
                <span className="mt-0.5 text-primary [&_svg]:size-4">{option.icon}</span>
                <span><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.description}</span></span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MetaOverviewWorkspace({ onNavigate }: NavigateProps) {
  const cards = [
    { label: "DocType", value: "1", target: "b-doctype", icon: <FileText /> },
    { label: "Workflow", value: "1", target: "b-workflow", icon: <Workflow /> },
    { label: "Print Format", value: "1", target: "b-print", icon: <Receipt /> },
    { label: "Dashboard", value: "1", target: "b-dashboard", icon: <LayoutDashboard /> },
  ];

  return (
    <div className="space-y-4 bg-muted/20 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-semibold">Báo cáo tổng quan Meta</h1><p className="text-sm text-muted-foreground">Tổng hợp nhanh tài nguyên cấu hình và trạng thái thiết kế.</p></div>
        <Button variant="outline" className="gap-2" onClick={() => onNavigate("meta-process")}><Wrench className="size-4" /> Về quy trình</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button key={card.target} type="button" onClick={() => onNavigate(card.target)} className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md">
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{card.label}</span><span className="text-primary [&_svg]:size-5">{card.icon}</span></div>
            <div className="mt-3 text-3xl font-semibold">{card.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">Mở trình quản lý</div>
          </button>
        ))}
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4 text-primary" /> Tình trạng cấu hình</div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-muted/50 p-4"><div className="text-xs text-muted-foreground">Đã cấu hình</div><div className="mt-1 text-xl font-semibold">4</div></div>
          <div className="rounded-lg bg-muted/50 p-4"><div className="text-xs text-muted-foreground">Cần kiểm tra</div><div className="mt-1 text-xl font-semibold">0</div></div>
          <div className="rounded-lg bg-muted/50 p-4"><div className="text-xs text-muted-foreground">Bản nháp</div><div className="mt-1 text-xl font-semibold">0</div></div>
        </div>
      </section>
    </div>
  );
}
