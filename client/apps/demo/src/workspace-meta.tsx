import type { ReactNode } from "react";
import {
  ArrowRight, BarChart3, Boxes, CalendarDays, FileText, FolderCog,
  LayoutDashboard, Library, ListChecks, Receipt, Settings2, Workflow, Wrench,
} from "lucide-react";
import { Button } from "@metaforge/ui";
import type { WorkspaceMeta } from "./DemoShell.js";

export const WORKSPACE_META: WorkspaceMeta = {
  modules: [
    {
      key: "overview-module",
      label: "Tổng quan",
      icon: <LayoutDashboard />,
      hideTabs: true,
      tabs: [{ key: "overview", label: "Tổng quan", targetKey: "overview" }],
    },
    {
      key: "operations-module",
      label: "Nghiệp vụ",
      icon: <ListChecks />,
      tabs: [
        { key: "process", label: "Quy trình", targetKey: "process" },
        { key: "task", label: "Công việc", targetKey: "list", activeKeys: ["list", "form"] },
        { key: "kanban", label: "Kanban", targetKey: "kanban" },
        { key: "calendar", label: "Lịch", targetKey: "calendar", activeKeys: ["calendar", "gantt"] },
        { key: "report", label: "Báo cáo", targetKey: "report", activeKeys: ["report", "print"] },
      ],
    },
    {
      key: "catalog-module",
      label: "Danh mục",
      icon: <Library />,
      hideTabs: true,
      tabs: [{ key: "catalog", label: "Danh mục", targetKey: "catalog" }],
    },
    {
      key: "meta-module",
      label: "Meta",
      icon: <Wrench />,
      tabs: [
        { key: "meta-process", label: "Quy trình", targetKey: "meta-process" },
        { key: "doctype", label: "DocType", targetKey: "b-doctype", doctype: "DocType" },
        { key: "workflow", label: "Workflow", targetKey: "b-workflow", doctype: "Workflow" },
        { key: "print", label: "Mẫu in", targetKey: "b-print", doctype: "Print Format" },
        { key: "dashboard", label: "Thiết kế báo cáo", targetKey: "b-dashboard", doctype: "Dashboard" },
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
  target: string;
  onNavigate: (key: string) => void;
}

function ShortcutCard({ title, description, icon, target, onNavigate }: ShortcutCardProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="group h-auto min-h-28 w-full items-start justify-start gap-3 whitespace-normal rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md"
      onClick={() => onNavigate(target)}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </Button>
  );
}

function ProcessFlow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-3" aria-label="Các bước quy trình">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2">
          <div className="rounded-lg border bg-background px-4 py-3 text-center text-sm font-medium shadow-sm">{step}</div>
          {index < steps.length - 1 ? <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

export function OverviewWorkspace({ onNavigate }: NavigateProps) {
  return (
    <div className="space-y-4 bg-muted/20 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tổng quan điều hành</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi công việc, tiến độ và dữ liệu cấu hình trên một màn hình.</p>
        </div>
        <Button variant="outline" onClick={() => onNavigate("b-dashboard")}>Thiết kế báo cáo</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Tổng công việc", "12", "4 đang thực hiện"],
          ["Đến hạn tuần này", "5", "2 cần ưu tiên"],
          ["Đã hoàn thành", "3", "Tỷ lệ 25%"],
          ["Cấu hình Meta", "4", "Đang hoạt động"],
        ].map(([label, value, note]) => (
          <section key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-2 text-3xl font-semibold">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{note}</div>
          </section>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Tiến độ công việc</h2>
              <p className="text-xs text-muted-foreground">Phân bổ theo trạng thái hiện tại</p>
            </div>
            <BarChart3 className="size-5 text-primary" />
          </div>
          <div className="mt-6 space-y-4">
            {[
              ["Đang mở", 42],
              ["Đang thực hiện", 58],
              ["Đã hoàn thành", 25],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="mb-1 flex justify-between text-xs"><span>{label}</span><span>{value}%</span></div>
                <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Truy cập nhanh</h2>
          <div className="mt-4 grid gap-2">
            <Button variant="outline" className="justify-start" onClick={() => onNavigate("process")}>Mở quy trình nghiệp vụ</Button>
            <Button variant="outline" className="justify-start" onClick={() => onNavigate("catalog")}>Mở danh mục dùng chung</Button>
            <Button variant="outline" className="justify-start" onClick={() => onNavigate("b-dashboard")}>Thiết kế báo cáo</Button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function OperationsProcessWorkspace({ onNavigate }: NavigateProps) {
  return (
    <div className="space-y-4 bg-muted/20 p-4 md:p-6">
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h1 className="text-base font-semibold">QUY TRÌNH NGHIỆP VỤ CÔNG VIỆC</h1>
          <p className="mt-1 text-sm text-muted-foreground">Luồng xử lý gọn từ khởi tạo đến hoàn tất, không lặp lại màn tổng quan trong dải tab.</p>
        </div>
        <div className="border-b bg-muted/20 p-5"><ProcessFlow steps={["Khởi tạo", "Phân công", "Thực hiện", "Nghiệm thu"]} /></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <ShortcutCard title="Danh sách công việc" description="Xem, lọc và mở hồ sơ công việc." icon={<ListChecks />} target="list" onNavigate={onNavigate} />
          <ShortcutCard title="Kanban xử lý" description="Theo dõi trạng thái trên bảng trực quan." icon={<Boxes />} target="kanban" onNavigate={onNavigate} />
          <ShortcutCard title="Lịch thực hiện" description="Theo dõi hạn và kế hoạch công việc." icon={<CalendarDays />} target="calendar" onNavigate={onNavigate} />
          <ShortcutCard title="Báo cáo nghiệp vụ" description="Xem số liệu và kết quả tổng hợp." icon={<BarChart3 />} target="report" onNavigate={onNavigate} />
        </div>
      </section>
    </div>
  );
}

const CATALOG_GROUPS = [
  {
    title: "Đối tượng",
    items: [["Công việc", "list"], ["Người phụ trách", "list"], ["Nhóm công việc", "tree"]],
  },
  {
    title: "Cấu trúc dữ liệu",
    items: [["DocType", "b-doctype"], ["Trường dữ liệu", "b-doctype"], ["Cây phân loại", "tree"]],
  },
  {
    title: "Quy trình",
    items: [["Workflow", "b-workflow"], ["Trạng thái", "b-workflow"], ["Quy tắc chuyển bước", "b-workflow"]],
  },
  {
    title: "Biểu mẫu",
    items: [["Mẫu in", "b-print"], ["Báo cáo", "b-dashboard"], ["Lịch", "calendar"]],
  },
  {
    title: "Hệ thống",
    items: [["Thiết lập", "b-doctype"], ["Phân quyền", "b-workflow"], ["Tùy chọn giao diện", "meta-process"]],
  },
  {
    title: "Khác",
    items: [["Tệp đính kèm", "form"], ["Nhãn", "list"], ["Nhật ký thay đổi", "report"]],
  },
] as const;

export function CatalogWorkspace({ onNavigate }: NavigateProps) {
  return (
    <div className="bg-muted/20 p-4 md:p-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Library className="size-5" /></span>
          <div><h1 className="text-xl font-semibold">Danh mục</h1><p className="text-sm text-muted-foreground">Toàn bộ dữ liệu dùng chung được gom về một màn hình.</p></div>
        </div>
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
          {CATALOG_GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="mb-3 text-sm font-semibold">{group.title}</h2>
              <div className="space-y-1">
                {group.items.map(([label, target]) => (
                  <Button key={label} variant="link" className="h-7 justify-start px-0 text-sm font-normal" onClick={() => onNavigate(target)}>{label}</Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MetaProcessWorkspace({ onNavigate }: NavigateProps) {
  return (
    <div className="space-y-4 bg-muted/20 p-4 md:p-6">
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h1 className="text-base font-semibold">QUY TRÌNH THIẾT KẾ META</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tạo cấu trúc, quy trình, mẫu in và báo cáo theo một luồng thống nhất.</p>
        </div>
        <div className="border-b bg-muted/20 p-5"><ProcessFlow steps={["DocType", "Workflow", "Mẫu in", "Báo cáo"]} /></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <ShortcutCard title="DocType" description="Thiết kế cấu trúc dữ liệu và trường." icon={<FileText />} target="b-doctype" onNavigate={onNavigate} />
          <ShortcutCard title="Workflow" description="Thiết kế trạng thái và chuyển bước." icon={<Workflow />} target="b-workflow" onNavigate={onNavigate} />
          <ShortcutCard title="Mẫu in" description="Thiết kế biểu mẫu chứng từ." icon={<Receipt />} target="b-print" onNavigate={onNavigate} />
          <ShortcutCard title="Thiết kế báo cáo" description="Chọn nguồn dữ liệu, widget và bố cục báo cáo." icon={<BarChart3 />} target="b-dashboard" onNavigate={onNavigate} />
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <ShortcutCard title="Cấu hình hệ thống" description="Thiết lập các tùy chọn dùng chung." icon={<Settings2 />} target="catalog" onNavigate={onNavigate} />
        <ShortcutCard title="Quản lý danh mục" description="Mở danh mục dữ liệu tập trung." icon={<FolderCog />} target="catalog" onNavigate={onNavigate} />
        <ShortcutCard title="Xem tổng quan" description="Quay về dashboard điều hành." icon={<LayoutDashboard />} target="overview" onNavigate={onNavigate} />
      </section>
    </div>
  );
}
