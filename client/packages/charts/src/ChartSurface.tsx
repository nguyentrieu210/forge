/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EChartsOption, EChartsType } from "echarts/core";
import type { ForgeEChartsEngine } from "./engine.js";
import { compactMetric, resolveForgeChartTokens } from "./theme.js";
import type { ForgeChartBaseProps, ForgeChartInteraction, ForgeChartRenderer, ForgeChartSeries, ForgeChartTheme } from "./types.js";

export type ForgeOptionBuilder = (context: {
  tokens: ReturnType<typeof resolveForgeChartTokens>;
  reducedMotion: boolean;
}) => EChartsOption;

interface CanvasProps {
  dataKey: string;
  theme: ForgeChartTheme;
  renderer: ForgeChartRenderer;
  animation: boolean;
  buildOption: ForgeOptionBuilder;
  onActivate?: (interaction: ForgeChartInteraction) => void;
  prepareEngine?: (engine: ForgeEChartsEngine) => void | Promise<void>;
}

function EChartCanvas(props: CanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(props.buildOption);
  const interactionRef = useRef(props.onActivate);
  const themeRef = useRef(props.theme);
  const animationRef = useRef(props.animation);
  const prepareRef = useRef(props.prepareEngine);
  const applyRef = useRef<(() => void) | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  optionRef.current = props.buildOption;
  interactionRef.current = props.onActivate;
  themeRef.current = props.theme;
  animationRef.current = props.animation;
  prepareRef.current = props.prepareEngine;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let reducedMedia: MediaQueryList | null = null;
    let mediaListener: (() => void) | null = null;

    const mount = async () => {
      try {
        const module = await import("./engine.js");
        if (cancelled) return;
        const engine = module.getForgeECharts();
        await prepareRef.current?.(engine);
        if (cancelled) return;
        const chart = engine.init(host, undefined, { renderer: props.renderer });
        chartRef.current = chart;

        const apply = () => {
          if (!chartRef.current || !hostRef.current) return;
          const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
          const option = optionRef.current({
            tokens: resolveForgeChartTokens(hostRef.current, themeRef.current),
            reducedMotion,
          });
          chartRef.current.setOption({ ...option, animation: animationRef.current && !reducedMotion }, { notMerge: true, lazyUpdate: true });
        };
        applyRef.current = apply;
        apply();

        chart.on("click", (params: unknown) => {
          const event = params as { name?: string | number; dataIndex?: number; seriesName?: string; value?: unknown };
          const index = typeof event.dataIndex === "number" ? event.dataIndex : 0;
          const numericValue = Array.isArray(event.value) ? Number(event.value[event.value.length - 1]) : Number(event.value);
          interactionRef.current?.({
            label: event.name === undefined ? String(index) : String(event.name),
            index,
            seriesName: event.seriesName,
            value: Number.isFinite(numericValue) ? numericValue : undefined,
          });
        });

        resizeObserver = new ResizeObserver(() => chartRef.current?.resize());
        resizeObserver.observe(host);

        if (typeof document !== "undefined") {
          themeObserver = new MutationObserver(apply);
          themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
        }
        if (typeof window !== "undefined" && window.matchMedia) {
          reducedMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
          mediaListener = () => apply();
          reducedMedia.addEventListener?.("change", mediaListener);
        }
      } catch (error) {
        if (!cancelled) setEngineError(error instanceof Error ? error.message : "Không tải được bộ máy biểu đồ");
      }
    };

    void mount();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      if (reducedMedia && mediaListener) reducedMedia.removeEventListener?.("change", mediaListener);
      applyRef.current = null;
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [props.renderer]);

  useEffect(() => {
    applyRef.current?.();
  }, [props.dataKey, props.theme, props.animation, props.buildOption]);

  if (engineError) {
    return <div className="grid h-full place-items-center rounded-md border border-dashed px-4 text-sm text-destructive" role="alert">{engineError}</div>;
  }
  return <div ref={hostRef} className="h-full w-full" />;
}

interface ForgeChartSurfaceProps extends Pick<ForgeChartBaseProps, "title" | "height" | "className" | "theme" | "renderer" | "loading" | "error" | "emptyText" | "ariaLabel" | "onRetry" | "onActivate" | "animation" | "valueFormatter"> {
  hasData: boolean;
  dataKey: string;
  buildOption: ForgeOptionBuilder;
  labels?: string[];
  series?: ForgeChartSeries[];
  children?: ReactNode;
  prepareEngine?: CanvasProps["prepareEngine"];
}

export function ForgeChartSurface({
  title,
  height = 260,
  className = "",
  theme = "auto",
  renderer = "canvas",
  loading = false,
  error = null,
  emptyText = "Chưa có dữ liệu để lập biểu đồ",
  ariaLabel,
  onRetry,
  onActivate,
  animation = true,
  valueFormatter,
  hasData,
  dataKey,
  buildOption,
  labels = [],
  series = [],
  children,
  prepareEngine,
}: ForgeChartSurfaceProps) {
  const full = valueFormatter ?? ((value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value));
  const description = ariaLabel ?? title ?? "Biểu đồ dữ liệu";

  return (
    <div className={`relative min-w-0 ${className}`} style={{ height }} aria-label={description}>
      {loading ? (
        <div className="h-full w-full animate-pulse rounded-md border bg-muted/35 motion-reduce:animate-none" aria-busy="true"><span className="sr-only">Đang tải biểu đồ</span></div>
      ) : error ? (
        <div className="grid h-full place-items-center rounded-md border border-dashed p-4 text-center" role="alert">
          <div><div className="text-sm font-medium">Không tải được biểu đồ</div><div className="mt-1 text-xs text-muted-foreground">{error}</div>{onRetry ? <button type="button" onClick={onRetry} className="mt-3 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">Thử lại</button> : null}</div>
        </div>
      ) : !hasData ? (
        <div className="grid h-full place-items-center rounded-md border border-dashed px-4 text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <>
          <EChartCanvas dataKey={dataKey} theme={theme} renderer={renderer} animation={animation} buildOption={buildOption} onActivate={onActivate} prepareEngine={prepareEngine} />
          {children}
          {labels.length && series.length ? (
            <table className="sr-only">
              <caption>{description}</caption>
              <thead><tr><th>Mốc</th>{series.map((item) => <th key={item.name}>{item.name}</th>)}</tr></thead>
              <tbody>{labels.map((label, index) => <tr key={`${label}-${index}`}><th>{label}</th>{series.map((item) => <td key={item.name}>{full(Number(item.values[index] ?? 0))}</td>)}</tr>)}</tbody>
            </table>
          ) : null}
          {!labels.length && series.length ? <span className="sr-only">{series.map((item) => `${item.name}: ${compactMetric(Number(item.values.at(-1) ?? 0))}`).join(", ")}</span> : null}
        </>
      )}
    </div>
  );
}
