import { useState, type ReactNode } from "react";
import {
  BarChart3, FilePlus2, FileText, LayoutDashboard, ListChecks, Plus, Receipt,
  Route, Workflow, Wrench,
} from "lucide-react";
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, Separator, cn,
} from "@metaforge/ui";
import type { WorkspaceMeta } from "./DemoShell.js";

export const WORKSPACE_META: WorkspaceMeta = {
  modules: [
    {
      key: "operations",
      label: "Nghiệp vụ",
      icon: <ListChecks />,
      tabs: [
        { key: "process", label: "Quy trình nghiệp vụ", targetKey: "process", kind: "process" },
        { key: "overview", label: "Báo cáo tổng quan", targetKey: "dashboard", kind: "overview" },
        { key: "form", label: "Biểu mẫu", targetKey: "form", kind: "doctype", doctype: "Task" },
        { key: "list", label: "Danh sách chứng từ", targetKey: "list", kind: "doctype", doctype: "Task" },
        { key: "kanban", label: "Kanban", targetKey: "kanban", kind: "doctype", doctype: "Task" },
        { key: "calendar", label: "Lịch", targetKey: "calendar", kind: "doctype", doctype: "Task" },
        { key: "gantt", label: "Gantt", targetKey: "gantt", kind: "doctype", doctype: "Task" },
        { key: "report", label: "Báo cáo", targetKey: "report", kind: "doctype", doctype: "Task" },
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
        { key: "print-builder", label: "Print Builder", targetKey: "b-print", kind: "doctype", doctype: "Print Format" },
        { key: "dashboard-builder", label: "Dashboard Builder", targetKey: "b-dashboard", kind: "doctype", doctype: "Dashboard" },
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

export function OperationsProcessWorkspace({ onNavigate }: NavigateProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4 bg-muted/20 p-4 md:p-6">
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h1 className="text-base font-semibold">QUY TRÌNH NGHIỆP VỤ CÔNG VIỆC</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mở nhanh danh sách, biểu mẫu tạo mới hoặc các màn xử lý công việc.</p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <ShortcutCard title="Danh sách công việc" description="Mở DocType Task ở chế độ danh sách chứng từ." icon={<ListChecks />} onClick={() => onNavigate("list")} />
          <ShortcutCard title="Tạo công việc" description="Mở modal chọn thao tác tạo mới trước khi vào biểu mẫu." icon={<FilePlus2 />} onClick={() => setCreateOpen(true)} primary />
          <ShortcutCard title="Kanban xử lý" description="Theo dõi và chuyển trạng thái công việc theo cột." icon={<Route />} onClick={() => onNavigate("kanban")} />
          <ShortcutCard title="Báo cáo công việc" description="Xem dữ liệu tổng hợp và danh sách báo cáo." icon={<BarChart3 />} onClick={() => onNavigate("report")} />
        </div>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tạo mới công việc</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Chọn cách khởi tạo. Một modal nhỏ, thay vì bắt người dùng đoán xem nút cộng sẽ đưa họ đi đâu.</p>
          <div className="grid gap-2 pt-2">
            <Button className="justify-start gap-2" onClick={() => { setCreateOpen(false); onNavigate("form"); }}><Plus className="size-4" /> Mở biểu mẫu Task mới</Button>
            <Button variant="outline" className="justify-start gap-2" onClick={() => { setCreateOpen(false); onNavigate("list"); }}><ListChecks className="size-4" /> Mở danh sách trước</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
          <div className="p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ShortcutCard title="DocType" description="Mở danh sách và trình thiết kế cấu trúc dữ liệu." icon={<FileText />} onClick={() => onNavigate("b-doctype")} />
              <ShortcutCard title="Workflow" description="Thiết kế trạng thái và chuyển tiếp nghiệp vụ." icon={<Workflow />} onClick={() => onNavigate("b-workflow")} />
              <ShortcutCard title="Print Format" description="Thiết kế biểu mẫu in cho chứng từ." icon={<Receipt />} onClick={() => onNavigate("b-print")} />
              <ShortcutCard title="Dashboard" description="Ghép chỉ số và biểu đồ tổng quan." icon={<LayoutDashboard />} onClick={() => onNavigate("b-dashboard")} />
            </div>

            <div className="my-7 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">DocType → Workflow → Giao diện → Báo cáo</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button onClick={() => setCreateOpen(true)} className="mx-auto flex gap-2"><Plus className="size-4" /> Tạo mới cấu hình Meta</Button>
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
          <p className="text-sm text-muted-foreground">Chọn loại tài nguyên cần tạo. Sau bước này builder tương ứng sẽ chịu trách nhiệm phần còn lại, như một hệ thống có tổ chức tối thiểu.</p>
          <Separator />
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["DocType mới", "Cấu trúc dữ liệu và trường", "b-doctype", <FileText key="doctype" />],
              ["Workflow mới", "Trạng thái và chuyển tiếp", "b-workflow", <Workflow key="workflow" />],
              ["Print Format mới", "Mẫu in chứng từ", "b-print", <Receipt key="print" />],
              ["Dashboard mới", "KPI và biểu đồ", "b-dashboard", <LayoutDashboard key="dashboard" />],
            ].map(([label, description, target, icon]) => (
              <button
                key={String(target)}
                type="button"
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.04]"
                onClick={() => { setCreateOpen(false); onNavigate(String(target)); }}
              >
                <span className="mt-0.5 text-primary [&_svg]:size-4">{icon}</span>
                <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
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
    ["DocType", "1", "b-doctype", <FileText key="doctype" />],
    ["Workflow", "1", "b-workflow", <Workflow key="workflow" />],
    ["Print Format", "1", "b-print", <Receipt key="print" />],
    ["Dashboard", "1", "b-dashboard", <LayoutDashboard key="dashboard" />],
  ] as const;

  return (
    <div className="space-y-4 bg-muted/20 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-semibold">Báo cáo tổng quan Meta</h1><p className="text-sm text-muted-foreground">Tổng hợp nhanh các tài nguyên cấu hình và điểm truy cập builder.</p></div>
        <Button variant="outline" className="gap-2" onClick={() => onNavigate("meta-process")}><Wrench className="size-4" /> Về quy trình</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, target, icon]) => (
          <button key={target} type="button" onClick={() => onNavigate(target)} className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md">
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className="text-primary [&_svg]:size-5">{icon}</span></div>
            <div className="mt-3 text-3xl font-semibold">{value}</div>
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
