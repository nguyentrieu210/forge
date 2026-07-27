/** @jsxImportSource react */
/**
 * GanttView (M08, presentational) — thanh thời gian theo start/end. Dep-free (div %).
 * frappe-gantt (đúng stack, kéo đổi ngày) = lazy PHA 6.
 */
import { useT } from "@metaforge/ui";

export interface GanttTask {
  name: string;
  label: string;
  start: string; // YYYY-MM-DD
  end: string;
  progress?: number; // 0..100
}
export interface GanttViewProps {
  tasks: GanttTask[];
  onTaskClick?: (task: GanttTask) => void;
}

const DAY = 86400000;

export function GanttView(props: GanttViewProps) {
  const t = useT();
  const { tasks } = props;
  if (tasks.length === 0) return <div className="mf-gantt mf-gantt-empty">{t("gantt.empty")}</div>;

  const starts = tasks.map((task) => new Date(task.start).getTime());
  const ends = tasks.map((task) => new Date(task.end).getTime());
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = Math.max(DAY, max - min);
  const mid = min + span / 2;
  const dateLabel = (value: number) => new Date(value).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="mf-gantt">
      <div className="mf-gantt-axis" aria-hidden="true">
        <span>{dateLabel(min)}</span><span>{dateLabel(mid)}</span><span>{dateLabel(max)}</span>
      </div>
      {tasks.map((task) => {
        const s = new Date(task.start).getTime();
        const e = new Date(task.end).getTime();
        const left = ((s - min) / span) * 100;
        const width = Math.max(1, ((e - s) / span) * 100);
        return (
          <div key={task.name} className="mf-gantt-row">
            <div className="mf-gantt-label" title={task.label}>{task.label}</div>
            <div className="mf-gantt-track" style={{ position: "relative", height: 20, background: "var(--secondary)", borderRadius: 4 }}>
              <div
                className={`mf-gantt-bar${props.onTaskClick ? " mf-clickable" : ""}`}
                onClick={props.onTaskClick ? () => props.onTaskClick!(task) : undefined}
                onKeyDown={props.onTaskClick ? (event) => { if (event.key === "Enter") { event.preventDefault(); props.onTaskClick!(task); } } : undefined}
                tabIndex={props.onTaskClick ? 0 : undefined}
                role={props.onTaskClick ? "button" : undefined}
                aria-label={`${task.label}, ${task.start} đến ${task.end}${typeof task.progress === "number" ? `, hoàn thành ${task.progress}%` : ""}`}
                title={`${task.start} → ${task.end}`}
                style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 2, height: 16, background: "var(--primary)", opacity: 0.82, borderRadius: 4 }}
              >
                {typeof task.progress === "number" ? (
                  <div className="mf-gantt-progress" style={{ height: "100%", width: `${task.progress}%`, background: "color-mix(in srgb, var(--primary-foreground) 32%, transparent)", borderRadius: 4 }} />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
