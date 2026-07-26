import { useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  FileText, List as ListIcon, LayoutGrid, FolderTree, Calendar as CalIcon, BarChart3,
  LayoutDashboard, ScrollText, Printer, Wrench, Workflow, Receipt, Plus,
} from "lucide-react";
import { type DocTypeMeta, type Doc } from "@metaforge/core";
import type { FieldServices } from "@metaforge/controls";
import type { AwesomeRecord, NavItem } from "@metaforge/shell";
import { FormView, KanbanView, TreeView, ReportView, PrintView, DashboardView, CalendarView, GanttView, SplitView, ContextPanel, createFullRegistry, type TreeNodeItem, type TimelineItem } from "@metaforge/views";
import { AIPanel, I18nProvider } from "@metaforge/shell";
import type { WorkflowTransition } from "@metaforge/adapter-frappe";
import { DemoShell } from "./DemoShell.js";
import { MockList } from "./list-glue.js";
import { BuilderRoutes } from "./BuilderRoutesLazy.js";
import { toast } from "@metaforge/ui";

const registry = createFullRegistry();

const checklistMeta: DocTypeMeta = {
  name: "Task Checklist", istable: 1,
  fields: [
    { fieldname: "activity", fieldtype: "Data", label: "Việc", in_list_view: 1, reqd: 1 },
    { fieldname: "done", fieldtype: "Check", label: "Xong", in_list_view: 1 },
  ], permissions: [],
};

// taskMeta với ≥3 Tab Break (chứng minh tabs) + standard filter + search_fields (M04)
const taskMeta: DocTypeMeta & { search_fields?: string } = {
  name: "Task", title_field: "subject", search_fields: "subject,assignee",
  fields: [
    { fieldname: "tab_main", fieldtype: "Tab Break", label: "Tổng quan" },
    { fieldname: "sec", fieldtype: "Section Break", label: "Thông tin" },
    { fieldname: "subject", fieldtype: "Data", label: "Tiêu đề", reqd: 1, in_list_view: 1 },
    { fieldname: "status", fieldtype: "Select", label: "Trạng thái", options: "Open\nWorking\nClosed\nCancelled", in_list_view: 1, in_standard_filter: 1 },
    { fieldname: "col", fieldtype: "Column Break" },
    { fieldname: "priority", fieldtype: "Select", label: "Ưu tiên", options: "Low\nMedium\nHigh", in_list_view: 1, in_standard_filter: 1 },
    { fieldname: "assignee", fieldtype: "Data", label: "Phụ trách", in_list_view: 1, in_standard_filter: 1 },
    { fieldname: "progress", fieldtype: "Percent", label: "Tiến độ", in_list_view: 1 },
    { fieldname: "exp_date", fieldtype: "Date", label: "Hạn", in_list_view: 1 },
    { fieldname: "tab_detail", fieldtype: "Tab Break", label: "Chi tiết" },
    { fieldname: "description", fieldtype: "Text", label: "Mô tả" },
    { fieldname: "attachment", fieldtype: "Attach", label: "Tệp đính kèm" },
    { fieldname: "tab_checklist", fieldtype: "Tab Break", label: "Checklist" },
    { fieldname: "checklist", fieldtype: "Table", label: "Danh sách việc", options: "Task Checklist" },
    { fieldname: "tab_close", fieldtype: "Tab Break", label: "Kết thúc" },
    { fieldname: "close_reason", fieldtype: "Small Text", label: "Lý do đóng", depends_on: "eval:doc.status=='Closed'", mandatory_depends_on: "eval:doc.status=='Closed'" },
  ],
  permissions: [{ role: "All", permlevel: 0, read: 1, write: 1 }],
};

const services: FieldServices = {
  getMeta: async (dt) => (dt === "Task Checklist" ? checklistMeta : taskMeta),
  searchLink: async (_dt, txt) => [{ value: `${txt}-A` }, { value: `${txt}-B` }],
  uploadFile: async (file) => ({ file_url: `/files/${file.name}`, name: file.name }),
};

const rows: Doc[] = [
  { name: "TASK-0001", doctype: "Task", subject: "Chuẩn bị demo", status: "Working", priority: "High", assignee: "Lan", progress: 60, exp_date: "2026-07-25", checklist: [{ name: "c1", activity: "Viết BRD", done: 1 }] },
  { name: "TASK-0002", doctype: "Task", subject: "Verify contract", status: "Closed", priority: "Medium", assignee: "Minh", progress: 100, exp_date: "2026-07-20", checklist: [] },
  { name: "TASK-0003", doctype: "Task", subject: "Build renderer", status: "Open", priority: "High", assignee: "Lan", progress: 20, exp_date: "2026-07-31", checklist: [] },
  { name: "TASK-0004", doctype: "Task", subject: "Thiết kế data-table", status: "Working", priority: "High", assignee: "Huy", progress: 75, exp_date: "2026-07-24" },
  { name: "TASK-0005", doctype: "Task", subject: "Viết tài liệu API", status: "Open", priority: "Low", assignee: "Minh", progress: 0, exp_date: "2026-08-02" },
  { name: "TASK-0006", doctype: "Task", subject: "Test phân quyền", status: "Cancelled", priority: "Medium", assignee: "Huy", progress: 10, exp_date: "2026-07-18" },
  { name: "TASK-0007", doctype: "Task", subject: "Tối ưu truy vấn", status: "Working", priority: "Medium", assignee: "Lan", progress: 45, exp_date: "2026-07-28" },
  { name: "TASK-0008", doctype: "Task", subject: "Dựng CI/CD", status: "Open", priority: "High", assignee: "Huy", progress: 5, exp_date: "2026-08-05" },
  { name: "TASK-0009", doctype: "Task", subject: "Rà soát bảo mật", status: "Closed", priority: "High", assignee: "Minh", progress: 100, exp_date: "2026-07-15" },
  { name: "TASK-0010", doctype: "Task", subject: "Họp nghiệm thu", status: "Open", priority: "Low", assignee: "Lan", progress: 0, exp_date: "2026-08-10" },
  { name: "TASK-0011", doctype: "Task", subject: "Chuẩn hoá i18n", status: "Working", priority: "Medium", assignee: "Huy", progress: 30, exp_date: "2026-08-01" },
  { name: "TASK-0012", doctype: "Task", subject: "Đóng gói release", status: "Open", priority: "High", assignee: "Minh", progress: 15, exp_date: "2026-08-12" },
];

const mockTransitions: WorkflowTransition[] = [
  { action: "Hoàn thành", next_state: "Closed", allowed: "All" },
  { action: "Tạm dừng", next_state: "Paused", allowed: "All" },
];

const mockTimeline: TimelineItem[] = [
  { id: "t1", kind: "comment", by: "Lan", when: "2 giờ trước", text: "Đã cập nhật tiến độ, chờ review nhé." },
  { id: "t2", kind: "workflow", by: "Minh", when: "hôm qua", text: "Chuyển trạng thái → Working" },
  { id: "t3", kind: "edit", by: "Huy", when: "hôm qua", text: "Sửa Ưu tiên: Medium → High" },
  { id: "t4", kind: "create", by: "Lan", when: "3 ngày trước", text: "Tạo công việc" },
];

const treeRoots: TreeNodeItem[] = [
  { value: "Products", title: "Sản phẩm", expandable: true },
  { value: "Services", title: "Dịch vụ", expandable: false },
];
const treeKids: Record<string, TreeNodeItem[]> = { Products: [{ value: "Laptop", title: "Laptop" }, { value: "Phone", title: "Điện thoại" }] };

const NAV: NavItem[] = [
  { key: "form", label: "Form", icon: <FileText />, group: "Xem" },
  { key: "list", label: "List", icon: <ListIcon />, group: "Xem" },
  { key: "kanban", label: "Kanban", icon: <LayoutGrid />, group: "Xem" },
  { key: "tree", label: "Tree", icon: <FolderTree />, group: "Xem" },
  { key: "calendar", label: "Calendar", icon: <CalIcon />, group: "Xem" },
  { key: "gantt", label: "Gantt", icon: <BarChart3 />, group: "Xem" },
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard />, group: "Xem" },
  { key: "report", label: "Report", icon: <ScrollText />, group: "Xem" },
  { key: "print", label: "Print", icon: <Printer />, group: "Xem" },
  { key: "b-doctype", label: "DocType Builder", icon: <Wrench />, group: "Tạo app" },
  { key: "b-workflow", label: "Workflow Builder", icon: <Workflow />, group: "Tạo app" },
  { key: "b-print", label: "Print Builder", icon: <Receipt />, group: "Tạo app" },
  { key: "b-dashboard", label: "Dashboard Builder", icon: <LayoutDashboard />, group: "Tạo app" },
];
const LABEL: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.key, n.label]));

function Screen() {
  const navigate = useNavigate();
  const { key = "form" } = useParams();
  const [sp, setSp] = useSearchParams();
  const active = key;

  const openName = sp.get("open");
  const openDoc = rows.find((r) => String(r.name) === openName);
  const setOpen = (name: string | null) =>
    setSp(
      (prev) => {
        const p = new URLSearchParams(prev);
        name ? p.set("open", name) : p.delete("open");
        return p;
      },
      { replace: false },
    );

  const awesomebar = useMemo(
    () => ({
      actions: [
        { id: "new-task", label: "Tạo mới Task", icon: <Plus />, hint: "Task", run: () => navigate("/view/form") },
        ...NAV.map((n) => ({ id: `go-${n.key}`, label: `Đi tới ${n.label}`, run: () => navigate(`/view/${n.key}`) })),
      ],
      doctypes: [{ name: "Task", label: "Công việc" }],
      recent: rows.slice(0, 3).map((r) => ({ doctype: "Task", name: String(r.name), title: String(r.subject) })) as AwesomeRecord[],
      searchRecords: async (q: string) => rows.filter((r) => String(r.subject).toLowerCase().includes(q.toLowerCase())).map((r) => ({ doctype: "Task", name: String(r.name), title: String(r.subject) })),
      onSelectRecord: () => navigate("/view/form"),
      onSelectDoctype: () => navigate("/view/list"),
    }),
    [navigate],
  );

  const breadcrumbs = [{ label: "Task", onClick: () => navigate("/view/list") }, { label: LABEL[active] ?? active }];

  return (
    <DemoShell nav={NAV} activeKey={active} onNavigate={(k) => navigate(`/view/${k}`)} breadcrumbs={breadcrumbs} fullName="Demo User" awesomebar={awesomebar}>
      {active === "list" ? (
        <div className="h-full p-4">
          <SplitView
            autoSaveId="mf-mock-split"
            hasDetail={Boolean(openDoc)}
            contextTitle={openName ?? undefined}
            onCloseDetail={() => setOpen(null)}
            list={<MockList meta={taskMeta} allRows={rows} activeRow={openName ?? undefined} onRowClick={(r) => setOpen(String(r.name))} onCreate={() => navigate("/view/form")} />}
            detail={openDoc ? (
              <FormView
                meta={taskMeta}
                doc={openDoc}
                registry={registry}
                services={services}
                roles={["All"]}
                transitions={mockTransitions}
                onWorkflowAction={(a) => toast.success("Workflow (mock): " + a)}
                onAction={(k) => toast.success("Hành động (mock): " + k)}
                onSave={(c) => toast.success("Đã lưu (mock): " + JSON.stringify(c))}
              />
            ) : null}
            context={openDoc ? (
              <ContextPanel
                timeline={mockTimeline}
                assignments={[String(openDoc.assignee ?? "")]}
                attachments={[{ id: "att1", label: "so-do-quy-trinh.pdf" }]}
                tags={["demo", "sprint-5"]}
                onAddComment={(t) => { toast.success("Bình luận (mock): " + t); }}
                searchUsers={async (q) => ["Lan", "Minh", "Huy", "Admin"].filter((u) => u.toLowerCase().includes(q.toLowerCase())).map((u) => ({ value: u, description: u }))}
                onAssign={(u) => { toast.success("Giao cho " + u + " (mock)"); }}
                onRemoveAssign={(u) => { toast.success("Bỏ " + u + " (mock)"); }}
                onAttach={(f) => { toast.success("Đính kèm " + f.name + " (mock)"); }}
                onRemoveAttach={() => { toast.success("Xoá tệp (mock)"); }}
                onAddTag={(t) => { toast.success("Thêm nhãn " + t + " (mock)"); }}
                onRemoveTag={(t) => { toast.success("Bỏ nhãn " + t + " (mock)"); }}
                aiSlot={<AIPanel provider={null} scope="form" />}
              />
            ) : null}
          />
        </div>
      ) : (
        <div className="p-4">
          {active === "form" && <FormView meta={taskMeta} doc={rows[0]!} registry={registry} services={services} roles={["All"]} onSave={(c) => alert(JSON.stringify(c, null, 2))} />}
          {active === "kanban" && <KanbanView meta={taskMeta} fieldName="status" columns={["Open", "Working", "Closed"]} rows={rows} />}
          {active === "tree" && <TreeView roots={treeRoots} childrenOf={(v) => treeKids[v]} expanded={new Set(["Products"])} onToggle={() => {}} />}
          {active === "calendar" && <CalendarView year={2026} month={7} dateField="exp_date" titleField="subject" events={rows} />}
          {active === "gantt" && <GanttView tasks={[{ name: "t1", label: "BRD", start: "2026-07-01", end: "2026-07-10", progress: 100 }, { name: "t2", label: "Renderer", start: "2026-07-08", end: "2026-07-25", progress: 60 }]} />}
          {active === "dashboard" && <DashboardView cards={[{ label: "Task mở", value: 2, trend: 10 }, { label: "Đã đóng", value: 1 }]} charts={[{ title: "Theo trạng thái", labels: ["Open", "Working", "Closed"], datasets: [{ values: [1, 1, 1] }] }]} />}
          {active === "report" && <ReportView columns={[{ label: "Mã", fieldname: "name" }, { label: "Trạng thái", fieldname: "status" }]} result={rows.map((r) => ({ name: r.name, status: r.status }))} />}
          {active === "print" && <PrintView html={`<div><h3>HÓA ĐƠN — ${String(rows[0]!.name)}</h3></div>`} />}
          {active.startsWith("b-") && <BuilderRoutes which={active} taskMeta={taskMeta} registry={registry} services={services} />}
        </div>
      )}
    </DemoShell>
  );
}

export function App() {
  return (
    <I18nProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/view/form" replace />} />
        <Route path="/view/:key" element={<Screen />} />
        <Route path="*" element={<Navigate to="/view/form" replace />} />
      </Routes>
    </BrowserRouter>
    </I18nProvider>
  );
}
