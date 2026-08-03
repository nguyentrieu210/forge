/** @jsxImportSource react */
/**
 * WorkflowBuilder (M18) — soạn Workflow: states (+ doc_status) & transitions (state→action→next_state, role).
 * Sinh WorkflowDef → adapter.saveWorkflow (Workflow + Workflow Document State + Workflow Transition).
 */
import { useEffect, useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { ArrowRight, CircleDot, GitBranch, Plus, Redo2, Save, Undo2, X } from "lucide-react";
import { Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@metaforge/ui";
import { useBuilder } from "../kernel.js";

export interface WFState {
  state: string;
  doc_status: 0 | 1 | 2;
}
export interface WFTransition {
  state: string;
  action: string;
  next_state: string;
  allowed: string;
}
export interface WorkflowModel {
  name: string;
  document_type: string;
  workflow_state_field: string;
  states: WFState[];
  transitions: WFTransition[];
}

export function blankWorkflow(document_type = ""): WorkflowModel {
  return { name: `${document_type} Workflow`, document_type, workflow_state_field: "workflow_state", states: [], transitions: [] };
}

export interface WorkflowBuilderProps {
  initial: WorkflowModel;
  onChange?: (wf: WorkflowModel) => void;
  onSave?: (wf: WorkflowModel) => void;
  saving?: boolean;
}

const DOC_STATUS_LABEL = ["Draft", "Submitted", "Cancelled"];

export function WorkflowBuilder(props: WorkflowBuilderProps) {
  const b = useBuilder<WorkflowModel>(props.initial);
  useEffect(() => {
    props.onChange?.(b.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.model]);

  const m = b.model;

  const nodes: Node[] = useMemo(
    () =>
      m.states.map((s, i) => ({
        id: s.state,
        position: { x: (i % 3) * 210, y: Math.floor(i / 3) * 125 },
        data: { label: `${s.state}\n${DOC_STATUS_LABEL[s.doc_status]}` },
        style: {
          whiteSpace: "pre-line",
          fontSize: 12,
          lineHeight: 1.45,
          color: "var(--foreground)",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "9px 12px",
          boxShadow: "0 8px 24px rgba(0,0,0,.06)",
        },
      })),
    [m.states],
  );
  const edges: Edge[] = useMemo(
    () => m.transitions.map((t, i) => ({ id: `e${i}`, source: t.state, target: t.next_state, label: t.action, animated: true, type: "smoothstep" })),
    [m.transitions],
  );
  const addState = () => b.set({ ...m, states: [...m.states, { state: `State ${m.states.length + 1}`, doc_status: 0 }] });
  const addTransition = () =>
    b.set({ ...m, transitions: [...m.transitions, { state: m.states[0]?.state ?? "", action: "Approve", next_state: m.states[0]?.state ?? "", allowed: "System Manager" }] });

  return (
    <div className="mf-builder overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="border-b bg-card/95 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 hidden size-9 place-items-center rounded-xl bg-primary/10 text-primary sm:grid"><GitBranch className="size-4" /></div>
          <Input className="h-9 min-w-44 flex-1 font-semibold sm:max-w-64" value={m.name} onChange={(e) => b.set({ ...m, name: e.target.value })} placeholder="Tên Workflow" />
          <Input className="h-9 min-w-36 flex-1 sm:max-w-48" value={m.document_type} onChange={(e) => b.set({ ...m, document_type: e.target.value })} placeholder="DocType" />
          <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground lg:flex">
            <span className="rounded-full border bg-muted/40 px-2 py-1">{m.states.length} trạng thái</span>
            <span className="rounded-full border bg-muted/40 px-2 py-1">{m.transitions.length} chuyển tiếp</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
            <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
            <Button size="sm" className="ml-1 gap-1.5" onClick={() => props.onSave?.(m)} disabled={props.saving}><Save className="size-3.5" /> {props.saving ? "Đang lưu…" : "Lưu Workflow"}</Button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[38rem] grid-cols-1 lg:grid-cols-[minmax(20rem,0.95fr)_minmax(24rem,1.35fr)]">
        <div className="min-w-0 border-b bg-muted/20 lg:border-b-0 lg:border-r">
          <section className="border-b p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"><CircleDot className="size-3.5" /></div>
              <div>
                <h3 className="text-xs font-semibold">Trạng thái</h3>
                <p className="text-[10px] text-muted-foreground">Các điểm kiểm soát vòng đời chứng từ.</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={addState}><Plus className="size-3.5" /> Thêm</Button>
            </div>
            {m.states.length ? (
              <div className="space-y-2">
                {m.states.map((s, i) => (
                  <div key={i} className="group grid grid-cols-[minmax(0,1fr)_8.5rem_auto] items-center gap-2 rounded-xl border bg-card p-2 transition hover:border-primary/30 hover:shadow-sm">
                    <Input className="h-8 min-w-0 text-xs font-medium" value={s.state} onChange={(e) => b.set({ ...m, states: m.states.map((x, j) => (j === i ? { ...x, state: e.target.value } : x)) })} />
                    <Select value={String(s.doc_status)} onValueChange={(v) => b.set({ ...m, states: m.states.map((x, j) => (j === i ? { ...x, doc_status: Number(v) as 0 | 1 | 2 } : x)) })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Draft</SelectItem>
                        <SelectItem value="1">Submitted</SelectItem>
                        <SelectItem value="2">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => b.set({ ...m, states: m.states.filter((_, j) => j !== i) })} aria-label="Xoá trạng thái"><X /></Button>
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" onClick={addState} className="grid min-h-28 w-full place-items-center rounded-xl border border-dashed bg-card/60 p-4 text-center transition hover:border-primary/40 hover:bg-primary/[0.03]">
                <span><Plus className="mx-auto size-5 text-primary" /><span className="mt-1 block text-xs font-medium">Thêm trạng thái đầu tiên</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Ví dụ: Nháp → Chờ duyệt → Đã duyệt</span></span>
              </button>
            )}
          </section>

          <section className="p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"><ArrowRight className="size-3.5" /></div>
              <div>
                <h3 className="text-xs font-semibold">Chuyển tiếp</h3>
                <p className="text-[10px] text-muted-foreground">Ai được thực hiện hành động và đi tới đâu.</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={addTransition} disabled={m.states.length === 0}><Plus className="size-3.5" /> Thêm</Button>
            </div>
            {m.transitions.length ? (
              <div className="space-y-2">
                {m.transitions.map((t, i) => {
                  const patch = (p: Partial<WFTransition>) => b.set({ ...m, transitions: m.transitions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                  return (
                    <div key={i} className="rounded-xl border bg-card p-2.5 transition hover:border-primary/30 hover:shadow-sm">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
                        <Select value={t.state} onValueChange={(v) => patch({ state: v })}>
                          <SelectTrigger className="h-8 min-w-0 text-xs"><SelectValue placeholder="Từ" /></SelectTrigger>
                          <SelectContent>{m.states.map((s) => <SelectItem key={s.state} value={s.state}>{s.state}</SelectItem>)}</SelectContent>
                        </Select>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                        <Select value={t.next_state} onValueChange={(v) => patch({ next_state: v })}>
                          <SelectTrigger className="h-8 min-w-0 text-xs"><SelectValue placeholder="Đến" /></SelectTrigger>
                          <SelectContent>{m.states.map((s) => <SelectItem key={s.state} value={s.state}>{s.state}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => b.set({ ...m, transitions: m.transitions.filter((_, j) => j !== i) })} aria-label="Xoá chuyển tiếp"><X /></Button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Hành động<Input className="mt-1 h-8 text-xs" value={t.action} onChange={(e) => patch({ action: e.target.value })} placeholder="Approve" /></label>
                        <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Vai trò<Input className="mt-1 h-8 text-xs" value={t.allowed} onChange={(e) => patch({ allowed: e.target.value })} placeholder="System Manager" /></label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-card/60 p-4 text-center text-[10px] leading-4 text-muted-foreground">Thêm ít nhất một trạng thái rồi tạo chuyển tiếp để nối quy trình.</div>
            )}
          </section>
        </div>

        <section className="min-w-0 bg-background/60 p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2">
            <div>
              <h3 className="text-xs font-semibold">Sơ đồ quy trình</h3>
              <p className="text-[10px] text-muted-foreground">Canvas tự cập nhật theo trạng thái và chuyển tiếp bên trái.</p>
            </div>
            <span className="ml-auto rounded-full border bg-card px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Live graph</span>
          </div>
          <div className="h-[34rem] overflow-hidden rounded-2xl border bg-card shadow-inner">
            {m.states.length ? (
              <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
                <Background gap={20} size={1} />
                <Controls />
              </ReactFlow>
            ) : (
              <div className="grid h-full place-items-center p-8 text-center">
                <div><GitBranch className="mx-auto size-9 text-muted-foreground/40" /><h3 className="mt-3 text-sm font-semibold">Graph đang trống</h3><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Tạo trạng thái ở panel bên trái. Node graph sẽ xuất hiện ở đây mà không cần cấu hình canvas riêng.</p></div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
