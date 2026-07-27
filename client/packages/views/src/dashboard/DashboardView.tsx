/** @jsxImportSource react */
/**
 * DashboardView (M10, presentational) — Number Card (§10 number_card.get_result) + Chart
 * (§10 dashboard_chart.get) vẽ bằng **Recharts** (đúng stack): bar/line/area responsive.
 */
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import type { BoundFormatters } from "@metaforge/core";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, useT } from "@metaforge/ui";
import { useLocaleFormat } from "../container/provider.js";

export interface DashboardCard {
  label: string;
  value: number | string;
  /** % thay đổi (tuỳ chọn). */
  trend?: number;
  /** route mở khi bấm vào thẻ (drill-through) — thiếu ⇒ thẻ chỉ để đọc, KHÔNG giả làm nút bấm. */
  route?: string;
  /** false khi giảm là tốt (ví dụ công nợ, lỗi, thời gian chờ). */
  higherIsBetter?: boolean;
}
export interface DashboardChartData {
  title: string;
  type?: "bar" | "line" | string;
  labels: string[];
  datasets: Array<{ name?: string; values: number[] }>;
  /** route theo từng nhãn (vd "Tháng 3" → list đã lọc tháng 3). Thiếu nhãn nào ⇒ cột đó không bấm được. */
  routeByLabel?: Record<string, string>;
}
export interface DashboardViewProps {
  cards?: DashboardCard[];
  charts?: DashboardChartData[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  updatedAt?: string;
  filterSummary?: string;
  /** app tự điều hướng (views KHÔNG biết router). Thiếu ⇒ mọi drill-through tắt. */
  onNavigate?: (route: string) => void;
}

export function DashboardView(props: DashboardViewProps) {
  const t = useT();
  // Hook TRƯỚC return sớm (check-hook-order).
  const fmt = useLocaleFormat();
  const { cards = [], charts = [], loading } = props;
  if (loading) return <div className="mf-dash mf-dash-loading space-y-3 p-4" aria-busy="true"><div className="h-24 animate-pulse rounded-lg bg-muted" /><div className="h-56 animate-pulse rounded-lg bg-muted" /><span className="sr-only">{t("dashboard.loading")}</span></div>;
  if (props.error) return <div className="mf-empty-state gap-2"><AlertCircle className="text-destructive" /><div className="font-medium">Không tải được bảng điều hành</div><div className="text-sm text-muted-foreground">{props.error}</div>{props.onRetry ? <Button size="sm" onClick={props.onRetry}><RefreshCw /> Thử lại</Button> : null}</div>;
  if (!cards.length && !charts.length) return <div className="mf-empty-state text-sm text-muted-foreground">{t("common.no_data")}</div>;
  return (
    <div className="mf-dash p-4 md:p-5">
      {(props.filterSummary || props.updatedAt) ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{props.filterSummary ? <span>Bộ lọc: {props.filterSummary}</span> : null}{props.updatedAt ? <span>Cập nhật: {props.updatedAt}</span> : null}</div> : null}
      {cards.length > 0 ? (
        <div className="mf-dash-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
          {cards.map((c, i) => {
            const drill = c.route && props.onNavigate ? () => props.onNavigate!(c.route!) : undefined;
            const body = (
              <>
                <div className="text-2xl font-bold tabular-nums">{String(c.value)}</div>
                <div className="text-sm text-muted-foreground">{c.label}</div>
                {typeof c.trend === "number" ? (
                  <div className={`mt-1 text-xs ${c.trend === 0 ? "text-muted-foreground" : ((c.trend > 0) === (c.higherIsBetter !== false) ? "text-emerald-600" : "text-destructive")}`} aria-label={`${c.trend > 0 ? "Tăng" : c.trend < 0 ? "Giảm" : "Không đổi"} ${Math.abs(c.trend)} phần trăm`}>
                    {c.trend > 0 ? "▲" : c.trend < 0 ? "▼" : "●"} {Math.abs(c.trend)}%
                  </div>
                ) : null}
              </>
            );
            // Không có route ⇒ giữ khối tĩnh: biến thẻ thành nút bấm khi chẳng đi đâu được sẽ đánh
            // lừa cả chuột lẫn trình đọc màn hình.
            return drill ? (
              <Button
                key={i}
                type="button"
                variant="ghost"
                onClick={drill}
                className="mf-number-card h-auto flex-col items-stretch rounded-lg border bg-card p-3 text-left font-normal transition hover:border-primary/40 hover:bg-card hover:shadow-sm"
              >
                {body}
              </Button>
            ) : (
              <div key={i} className="mf-number-card rounded-lg border bg-card p-3">{body}</div>
            );
          })}
        </div>
      ) : null}

      {charts.map((ch, i) => (
        <div key={i} className="mf-dash-chart">
          <h4 className="mf-chart-title">{ch.title}</h4>
          <MetaChart chart={ch} onNavigate={props.onNavigate} fmt={fmt} />
        </div>
      ))}
    </div>
  );
}

/** Recharts wrapper — data-driven từ {labels, datasets}. */
function MetaChart({ chart, onNavigate, fmt }: { chart: DashboardChartData; onNavigate?: (route: string) => void; fmt?: BoundFormatters }) {
  const data = chart.labels.map((label, labelIndex) => Object.assign(
    { label },
    ...chart.datasets.map((dataset, datasetIndex) => ({ [`value${datasetIndex}`]: dataset.values[labelIndex] ?? 0 })),
  ));
  const isLine = chart.type === "line";
  // Drill-through: bấm 1 cột/điểm → mở route của đúng nhãn đó. Dùng onClick ở CẤP BIỂU ĐỒ
  // (state.activeLabel) chứ không phải ở <Bar>: click vào khoảng trống giữa 2 cột vẫn ra đúng nhãn
  // gần nhất, và Line/Area không có vùng bấm riêng cho từng điểm.
  const routes = chart.routeByLabel;
  const onChartClick = routes && onNavigate
    ? (state: { activeLabel?: string | number } | null) => {
        const label = state?.activeLabel;
        const route = label === undefined ? undefined : routes[String(label)];
        if (route) onNavigate(route);
      }
    : undefined;
  const clickable = Boolean(onChartClick);
  const palette = ["var(--primary)", "var(--chart-2, #16a34a)", "var(--chart-3, #d97706)", "var(--chart-4, #7c3aed)", "var(--chart-5, #0891b2)"];

  /**
   * Số hiển thị trên biểu đồ.
   *
   * Nhóm hàng nghìn theo locale, và RÚT GỌN khi số lớn (1.2 tr thay vì 1.234.567): nhãn trên đầu
   * cột chỉ rộng bằng cột, số đầy đủ sẽ bị cắt hoặc chồng lên nhãn cột bên cạnh. Muốn con số
   * chính xác thì rê chuột vào — bảng chú giải hiện đủ.
   */
  const short = (v: number): string => {
    const a = Math.abs(v);
    if (a >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace(".", ",")} tỷ`;
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} tr`;
    if (a >= 10_000) return `${Math.round(v / 1000)}k`;
    return fmt ? fmt.number(v) : String(v);
  };
  const full = (v: unknown) => (fmt ? fmt.number(Number(v)) : String(v));

  return (
    <div className="mf-chart" style={{ width: "100%", height: 220, cursor: clickable ? "pointer" : undefined }}>
      <ResponsiveContainer width="100%" height="100%">
        {isLine ? (
          <LineChart data={data} onClick={onChartClick}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => short(Number(v))} />
            <Tooltip
              formatter={(v, name) => [full(v), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
            />
            {/* dot={true}: không có chấm thì không biết đường gãy ở đâu, và nhãn số trôi lơ lửng. */}
            {chart.datasets.map((dataset, index) => <Line key={index} type="monotone" dataKey={`value${index}`} name={dataset.name ?? `Chuỗi ${index + 1}`} stroke={palette[index % palette.length]} strokeWidth={2} dot={{ r: 2.5 }}>
              {chart.datasets.length === 1 ? <LabelList dataKey={`value${index}`} position="top" fontSize={11} formatter={(v: unknown) => short(Number(v))} /> : null}
            </Line>)}
          </LineChart>
        ) : (
          <BarChart data={data} onClick={onChartClick}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => short(Number(v))} />
            <Tooltip
              formatter={(v, name) => [full(v), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            />
            {/* Số ngay trên đầu cột: bảng chú giải chỉ hiện khi rê chuột, nên khi chụp màn hình
                hoặc nhìn từ xa (màn hình treo trong kho) biểu đồ không nói lên con số nào cả. */}
            {chart.datasets.map((dataset, index) => <Bar key={index} dataKey={`value${index}`} name={dataset.name ?? `Chuỗi ${index + 1}`} fill={palette[index % palette.length]} opacity={0.78} radius={[4, 4, 0, 0]}>
              {chart.datasets.length === 1 ? <LabelList dataKey={`value${index}`} position="top" fontSize={11} formatter={(v: unknown) => short(Number(v))} /> : null}
            </Bar>)}
          </BarChart>
        )}
      </ResponsiveContainer>
      <Table unwrapped className="sr-only">
        <caption>{chart.title}</caption>
        <TableHeader><TableRow><TableHead>Mốc</TableHead>{chart.datasets.map((dataset, index) => <TableHead key={index}>{dataset.name ?? `Chuỗi ${index + 1}`}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{chart.labels.map((label, labelIndex) => <TableRow key={label}><TableHead>{label}</TableHead>{chart.datasets.map((dataset, datasetIndex) => <TableCell key={datasetIndex}>{full(dataset.values[labelIndex] ?? 0)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
      {routes && onNavigate ? <div className="sr-only">{Object.entries(routes).map(([label, route]) => <Button key={label} type="button" onClick={() => onNavigate(route)}>Mở chi tiết {label}</Button>)}</div> : null}
    </div>
  );
}
