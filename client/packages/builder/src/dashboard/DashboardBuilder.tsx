/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  BarChart3, Database, Eye, Gauge, GripVertical, Hash, Image, LayoutGrid,
  Plus, Redo2, Save, Settings2, Table2, Trash2, Type, Undo2, X,
} from "lucide-react";
import { Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@metaforge/ui";
import { useBuilder } from "../kernel.js";

const ResponsiveGrid = WidthProvider(Responsive);

export interface DashCardCfg {
  label: string;
  document_type: string;
  function: "Count" | "Sum" | "Average";
  aggregate_field?: string;
}
export interface DashChartCfg {
  title: string;
  chart_type: "Bar" | "Line" | "Pie" | "Percentage";
  document_type: string;
}
export interface DashboardModel {
  name: string;
  cards: DashCardCfg[];
  charts: DashChartCfg[];
}

export function blankDashboard(name = "New Dashboard"): DashboardModel {
  return { name, cards: [], charts: [] };
}

export interface DashboardBuilderProps {
  initial: DashboardModel;
  onChange?: (m: DashboardModel) => void;
  onSave?: (m: DashboardModel) => void;
  saving?: boolean;
}

type WidgetKind = "card" | "chart";
type SelectedWidget = { kind: WidgetKind; index: number } | null;
type InspectorTab = "layout" | "properties";

const DATA_SOURCES = [
  ["Công việc", "Task"],
  ["Khách hàng", "Customer"],
  ["Nhân viên", "Employee"],
  ["Đơn hàng", "Sales Order"],
] as const;

const FUTURE_WIDGETS = [
  ["Bảng", <Table2 key="table" />],
  ["Văn bản", <Type key="text" />],
  ["Hình ảnh", <Image key="image" />],
  ["Gauge", <Gauge key="gauge" />],
] as const;

export function DashboardBuilder(props: DashboardBuilderProps) {
  const builder = useBuilder<DashboardModel>(props.initial);
  const model = builder.model;
  const [selected, setSelected] = useState<SelectedWidget>(null);
  const [inspector, setInspector] = useState<InspectorTab>("layout");
  const [preview, setPreview] = useState(false);
  const [columnCount, setColumnCount] = useState("12");
  const [canvasMode, setCanvasMode] = useState("fluid");

  useEffect(() => {
    props.onChange?.(builder.model);
  }, [builder.model, props.onChange]);

  const columns = Number(columnCount);
  const widgets = useMemo(() => [
    ...model.cards.map((card, index) => ({
      key: `card-${index}`, kind: "card" as const, index, label: card.label, w: 3, h: 2,
    })),
    ...model.charts.map((chart, index) => ({
      key: `chart-${index}`, kind: "chart" as const, index, label: chart.title, w: 6, h: 5,
    })),
  ], [model.cards, model.charts]);

  const layouts: Layout[] = widgets.map((widget, index) => ({
    i: widget.key,
    x: (index * 3) % columns,
    y: Math.floor(index / Math.max(1, Math.floor(columns / 3))) * 2,
    w: Math.min(widget.w, columns),
    h: widget.h,
    minW: widget.kind === "card" ? 2 : Math.min(4, columns),
    minH: widget.kind === "card" ? 2 : 3,
  }));

  const addCard = () => {
    const index = model.cards.length;
    builder.set({
      ...model,
      cards: [...model.cards, { label: `Chỉ tiêu ${index + 1}`, document_type: "Task", function: "Count" }],
    });
    setSelected({ kind: "card", index });
    setInspector("properties");
  };

  const addChart = () => {
    const index = model.charts.length;
    builder.set({
      ...model,
      charts: [...model.charts, { title: `Biểu đồ ${index + 1}`, chart_type: "Bar", document_type: "Task" }],
    });
    setSelected({ kind: "chart", index });
    setInspector("properties");
  };

  const removeWidget = (kind: WidgetKind, index: number) => {
    if (kind === "card") {
      builder.set({ ...model, cards: model.cards.filter((_, itemIndex) => itemIndex !== index) });
    } else {
      builder.set({ ...model, charts: model.charts.filter((_, itemIndex) => itemIndex !== index) });
    }
    setSelected(null);
  };

  const patchCard = (patch: Partial<DashCardCfg>) => {
    if (selected?.kind !== "card") return;
    builder.set({
      ...model,
      cards: model.cards.map((card, index) => index === selected.index ? { ...card, ...patch } : card),
    });
  };

  const patchChart = (patch: Partial<DashChartCfg>) => {
    if (selected?.kind !== "chart") return;
    builder.set({
      ...model,
      charts: model.charts.map((chart, index) => index === selected.index ? { ...chart, ...patch } : chart),
    });
  };

  const selectedCard = selected?.kind === "card" ? model.cards[selected.index] : undefined;
  const selectedChart = selected?.kind === "chart" ? model.charts[selected.index] : undefined;

  return (
    <div className="mf-builder mf-dashboard-builder -m-4 flex min-h-[calc(100vh-6rem)] flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
        <Input className="h-8 min-w-44 max-w-72 font-medium" value={model.name} onChange={(event) => builder.set({ ...model, name: event.target.value })} placeholder="Tên báo cáo" />
        <Button variant="outline" size="icon-sm" onClick={builder.undo} disabled={!builder.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={builder.redo} disabled={!builder.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant={preview ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setPreview((value) => !value)}><Eye className="size-4" /> Xem trước</Button>
          <Button size="sm" className="gap-1.5" onClick={() => props.onSave?.(model)} disabled={props.saving}><Save className="size-4" /> Lưu</Button>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 overflow-hidden ${preview ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_17rem]"}`}>
        {!preview ? (
          <aside className="min-h-0 overflow-y-auto border-r bg-card">
            <section className="border-b p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Database className="size-3.5" /> Nguồn dữ liệu</div>
              <div className="space-y-1.5">
                {DATA_SOURCES.map(([label, doctype]) => (
                  <Button key={label} type="button" variant="ghost" className="h-auto w-full justify-start gap-2 rounded-lg border bg-background px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-primary/[0.04]">
                    <Database className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0"><span className="block truncate text-xs font-medium">{label}</span><span className="block truncate text-[10px] text-muted-foreground">{doctype}</span></span>
                  </Button>
                ))}
              </div>
            </section>

            <section className="p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><LayoutGrid className="size-3.5" /> Thành phần</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-20 flex-col gap-1.5 text-xs" onClick={addCard}><Hash className="size-5 text-primary" /> Chỉ tiêu</Button>
                <Button variant="outline" className="h-20 flex-col gap-1.5 text-xs" onClick={addChart}><BarChart3 className="size-5 text-primary" /> Biểu đồ</Button>
                {FUTURE_WIDGETS.map(([label, icon]) => (
                  <Button key={label} variant="outline" className="h-20 flex-col gap-1.5 text-xs" disabled title="Sẽ bổ sung ở phiên bản widget mở rộng">{icon}<span>{label}</span></Button>
                ))}
              </div>
            </section>
          </aside>
        ) : null}

        <main className="min-h-0 overflow-auto bg-muted/30 p-3 md:p-5">
          <section className={`mx-auto min-h-full rounded-xl border bg-card shadow-sm ${canvasMode === "fixed" ? "max-w-5xl" : "w-full"}`}>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-medium">Canvas báo cáo</span>
              <span className="text-[10px] text-muted-foreground">{columns} cột · kéo và thay đổi kích thước</span>
              {!preview && selected ? (
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => removeWidget(selected.kind, selected.index)}><Trash2 className="size-3.5" /> Xóa</Button>
              ) : null}
            </div>

            {widgets.length ? (
              <div className="p-3">
                <ResponsiveGrid
                  className="layout min-h-[34rem]"
                  layouts={{ lg: layouts, md: layouts, sm: layouts }}
                  breakpoints={{ lg: 1200, md: 768, sm: 480 }}
                  cols={{ lg: columns, md: Math.min(columns, 8), sm: Math.min(columns, 4) }}
                  rowHeight={42}
                  isDraggable={!preview}
                  isResizable={!preview}
                  draggableHandle=".mf-db-drag"
                  margin={[10, 10]}
                >
                  {widgets.map((widget) => {
                    const active = selected?.kind === widget.kind && selected.index === widget.index;
                    return (
                      <div key={widget.key} className={`group overflow-hidden rounded-lg border bg-background shadow-sm transition ${active ? "border-primary ring-2 ring-primary/15" : "hover:border-primary/40"}`} onClick={() => { setSelected({ kind: widget.kind, index: widget.index }); setInspector("properties"); }}>
                        <div className="mf-db-drag flex h-9 cursor-move items-center gap-2 border-b px-2 text-xs font-medium">
                          <GripVertical className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{widget.label}</span>
                          {!preview ? (
                            <Button variant="ghost" size="icon-sm" className="ml-auto size-6 opacity-0 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); removeWidget(widget.kind, widget.index); }} aria-label="Xóa thành phần"><X className="size-3.5" /></Button>
                          ) : null}
                        </div>
                        {widget.kind === "card" ? (
                          <div className="flex h-[calc(100%-2.25rem)] items-center justify-between px-4"><div><div className="text-2xl font-semibold">128</div><div className="text-[11px] text-muted-foreground">Dữ liệu xem trước</div></div><Hash className="size-8 text-primary/30" /></div>
                        ) : (
                          <div className="flex h-[calc(100%-2.25rem)] items-end gap-2 p-4">{[45, 68, 38, 82, 56, 74].map((height, index) => <div key={index} className="flex-1 rounded-t bg-primary/70" style={{ height: `${height}%` }} />)}</div>
                        )}
                      </div>
                    );
                  })}
                </ResponsiveGrid>
              </div>
            ) : (
              <div className="grid min-h-[34rem] place-items-center p-6 text-center"><div><LayoutGrid className="mx-auto size-10 text-muted-foreground/50" /><h3 className="mt-3 text-sm font-semibold">Canvas đang trống</h3><p className="mt-1 max-w-sm text-xs text-muted-foreground">Chọn Chỉ tiêu hoặc Biểu đồ ở panel bên trái để bắt đầu thiết kế báo cáo.</p>{!preview ? <div className="mt-4 flex justify-center gap-2"><Button size="sm" onClick={addCard}><Plus className="size-4" /> Chỉ tiêu</Button><Button size="sm" variant="outline" onClick={addChart}><Plus className="size-4" /> Biểu đồ</Button></div> : null}</div></div>
            )}
          </section>
        </main>

        {!preview ? (
          <aside className="min-h-0 overflow-y-auto border-l bg-card">
            <div className="grid grid-cols-2 border-b">
              <Button variant="ghost" className={`rounded-none border-b-2 text-xs ${inspector === "layout" ? "border-primary text-primary" : "border-transparent"}`} onClick={() => setInspector("layout")}><LayoutGrid className="mr-1 size-3.5" /> Bố cục</Button>
              <Button variant="ghost" className={`rounded-none border-b-2 text-xs ${inspector === "properties" ? "border-primary text-primary" : "border-transparent"}`} onClick={() => setInspector("properties")}><Settings2 className="mr-1 size-3.5" /> Thuộc tính</Button>
            </div>

            {inspector === "layout" ? (
              <div className="space-y-4 p-3">
                <div><label className="mb-1.5 block text-xs font-medium">Số cột</label><Select value={columnCount} onValueChange={setColumnCount}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="12">12 cột</SelectItem><SelectItem value="10">10 cột</SelectItem><SelectItem value="8">8 cột</SelectItem><SelectItem value="6">6 cột</SelectItem></SelectContent></Select></div>
                <div><label className="mb-1.5 block text-xs font-medium">Chiều rộng canvas</label><Select value={canvasMode} onValueChange={setCanvasMode}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fluid">Tự động</SelectItem><SelectItem value="fixed">Cố định</SelectItem></SelectContent></Select></div>
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Kéo tiêu đề widget để đổi vị trí. Kéo góc widget để đổi kích thước.</div>
              </div>
            ) : (
              <div className="space-y-4 p-3">
                {!selected ? <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Chọn một thành phần trên canvas để chỉnh thuộc tính.</div> : null}
                {selectedCard ? <><div><label className="mb-1.5 block text-xs font-medium">Tên chỉ tiêu</label><Input className="h-8" value={selectedCard.label} onChange={(event) => patchCard({ label: event.target.value })} /></div><div><label className="mb-1.5 block text-xs font-medium">DocType</label><Input className="h-8" value={selectedCard.document_type} onChange={(event) => patchCard({ document_type: event.target.value })} /></div><div><label className="mb-1.5 block text-xs font-medium">Phép tính</label><Select value={selectedCard.function} onValueChange={(value) => patchCard({ function: value as DashCardCfg["function"] })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Count">Đếm</SelectItem><SelectItem value="Sum">Tổng</SelectItem><SelectItem value="Average">Trung bình</SelectItem></SelectContent></Select></div>{selectedCard.function !== "Count" ? <div><label className="mb-1.5 block text-xs font-medium">Trường tính toán</label><Input className="h-8" value={selectedCard.aggregate_field ?? ""} onChange={(event) => patchCard({ aggregate_field: event.target.value })} /></div> : null}</> : null}
                {selectedChart ? <><div><label className="mb-1.5 block text-xs font-medium">Tên biểu đồ</label><Input className="h-8" value={selectedChart.title} onChange={(event) => patchChart({ title: event.target.value })} /></div><div><label className="mb-1.5 block text-xs font-medium">DocType</label><Input className="h-8" value={selectedChart.document_type} onChange={(event) => patchChart({ document_type: event.target.value })} /></div><div><label className="mb-1.5 block text-xs font-medium">Loại biểu đồ</label><Select value={selectedChart.chart_type} onValueChange={(value) => patchChart({ chart_type: value as DashChartCfg["chart_type"] })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Bar">Cột</SelectItem><SelectItem value="Line">Đường</SelectItem><SelectItem value="Pie">Tròn</SelectItem><SelectItem value="Percentage">Phần trăm</SelectItem></SelectContent></Select></div></> : null}
                {selected ? <Button variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={() => removeWidget(selected.kind, selected.index)}><Trash2 className="size-4" /> Xóa thành phần</Button> : null}
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
