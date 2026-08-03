/** @jsxImportSource react */
import { Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metaforge/ui";
import { useEffect } from "react";
import { useBuilder } from "../kernel.js";
import {
  newApprovalStage,
  validateApprovalPlan,
  type ApprovalPlanModel,
  type ApprovalSelectorModel,
  type ApprovalStageMode,
} from "./approval-plan.js";

export interface ApprovalPlanBuilderProps {
  initial: ApprovalPlanModel;
  onChange?: (model: ApprovalPlanModel) => void;
  onSave?: (model: ApprovalPlanModel) => void;
  saving?: boolean;
}

function selectorKind(selector: ApprovalSelectorModel): "role" | "user" {
  return selector.user ? "user" : "role";
}

function selectorValue(selector: ApprovalSelectorModel): string {
  return selector.user ?? selector.role ?? "";
}

export function ApprovalPlanBuilder(props: ApprovalPlanBuilderProps) {
  const b = useBuilder<ApprovalPlanModel>(props.initial);
  const model = b.model;
  const validation = validateApprovalPlan(model);

  useEffect(() => {
    props.onChange?.(model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const patchStage = (stageIndex: number, patch: Partial<ApprovalPlanModel["stages"][number]>) => {
    b.set({ ...model, stages: model.stages.map((stage, index) => index === stageIndex ? { ...stage, ...patch } : stage) });
  };

  const patchSelector = (stageIndex: number, selectorIndex: number, selector: ApprovalSelectorModel) => {
    const stage = model.stages[stageIndex]!;
    patchStage(stageIndex, { approvers: stage.approvers.map((entry, index) => index === selectorIndex ? selector : entry) });
  };

  return (
    <div className="mf-builder mf-approval-plan-builder space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        <label className="ml-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={model.distinctActorAcrossStages}
            onChange={(event) => b.set({ ...model, distinctActorAcrossStages: event.target.checked })}
          />
          Không dùng lại người duyệt giữa các bước
        </label>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => props.onSave?.(model)}
          disabled={props.saving || !validation.ok}
        >Lưu luồng duyệt</Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Các bước phê duyệt</h4>
          <p className="text-xs text-muted-foreground">Mỗi bước chạy tuần tự; bên trong một bước có thể duyệt song song theo any, all hoặc quorum.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => b.set({ ...model, stages: [...model.stages, newApprovalStage(model.stages.length)] })}>
          <Plus className="size-4" /> Thêm bước
        </Button>
      </div>

      <div className="space-y-3">
        {model.stages.map((stage, stageIndex) => (
          <section key={`${stage.key}-${stageIndex}`} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-36" value={stage.key} onChange={(event) => patchStage(stageIndex, { key: event.target.value })} placeholder="stage-key" />
              <Input className="min-w-44 flex-1" value={stage.label} onChange={(event) => patchStage(stageIndex, { label: event.target.value })} placeholder="Tên bước" />
              <Select value={stage.mode} onValueChange={(value) => patchStage(stageIndex, {
                mode: value as ApprovalStageMode,
                ...(value === "quorum" ? { quorum: stage.quorum ?? 1 } : { quorum: undefined }),
              })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="quorum">Quorum</SelectItem>
                </SelectContent>
              </Select>
              {stage.mode === "quorum" ? (
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  max={50}
                  value={stage.quorum ?? 1}
                  onChange={(event) => patchStage(stageIndex, { quorum: Number(event.target.value) })}
                  aria-label={`Quorum ${stage.label}`}
                />
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => b.set({ ...model, stages: model.stages.filter((_, index) => index !== stageIndex) })}
                aria-label={`Xoá bước ${stage.label}`}
              ><Trash2 /></Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Người duyệt</span>
                <Button variant="ghost" size="sm" onClick={() => patchStage(stageIndex, { approvers: [...stage.approvers, { role: "System Manager" }] })}>
                  <Plus className="size-3.5" /> Approver
                </Button>
              </div>
              {stage.approvers.map((selector, selectorIndex) => {
                const kind = selectorKind(selector);
                return (
                  <div key={selectorIndex} className="flex items-center gap-2">
                    <Select value={kind} onValueChange={(value) => patchSelector(stageIndex, selectorIndex, value === "user" ? { user: "" } : { role: "" })}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="role">Role</SelectItem><SelectItem value="user">User</SelectItem></SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={selectorValue(selector)}
                      onChange={(event) => patchSelector(stageIndex, selectorIndex, kind === "user" ? { user: event.target.value } : { role: event.target.value })}
                      placeholder={kind === "user" ? "user@example.com" : "Finance Manager"}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => patchStage(stageIndex, { approvers: stage.approvers.filter((_, index) => index !== selectorIndex) })}
                      aria-label="Xoá approver"
                    ><Trash2 /></Button>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">SLA phút</span>
                <Input
                  className="w-28"
                  type="number"
                  min={1}
                  max={525600}
                  value={stage.dueAfterMinutes ?? ""}
                  onChange={(event) => patchStage(stageIndex, {
                    dueAfterMinutes: event.target.value ? Number(event.target.value) : undefined,
                    ...(event.target.value ? {} : { escalations: [] }),
                  })}
                  placeholder="Không SLA"
                />
                {stage.dueAfterMinutes ? (
                  <Button variant="ghost" size="sm" onClick={() => patchStage(stageIndex, {
                    escalations: [...(stage.escalations ?? []), {
                      key: `escalation-${(stage.escalations?.length ?? 0) + 1}`,
                      afterMinutes: stage.dueAfterMinutes! + 60,
                    }],
                  })}><Plus className="size-3.5" /> Escalation</Button>
                ) : null}
              </div>
              {(stage.escalations ?? []).map((escalation, escalationIndex) => (
                <div key={escalationIndex} className="flex items-center gap-2 pl-20">
                  <Input
                    className="w-40"
                    value={escalation.key}
                    onChange={(event) => patchStage(stageIndex, { escalations: stage.escalations!.map((entry, index) => index === escalationIndex ? { ...entry, key: event.target.value } : entry) })}
                    placeholder="escalation-key"
                  />
                  <Input
                    className="w-28"
                    type="number"
                    min={(stage.dueAfterMinutes ?? 0) + 1}
                    value={escalation.afterMinutes}
                    onChange={(event) => patchStage(stageIndex, { escalations: stage.escalations!.map((entry, index) => index === escalationIndex ? { ...entry, afterMinutes: Number(event.target.value) } : entry) })}
                    aria-label={`Escalation phút ${escalation.key}`}
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => patchStage(stageIndex, { escalations: stage.escalations!.filter((_, index) => index !== escalationIndex) })} aria-label="Xoá escalation"><Trash2 /></Button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!validation.ok || validation.issues.some((entry) => entry.severity === "warning") ? (
        <div className="rounded-md border p-3 text-xs" role="status">
          {validation.issues.map((entry, index) => (
            <div key={`${entry.code}-${index}`} className={entry.severity === "error" ? "text-destructive" : "text-muted-foreground"}>
              {entry.path}: {entry.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
