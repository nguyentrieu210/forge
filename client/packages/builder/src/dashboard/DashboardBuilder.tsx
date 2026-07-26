/** @jsxImportSource react */
/**
 * DashboardBuilder (M22) — thêm/sửa Number Card + Chart, sắp thứ tự. Sinh DashboardDef
 * (charts=Dashboard Chart Link, cards=Number Card Link, chart_options JSON) → adapter.saveDashboard.
 * Lưới react-grid-layout = PHA 6.
 */
import { useEffect, useMemo } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Undo2, Redo2, Plus, X, Hash, BarChart3 } from "lucide-react";
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

export function DashboardBuilder(props: DashboardBuilderProps) {
  const b = useBuilder<DashboardModel>(props.initial);
  useEffect(() => {
    props.onChange?.(b.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.model]);
  const m = b.model;

  const items = useMemo(
    () => [
      ...m.cards.map((c, i) => ({ key: `card-${i}`, label: c.label, kind: "card" as const, w: 2, h: 2 })),
      ...m.charts.map((c, i) => ({ key: `chart-${i}`, label: c.title, kind: "chart" as const, w: 4, h: 4 })),
    ],
    [m.cards, m.charts],
  );
  const layout: Layout[] = items.map((it, i) => ({ i: it.key, x: (i * 2) % 12, y: 0, w: it.w, h: it.h }));

  return (
    <div className="mf-builder mf-dashboard-builder space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-48" value={m.name} onChange={(e) => b.set({ ...m, name: e.target.value })} placeholder="Tên Dashboard" />
        <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        <Button size="sm" className="ml-auto" onClick={() => props.onSave?.(m)} disabled={props.saving}>Lưu</Button>
      </div>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-medium">Number Card <Button variant="outline" size="sm" onClick={() => b.set({ ...m, cards: [...m.cards, { label: `Card ${m.cards.length + 1}`, document_type: "", function: "Count" }] })}><Plus /> Thêm</Button></h4>
        {m.cards.map((c, i) => {
          const patch = (p: Partial<DashCardCfg>) => b.set({ ...m, cards: m.cards.map((x, j) => (j === i ? { ...x, ...p } : x)) });
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input className="w-40" value={c.label} onChange={(e) => patch({ label: e.target.value })} placeholder="Nhãn" />
              <Input className="w-40" value={c.document_type} onChange={(e) => patch({ document_type: e.target.value })} placeholder="DocType" />
              <Select value={c.function} onValueChange={(v) => patch({ function: v as DashCardCfg["function"] })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Count">Count</SelectItem>
                  <SelectItem value="Sum">Sum</SelectItem>
                  <SelectItem value="Average">Average</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => b.set({ ...m, cards: m.cards.filter((_, j) => j !== i) })} aria-label="Xoá"><X /></Button>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-medium">Chart <Button variant="outline" size="sm" onClick={() => b.set({ ...m, charts: [...m.charts, { title: `Chart ${m.charts.length + 1}`, chart_type: "Bar", document_type: "" }] })}><Plus /> Thêm</Button></h4>
        {m.charts.map((c, i) => {
          const patch = (p: Partial<DashChartCfg>) => b.set({ ...m, charts: m.charts.map((x, j) => (j === i ? { ...x, ...p } : x)) });
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input className="w-40" value={c.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Tiêu đề" />
              <Input className="w-40" value={c.document_type} onChange={(e) => patch({ document_type: e.target.value })} placeholder="DocType" />
              <Select value={c.chart_type} onValueChange={(v) => patch({ chart_type: v as DashChartCfg["chart_type"] })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bar">Bar</SelectItem>
                  <SelectItem value="Line">Line</SelectItem>
                  <SelectItem value="Pie">Pie</SelectItem>
                  <SelectItem value="Percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => b.set({ ...m, charts: m.charts.filter((_, j) => j !== i) })} aria-label="Xoá"><X /></Button>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">Bố cục (kéo/resize)</h4>
        {items.length > 0 ? (
          <ResponsiveGrid className="layout" layouts={{ lg: layout }} breakpoints={{ lg: 1200, sm: 480 }} cols={{ lg: 12, sm: 6 }} rowHeight={40}>
            {items.map((it) => (
              <div key={it.key} className="mf-db-tile flex items-center gap-1.5 overflow-hidden rounded-md border bg-card p-2 text-sm [&_svg]:size-4">
                {it.kind === "card" ? <Hash /> : <BarChart3 />} {it.label}
              </div>
            ))}
          </ResponsiveGrid>
        ) : (
          <div className="grid h-24 place-items-center text-sm text-muted-foreground">Thêm card/chart để xếp bố cục</div>
        )}
      </section>
    </div>
  );
}
