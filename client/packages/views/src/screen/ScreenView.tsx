/** @jsxImportSource react */
import type {
  AppAction,
  AppScreen,
  AppScreenActionBlock,
  AppScreenListBlock,
  AppScreenMetricBlock,
  DocField,
} from "@metaforge/core";
import type { ReactNode } from "react";
import { resolveIcon } from "@metaforge/shell";
import { Button, Skeleton, cn } from "@metaforge/ui";
import { ArrowRight, Gauge, List, PlayCircle } from "lucide-react";
import { ActionScreen } from "../action/ActionScreen.js";
import { useCount, useList, useMeta } from "../container/hooks.js";
import { useLocaleFormat } from "../container/provider.js";

export interface ScreenViewProps {
  screen: AppScreen;
  actions?: AppAction[];
  onNavigate: (path: string) => void;
}

const GRID_COLUMNS: Record<AppScreen["columns"], string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 lg:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-3",
};
const GRID_SPANS = {
  1: "col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
} as const;

export function ScreenView({ screen, actions = [], onNavigate }: ScreenViewProps) {
  const screenActions = screen.app
    ? actions.filter((action) => action.app === screen.app)
    : actions;
  return (
    <section
      className="mf-screen-root min-h-full"
      data-screen={screen.name}
      data-screen-mode={screen.mode}
      aria-labelledby={`screen-${screen.name}-title`}
    >
      <header className="mb-[var(--mf-page-gap)] flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {screen.mode === "touch" ? "Thao tác nhanh" : screen.mode === "focus" ? "Không gian tập trung" : "Màn nghiệp vụ"}
          </p>
          <h1 id={`screen-${screen.name}-title`} className="mt-1 text-2xl font-semibold tracking-tight">
            {screen.label}
          </h1>
          {screen.description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{screen.description}</p> : null}
        </div>
      </header>

      <div className={cn("mf-screen-grid", GRID_COLUMNS[screen.columns])}>
        {screen.blocks.map((block) => (
          <div key={block.id} className={GRID_SPANS[block.span ?? 1]}>
            {block.type === "metric"
              ? <MetricBlock block={block} onNavigate={onNavigate} />
              : block.type === "list"
                ? <ListBlock block={block} onNavigate={onNavigate} />
                : <ActionBlock block={block} actions={screenActions} onNavigate={onNavigate} />}
          </div>
        ))}
      </div>
    </section>
  );
}

const METRIC_TONES: Record<NonNullable<AppScreenMetricBlock["tone"]>, string> = {
  neutral: "text-foreground",
  info: "text-info-text",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-destructive-text",
};

function MetricBlock({ block, onNavigate }: { block: AppScreenMetricBlock; onNavigate: (path: string) => void }) {
  const query = useCount(block.doctype, block.filters);
  const fmt = useLocaleFormat();
  const content = (
    <>
      <BlockHeading icon={resolveIcon(block.icon) ?? <Gauge className="size-4" />} label={block.label} description={block.description} />
      {query.isLoading
        ? <Skeleton className="mt-5 h-10 w-24" />
        : query.isError
          ? <p className="mt-4 text-sm text-destructive">Không tải được chỉ số.</p>
          : <p className={cn("mt-4 text-4xl font-semibold tabular-nums tracking-tight", METRIC_TONES[block.tone ?? "neutral"])}>
              {fmt.number(query.data ?? 0, 0)}
            </p>}
    </>
  );
  const className = "mf-screen-block mf-surface flex h-full w-full flex-col items-stretch justify-start text-left transition-colors hover:border-primary/35";
  return block.route
    ? <button type="button" className={className} onClick={() => onNavigate(block.route!)}>{content}</button>
    : <article className={className}>{content}</article>;
}

function ListBlock({ block, onNavigate }: { block: AppScreenListBlock; onNavigate: (path: string) => void }) {
  const requestedFields = [...new Set(["name", ...block.fields])];
  const query = useList(block.doctype, {
    fields: requestedFields,
    filters: block.filters,
    orderBy: block.order_by,
    pageLength: block.limit,
  });
  const meta = useMeta(block.doctype);
  const fmt = useLocaleFormat();
  const fields = block.fields.map((fieldname) => {
    const field = meta.data?.fields.find((candidate) => candidate.fieldname === fieldname);
    return { fieldname, label: field?.label ?? (fieldname === "name" ? "ID" : fieldname), field };
  });

  return (
    <article className="mf-surface h-full overflow-hidden">
      <div className="mf-screen-block border-b">
        <BlockHeading icon={resolveIcon(block.icon) ?? <List className="size-4" />} label={block.label} description={block.description} />
      </div>
      {query.isLoading
        ? <div className="space-y-2 p-[var(--mf-block-padding)]" aria-label="Đang tải danh sách">
            {Array.from({ length: Math.min(block.limit, 5) }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
          </div>
        : query.isError
          ? <p className="p-[var(--mf-block-padding)] text-sm text-destructive">Không tải được danh sách.</p>
          : !query.data?.length
            ? <p className="p-[var(--mf-block-padding)] text-sm text-muted-foreground">{block.empty_text ?? "Chưa có dữ liệu."}</p>
            : <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/55 text-left text-xs text-muted-foreground">
                    <tr>{fields.map((field) => <th key={field.fieldname} className="px-4 py-2 font-medium">{field.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {query.data.map((row) => (
                      <tr
                        key={row.name}
                        className="mf-screen-list-row cursor-pointer border-t transition-colors hover:bg-muted/45"
                        onClick={() => onNavigate(`/app/${encodeURIComponent(block.doctype)}/${encodeURIComponent(row.name)}`)}
                      >
                        {fields.map(({ fieldname, field }, index) => (
                          <td key={fieldname} className="px-4 py-2.5">
                            {index === 0
                              ? <button
                                  type="button"
                                  className="w-full text-left focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={`Mở ${block.doctype} ${row.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onNavigate(`/app/${encodeURIComponent(block.doctype)}/${encodeURIComponent(row.name)}`);
                                  }}
                                >
                                  {formatCell(row[fieldname], field, fmt)}
                                </button>
                              : formatCell(row[fieldname], field, fmt)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
      <div className="border-t p-2">
        <Button variant="ghost" size="sm" className="w-full justify-between" onClick={() => onNavigate(`/app/${encodeURIComponent(block.doctype)}`)}>
          Mở toàn bộ danh sách <ArrowRight className="size-4" />
        </Button>
      </div>
    </article>
  );
}

function ActionBlock({ block, actions, onNavigate }: {
  block: AppScreenActionBlock;
  actions: AppAction[];
  onNavigate: (path: string) => void;
}) {
  const action = actions.find((candidate) => candidate.name === block.action);
  return (
    <article className="mf-surface h-full overflow-hidden">
      <div className="mf-screen-block border-b">
        <BlockHeading icon={resolveIcon(block.icon) ?? <PlayCircle className="size-4" />} label={block.label} description={block.description} />
      </div>
      <div className="mf-screen-block">
        {action
          ? <ActionScreen
              action={action}
              onOpen={(doctype, name) => onNavigate(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)}
            />
          : <p className="text-sm text-muted-foreground">Tài khoản này không có quyền chạy thao tác.</p>}
      </div>
    </article>
  );
}

function BlockHeading({ icon, label, description }: { icon: ReactNode; label: string; description?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span>
      <div>
        <h2 className="text-sm font-semibold">{label}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

function formatCell(value: unknown, field: DocField | undefined, fmt: ReturnType<typeof useLocaleFormat>) {
  if (value == null || value === "") return <span className="text-muted-foreground/60">—</span>;
  if (field?.fieldtype === "Currency") return fmt.currency(value as number, numberPrecision(field));
  if (field?.fieldtype === "Float" || field?.fieldtype === "Percent") {
    const number = fmt.number(value as number, numberPrecision(field));
    return field.fieldtype === "Percent" ? `${number}%` : number;
  }
  if (field?.fieldtype === "Int") return fmt.number(value as number, 0);
  if (field?.fieldtype === "Date") return fmt.date(String(value));
  if (field?.fieldtype === "Check") return value ? "Có" : "Không";
  return String(value);
}

function numberPrecision(field: DocField): number | undefined {
  if (field.precision == null || field.precision === "") return undefined;
  const value = Number(field.precision);
  return Number.isFinite(value) ? value : undefined;
}
