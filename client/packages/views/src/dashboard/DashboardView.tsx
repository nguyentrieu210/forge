/** @jsxImportSource react */
/**
 * DashboardView (M10, presentational) — Number Card (§10 number_card.get_result) + Chart
 * (§10 dashboard_chart.get) vẽ bằng **Recharts** (đúng stack): bar/line/area responsive.
 */
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import type { BoundFormatters } from "@metaforge/core";
import { Button, useT } from "@metaforge/ui";
import { useLocaleFormat } from "../container/provider.js";

export interface DashboardCard {
  label: string;
  value: number | string;
  /** % thay đổi (tuỳ chọn). */
  trend?: number;
  /** route mở khi bấm vào thẻ (drill-through) — thiếu ⇒ thẻ chỉ để đọc, KHÔNG giả làm nút bấm. */
  route?: string;
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
  /** app tự điều hướng (views KHÔNG biết router). Thiếu ⇒ mọi drill-through tắt. */
  onNavigate?: (route: string) => void;
}

export function DashboardView(props: DashboardViewProps) {
  const t = useT();
  // Hook TRƯỚC return sớm (check-hook-order).
  const fmt = useLocaleFormat();
  const { cards = [], charts = [], loading } = props;
  if (loading) return <div className="mf-dash mf-dash-loading">{t("dashboard.loading")}</div>;
  return (
    <div className="mf-dash p-4 md:p-5">
      {cards.length > 0 ? (
        <div className="mf-dash-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
          {cards.map((c, i) => {
            const drill = c.route && props.onNavigate ? () => props.onNavigate!(c.route!) : undefined;
            const body = (
              <>
                <div className="text-2xl font-bold tabular-nums">{String(c.value)}</div>
                <div className="text-sm text-muted-foreground">{c.label}</div>
                {typeof c.trend === "number" ? (
                  <div className={`mt-1 text-xs ${c.trend >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {c.trend >= 0 ? "▲" : "▼"} {Math.abs(c.trend)}%
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
  const ds = chart.datasets[0]?.values ?? [];
  const data = chart.labels.map((label, i) => ({ label, value: ds[i] ?? 0 }));
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
              formatter={(v) => [full(v), ""]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
            />
            {/* dot={true}: không có chấm thì không biết đường gãy ở đâu, và nhãn số trôi lơ lửng. */}
            <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2.5 }}>
              <LabelList dataKey="value" position="top" fontSize={11} formatter={(v: unknown) => short(Number(v))} />
            </Line>
          </LineChart>
        ) : (
          <BarChart data={data} onClick={onChartClick}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => short(Number(v))} />
            <Tooltip
              formatter={(v) => [full(v), ""]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            />
            {/* Số ngay trên đầu cột: bảng chú giải chỉ hiện khi rê chuột, nên khi chụp màn hình
                hoặc nhìn từ xa (màn hình treo trong kho) biểu đồ không nói lên con số nào cả. */}
            <Bar dataKey="value" fill="var(--primary)" opacity={0.78} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="value" position="top" fontSize={11} formatter={(v: unknown) => short(Number(v))} />
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
