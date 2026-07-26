import { useCallback, useEffect, useState } from "react";
import { CalendarOff, CheckCircle2, Loader2, RefreshCw, ThumbsDown, ThumbsUp, User } from "lucide-react";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views";
import { MobileShell, TouchCard, BigButton } from "@metaforge/shell";
import { Badge, toast, cn } from "@metaforge/ui";

/**
 * Duyệt nghỉ phép — màn TÁC NGHIỆP (App-mode), không phải Desk.
 *
 * Khác Desk-mode ở mục đích, không chỉ ở kích thước nút: Desk mở ra là một cái bảng để
 * người dùng tự tìm; màn này mở ra là DANH SÁCH VIỆC CẦN LÀM của chính họ, và mỗi thẻ
 * chỉ có đúng những hành động server đang cho phép.
 *
 * KHÔNG DÙNG API RIÊNG NÀO. Toàn bộ chạy trên bề mặt metadata-driven sẵn có:
 *   danh sách   → getList (lọc theo workflow_state)
 *   nút nào bật → getTransitions   ← SERVER quyết, không suy ở client
 *   duyệt/từ chối → applyWorkflow
 * Đó là điều đáng chú ý về kiến trúc: một app nghiệp vụ thật sự chỉ cần khai DocType +
 * workflow, phần còn lại là trình bày. Chỉ nghiệp vụ nào GHI SỔ (như xuất/nhập kho)
 * mới cần endpoint riêng.
 */

const STATE_STYLE: Record<string, string> = {
  "Nháp": "bg-muted text-muted-foreground",
  "Chờ duyệt": "bg-warning/15 text-warning",
  "Đã duyệt": "bg-success/15 text-success",
  "Từ chối": "bg-destructive/15 text-destructive",
};

const DOCTYPE = "Leave Application";

interface Transition { action: string; next_state?: string }

/**
 * A list row carries no `doctype` — `get_list` returns only the fields asked for.
 *
 * Both `get_workflow_transitions` and `apply_workflow` need it to find the workflow at
 * all, and without it the server answers "no workflow" rather than an error: the screen
 * then renders a document with no actions, which looks exactly like "you lack
 * permission". Attached here, once, so neither call site can forget it.
 */
const asDoc = (row: Doc): Doc => ({ ...row, doctype: DOCTYPE });

function StateBadge({ state }: { state?: string }) {
  const label = state || "—";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATE_STYLE[label] ?? "bg-muted text-muted-foreground")}>{label}</span>;
}

function formatRange(from?: unknown, to?: unknown): string {
  const start = String(from ?? "");
  const end = String(to ?? "");
  if (!start) return "—";
  return start === end ? start : `${start} → ${end}`;
}

export function LeaveApprovalExperience({ onExit }: { onExit?: () => void }) {
  const { adapter } = useMetaForge();
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [transitions, setTransitions] = useState<Transition[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // `modified` is requested because every write needs it back as the conflict
      // token — approving a document someone else already changed must fail, not
      // silently overwrite their decision.
      const list = await adapter.getList(DOCTYPE, {
        fields: ["name", "employee", "leave_type", "from_date", "to_date", "total_days", "reason", "workflow_state", "modified"],
        filters: [["workflow_state", "=", "Chờ duyệt"]],
        order_by: "from_date asc",
        limit_page_length: 50,
      });
      setRows(list);
    } catch (caught) {
      setError(adapter.mapError(caught).message);
      setRows([]);
    }
  }, [adapter]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Which buttons to show comes from the SERVER, never from the local state string.
   *
   * A client that renders "Duyệt" whenever it sees "Chờ duyệt" is guessing: whether
   * this user may approve depends on their roles and on `allow_self_approval`, which
   * only the server can decide. Guessing produces a button that fails on tap.
   */
  const open = useCallback(async (row: Doc) => {
    setSelected(row);
    setTransitions(null);
    try {
      const result = await adapter.getTransitions(asDoc(row));
      setTransitions((result.transitions ?? []) as unknown as Transition[]);
    } catch (caught) {
      setTransitions([]);
      toast.error(adapter.mapError(caught).message);
    }
  }, [adapter]);

  const act = useCallback(async (row: Doc, action: string) => {
    setBusy(action);
    try {
      await adapter.applyWorkflow(asDoc(row), action);
      toast.success(`${action}: ${row.name}`);
      setSelected(null);
      await load();
    } catch (caught) {
      toast.error(adapter.mapError(caught).message);
    } finally {
      setBusy(null);
    }
  }, [adapter, load]);

  // ---- detail ---------------------------------------------------------------
  if (selected) {
    const approve = transitions?.find((item) => /duy[ệe]t/i.test(item.action) && !/t[ừu] ch[ốo]i/i.test(item.action));
    const reject = transitions?.find((item) => /t[ừu] ch[ốo]i/i.test(item.action));
    return (
      <MobileShell
        title={String(selected.employee ?? selected.name)}
        subtitle={String(selected.name)}
        onBack={() => setSelected(null)}
        right={<StateBadge state={selected.workflow_state as string} />}
        bottomBar={
          transitions === null ? (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang hỏi quyền thao tác…
            </div>
          ) : transitions.length === 0 ? (
            // Not an error: it is what "you may not act on this one" looks like.
            <p className="py-2 text-center text-sm text-muted-foreground">Bạn không có quyền thao tác trên đơn này</p>
          ) : (
            <div className="flex gap-2">
              {reject ? (
                <BigButton variant="destructive" disabled={Boolean(busy)} onClick={() => void act(selected, reject.action)}>
                  {busy === reject.action ? <Loader2 className="size-5 animate-spin" /> : <ThumbsDown className="size-5" />}
                  {reject.action}
                </BigButton>
              ) : null}
              {approve ? (
                <BigButton disabled={Boolean(busy)} onClick={() => void act(selected, approve.action)}>
                  {busy === approve.action ? <Loader2 className="size-5 animate-spin" /> : <ThumbsUp className="size-5" />}
                  {approve.action}
                </BigButton>
              ) : null}
            </div>
          )
        }
      >
        <div className="space-y-3 p-3">
          <TouchCard>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Nhân viên</dt><dd className="font-medium">{String(selected.employee ?? "—")}</dd>
              <dt className="text-muted-foreground">Loại nghỉ</dt><dd>{String(selected.leave_type ?? "—")}</dd>
              <dt className="text-muted-foreground">Thời gian</dt><dd>{formatRange(selected.from_date, selected.to_date)}</dd>
              <dt className="text-muted-foreground">Số ngày</dt><dd className="font-semibold">{String(selected.total_days ?? "—")}</dd>
            </dl>
          </TouchCard>
          <TouchCard>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Lý do</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{String(selected.reason ?? "—")}</p>
          </TouchCard>
        </div>
      </MobileShell>
    );
  }

  // ---- list -----------------------------------------------------------------
  return (
    <MobileShell
      title="Duyệt nghỉ phép"
      subtitle={rows === null ? "Đang tải…" : `${rows.length} đơn chờ duyệt`}
      onBack={onExit}
      right={
        <button type="button" onClick={() => void load()} aria-label="Tải lại" className="grid size-10 place-items-center rounded-md hover:bg-accent">
          <RefreshCw className="size-5" />
        </button>
      }
    >
      <div className="space-y-3 p-3">
        {error ? <div className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div> : null}

        {rows === null ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>
        ) : rows.length === 0 && !error ? (
          // An empty queue is a GOOD state for this screen, so it reads as "done"
          // rather than as the "no records found" of an empty table.
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <CheckCircle2 className="size-10 text-success" />
            <p className="font-medium text-foreground">Không còn đơn nào chờ duyệt</p>
            <p className="text-sm">Mọi yêu cầu đã được xử lý.</p>
          </div>
        ) : (
          rows.map((row) => (
            <TouchCard key={String(row.name)} onClick={() => void open(row)}>
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><User className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{String(row.employee ?? row.name)}</span>
                    <StateBadge state={row.workflow_state as string} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarOff className="size-3.5" />{formatRange(row.from_date, row.to_date)}</span>
                    <Badge variant="secondary">{String(row.leave_type ?? "—")}</Badge>
                    <span className="font-medium text-foreground">{String(row.total_days ?? "?")} ngày</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{String(row.reason ?? "")}</p>
                </div>
              </div>
            </TouchCard>
          ))
        )}
      </div>
    </MobileShell>
  );
}
