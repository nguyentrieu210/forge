/** @jsxImportSource react */
/**
 * WorkflowBuilder (M18) — soạn Workflow: states (+ doc_status) & transitions (state→action→next_state, role).
 * Sinh WorkflowDef → adapter.saveWorkflow (Workflow + Workflow Document State + Workflow Transition).
 * Đồ thị node (React Flow) = PHA 6; ở đây editor bảng + preview SVG đơn giản.
 */
import { useEffect, useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { Undo2, Redo2, Plus, X } from "lucide-react";
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
        position: { x: (i % 4) * 180, y: Math.floor(i / 4) * 110 },
        data: { label: `${s.state}\n(${DOC_STATUS_LABEL[s.doc_status]})` },
        style: { whiteSpace: "pre-line", fontSize: 12, border: "1px solid #888", borderRadius: 6, padding: 6 },
      })),
    [m.states],
  );
  const edges: Edge[] = useMemo(
    () => m.transitions.map((t, i) => ({ id: `e${i}`, source: t.state, target: t.next_state, label: t.action, animated: true })),
    [m.transitions],
  );
  const addState = () => b.set({ ...m, states: [...m.states, { state: `State ${m.states.length + 1}`, doc_status: 0 }] });
  const addTransition = () =>
    b.set({ ...m, transitions: [...m.transitions, { state: m.states[0]?.state ?? "", action: "Approve", next_state: m.states[0]?.state ?? "", allowed: "System Manager" }] });

  return (
    <div className="mf-builder mf-workflow-builder space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-48" value={m.document_type} onChange={(e) => b.set({ ...m, document_type: e.target.value })} placeholder="DocType" />
        <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        <Button size="sm" className="ml-auto" onClick={() => props.onSave?.(m)} disabled={props.saving}>Lưu Workflow</Button>
      </div>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-medium">Trạng thái <Button variant="outline" size="sm" onClick={addState}><Plus /> Thêm</Button></h4>
        {m.states.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={s.state} onChange={(e) => b.set({ ...m, states: m.states.map((x, j) => (j === i ? { ...x, state: e.target.value } : x)) })} />
            <Select value={String(s.doc_status)} onValueChange={(v) => b.set({ ...m, states: m.states.map((x, j) => (j === i ? { ...x, doc_status: Number(v) as 0 | 1 | 2 } : x)) })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Draft</SelectItem>
                <SelectItem value="1">Submitted</SelectItem>
                <SelectItem value="2">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => b.set({ ...m, states: m.states.filter((_, j) => j !== i) })} aria-label="Xoá"><X /></Button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-medium">Chuyển tiếp <Button variant="outline" size="sm" onClick={addTransition} disabled={m.states.length === 0}><Plus /> Thêm</Button></h4>
        {m.transitions.map((t, i) => {
          const patch = (p: Partial<WFTransition>) => b.set({ ...m, transitions: m.transitions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select value={t.state} onValueChange={(v) => patch({ state: v })}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Từ" /></SelectTrigger>
                <SelectContent>{m.states.map((s) => <SelectItem key={s.state} value={s.state}>{s.state}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="w-24" value={t.action} onChange={(e) => patch({ action: e.target.value })} placeholder="Action" />
              <span className="text-muted-foreground">→</span>
              <Select value={t.next_state} onValueChange={(v) => patch({ next_state: v })}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Đến" /></SelectTrigger>
                <SelectContent>{m.states.map((s) => <SelectItem key={s.state} value={s.state}>{s.state}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="w-32" value={t.allowed} onChange={(e) => patch({ allowed: e.target.value })} placeholder="Role" />
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => b.set({ ...m, transitions: m.transitions.filter((_, j) => j !== i) })} aria-label="Xoá"><X /></Button>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">Sơ đồ</h4>
        <div className="mf-wf-flow rounded-md border" style={{ height: 280 }}>
          <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </section>
    </div>
  );
}
