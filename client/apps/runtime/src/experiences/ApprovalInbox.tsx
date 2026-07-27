import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { MobileShell, TouchCard, BigButton } from "@metaforge/shell";
import { Button, toast, cn } from "@metaforge/ui";

/**
 * Approval inbox — an operational (App-mode) screen for ANY doctype with a workflow.
 *
 * The hand-written version of this screen is what used to make an app need its own
 * compiled bundle: one React file per doctype, with the doctype name, the pending
 * state and the display fields typed in by hand. Everything here is instead read from
 * metadata the server already publishes:
 *
 *   which states still need work → `__workflow_docs[0].transitions[].state`
 *   which records are waiting    → getList filtered on the workflow's own state field
 *   which buttons this user gets → getTransitions   ← the SERVER decides, never us
 *   what a card shows            → the doctype's `in_list_view` fields
 *
 * So an app that declares a DocType and a Workflow gets this screen for free, and
 * declaring an app stays a data write rather than a deploy.
 *
 * Guessing any of these client-side is the failure mode being avoided. A screen that
 * renders "Approve" whenever it sees a pending state is guessing: whether THIS user may
 * approve THIS document depends on their roles and on `allow_self_approval`, which only
 * the server knows. A guessed button fails on tap.
 */

interface Transition { action: string; next_state?: string }

interface WorkflowDoc {
  workflow_state_field?: string;
  is_active?: number;
  states?: Array<{ state: string; doc_status?: string }>;
  transitions?: Array<{ state: string; action: string; next_state?: string }>;
}

/** Words that mark a transition as the negative one, in the languages apps are written in. */
const REJECTING = /(reject|decline|deny|cancel|t[ừu]\s*ch[ốo]i|hu[ỷy])/i;

function workflowOf(meta: DocTypeMeta | undefined): WorkflowDoc | null {
  const docs = (meta as unknown as { __workflow_docs?: WorkflowDoc[] } | undefined)?.__workflow_docs;
  return docs?.[0] ?? null;
}

/**
 * The states where work remains: every state some transition can leave.
 *
 * Derived rather than configured because "pending" is not a property an app declares —
 * it is what the workflow graph already says. A terminal state has no outgoing
 * transition, so it drops out on its own, and an app that renames its states or adds a
 * review step keeps working with no change here.
 */
function pendingStates(workflow: WorkflowDoc | null): string[] {
  const states = new Set<string>();
  for (const transition of workflow?.transitions ?? []) if (transition.state) states.add(transition.state);
  return [...states];
}

/** Fields worth putting on a card: what the doctype itself marks for its list view. */
function cardFields(meta: DocTypeMeta | undefined): DocField[] {
  const fields = (meta?.fields ?? []).filter((field) => !field.hidden && field.fieldtype !== "Section Break" && field.fieldtype !== "Column Break");
  const listed = fields.filter((field) => Number(field.in_list_view ?? 0) === 1);
  // An app that marked nothing still needs a readable card, so fall back to the first
  // few scalar fields rather than rendering a row of names with no content.
  return (listed.length ? listed : fields.filter((field) => !["Table", "Text Editor", "Long Text", "Code", "Attach", "Password"].includes(field.fieldtype))).slice(0, 5);
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function ApprovalInbox({ doctype, title, onExit }: { doctype: string; title?: string; onExit?: () => void }) {
  const { adapter } = useMetaForge();
  const [meta, setMeta] = useState<DocTypeMeta>();
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [transitions, setTransitions] = useState<Transition[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const workflow = useMemo(() => workflowOf(meta), [meta]);
  const stateField = workflow?.workflow_state_field ?? "workflow_state";
  const fields = useMemo(() => cardFields(meta), [meta]);
  const titleField = (meta as unknown as { title_field?: string } | undefined)?.title_field;

  /**
   * A list row carries no `doctype` — `get_list` returns only the fields asked for.
   *
   * Both `getTransitions` and `applyWorkflow` need it to find the workflow at all, and
   * without it the server answers "no workflow" rather than an error: the screen then
   * shows a document with no actions, which is indistinguishable from "you lack
   * permission". Attached once here so neither call site can forget it.
   */
  const asDoc = useCallback((row: Doc): Doc => ({ ...row, doctype }), [doctype]);

  const load = useCallback(async (current: DocTypeMeta | undefined) => {
    setError(null);
    const wf = workflowOf(current);
    const waiting = pendingStates(wf);
    if (!waiting.length) { setRows([]); return; }
    const field = wf?.workflow_state_field ?? "workflow_state";
    const wanted = new Set<string>(["name", field, "modified"]);
    for (const entry of cardFields(current)) wanted.add(entry.fieldname);
    const title = (current as unknown as { title_field?: string } | undefined)?.title_field;
    if (title) wanted.add(title);
    try {
      // `modified` is requested because every write needs it back as the conflict
      // token — approving a document someone else already changed must fail rather
      // than silently overwrite their decision.
      setRows(await adapter.getList(doctype, {
        fields: [...wanted],
        filters: [[field, "in", waiting]],
        // `orderBy`/`pageLength`, NOT the wire names `order_by`/`limit_page_length`.
        // The adapter translates these; passing the wire spelling type-errors, and if
        // the error is ignored the options are silently dropped — the queue then comes
        // back unsorted and capped by the server default, which looks like working code.
        orderBy: "modified asc",
        pageLength: 50,
      }));
    } catch (caught) {
      setError(adapter.mapError(caught).message);
      setRows([]);
    }
  }, [adapter, doctype]);

  useEffect(() => {
    let alive = true;
    setMeta(undefined);
    setRows(null);
    setSelected(null);
    adapter.getMeta(doctype)
      .then(async (value) => { if (!alive) return; setMeta(value); await load(value); })
      .catch((caught) => { if (alive) { setError(adapter.mapError(caught).message); setRows([]); } });
    return () => { alive = false; };
  }, [adapter, doctype, load]);

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
  }, [adapter, asDoc]);

  const act = useCallback(async (row: Doc, action: string) => {
    setBusy(action);
    try {
      await adapter.applyWorkflow(asDoc(row), action);
      toast.success(`${action}: ${row.name}`);
      setSelected(null);
      await load(meta);
    } catch (caught) {
      toast.error(adapter.mapError(caught).message);
    } finally {
      setBusy(null);
    }
  }, [adapter, asDoc, load, meta]);

  const heading = (row: Doc) => display(titleField ? row[titleField] : row.name);

  // ---- detail ---------------------------------------------------------------
  if (selected) {
    const positive = transitions?.filter((item) => !REJECTING.test(item.action)) ?? [];
    const negative = transitions?.filter((item) => REJECTING.test(item.action)) ?? [];
    return (
      <MobileShell
        title={heading(selected)}
        subtitle={String(selected.name)}
        onBack={() => setSelected(null)}
        right={<StateChip state={selected[stateField] as string} />}
        bottomBar={
          transitions === null ? (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang hỏi quyền thao tác…
            </div>
          ) : transitions.length === 0 ? (
            // Not an error: it is what "you may not act on this one" looks like.
            <p className="py-2 text-center text-sm text-muted-foreground">Bạn không có quyền thao tác trên hồ sơ này</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {negative.map((item) => (
                <BigButton key={item.action} variant="destructive" disabled={Boolean(busy)} onClick={() => void act(selected, item.action)}>
                  {busy === item.action ? <Loader2 className="size-5 animate-spin" /> : <ThumbsDown className="size-5" />}
                  {item.action}
                </BigButton>
              ))}
              {positive.map((item) => (
                <BigButton key={item.action} disabled={Boolean(busy)} onClick={() => void act(selected, item.action)}>
                  {busy === item.action ? <Loader2 className="size-5 animate-spin" /> : <ThumbsUp className="size-5" />}
                  {item.action}
                </BigButton>
              ))}
            </div>
          )
        }
      >
        <div className="space-y-3 p-3">
          <TouchCard>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {fields.map((field) => (
                <div key={field.fieldname} className="contents">
                  <dt className="text-muted-foreground">{field.label ?? field.fieldname}</dt>
                  <dd className="font-medium">{display(selected[field.fieldname])}</dd>
                </div>
              ))}
            </dl>
          </TouchCard>
        </div>
      </MobileShell>
    );
  }

  // ---- list -----------------------------------------------------------------
  const noWorkflow = meta && !pendingStates(workflow).length;
  return (
    <MobileShell
      title={title ?? doctype}
      subtitle={rows === null ? "Đang tải…" : `${rows.length} hồ sơ chờ xử lý`}
      onBack={onExit}
      right={
        <Button type="button" variant="ghost" size="icon" onClick={() => void load(meta)} aria-label="Tải lại" className="size-10">
          <RefreshCw className="size-5" />
        </Button>
      }
    >
      <div className="space-y-3 p-3">
        {error ? <div className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div> : null}

        {noWorkflow ? (
          // Said plainly, because the fix is in the app package rather than on this
          // screen: an inbox over a doctype with no workflow has nothing to offer.
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <FileText className="size-10" />
            <p className="font-medium text-foreground">{title ?? doctype} chưa có workflow</p>
            <p className="text-sm">Màn duyệt cần một workflow đang bật để biết hồ sơ nào còn chờ.</p>
          </div>
        ) : rows === null ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>
        ) : rows.length === 0 && !error ? (
          // An empty queue is a GOOD state here, so it reads as "done" rather than as
          // the "no records found" of an empty table.
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <CheckCircle2 className="size-10 text-success" />
            <p className="font-medium text-foreground">Không còn hồ sơ nào chờ xử lý</p>
            <p className="text-sm">Mọi yêu cầu đã được giải quyết.</p>
          </div>
        ) : (
          rows.map((row) => (
            <TouchCard key={String(row.name)} onClick={() => void open(row)}>
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{heading(row)}</span>
                <StateChip state={row[stateField] as string} />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {fields.filter((field) => field.fieldname !== titleField).slice(0, 4).map((field) => (
                  <div key={field.fieldname} className="min-w-0">
                    <dt className="truncate text-xs text-muted-foreground">{field.label ?? field.fieldname}</dt>
                    <dd className="truncate">{display(row[field.fieldname])}</dd>
                  </div>
                ))}
              </dl>
            </TouchCard>
          ))
        )}
      </div>
    </MobileShell>
  );
}

const STATE_STYLE: Array<[RegExp, string]> = [
  [REJECTING, "bg-destructive/15 text-destructive"],
  [/(approve|đã duy[ệe]t|hoàn thành|complete)/i, "bg-success/15 text-success"],
  [/(pending|ch[ờo]|submitted|review)/i, "bg-warning/15 text-warning"],
];

function StateChip({ state }: { state?: string }) {
  const label = state || "—";
  const style = STATE_STYLE.find(([pattern]) => pattern.test(label))?.[1] ?? "bg-muted text-muted-foreground";
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", style)}>{label}</span>;
}
