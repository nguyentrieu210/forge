/** @jsxImportSource react */
import { Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { Button, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metaforge/ui";
import { useEffect } from "react";
import { useBuilder } from "../kernel.js";
import {
  newDecisionRule,
  validateDecisionRuleSet,
  type DecisionRuleOperator,
  type DecisionRuleSetModel,
} from "./decision-rule.js";

export interface DecisionRuleBuilderProps {
  initial: DecisionRuleSetModel;
  fields?: string[];
  onChange?: (model: DecisionRuleSetModel) => void;
  onSave?: (model: DecisionRuleSetModel) => void;
  saving?: boolean;
}

const OPERATORS: Array<{ value: DecisionRuleOperator; label: string }> = [
  { value: "eq", label: "=" }, { value: "ne", label: "≠" },
  { value: "gt", label: ">" }, { value: "gte", label: "≥" },
  { value: "lt", label: "<" }, { value: "lte", label: "≤" },
  { value: "in", label: "in" }, { value: "not_in", label: "not in" },
  { value: "exists", label: "exists" },
];

export function DecisionRuleBuilder(props: DecisionRuleBuilderProps) {
  const b = useBuilder<DecisionRuleSetModel>(props.initial);
  const model = b.model;
  const knownFields = props.fields?.length ? new Set(props.fields) : undefined;
  const validation = validateDecisionRuleSet(model, knownFields);

  useEffect(() => { props.onChange?.(model); }, [model, props]);

  const patchRule = (ruleIndex: number, patch: Partial<DecisionRuleSetModel["rules"][number]>) => {
    b.set({ rules: model.rules.map((rule, index) => index === ruleIndex ? { ...rule, ...patch } : rule) });
  };

  return (
    <div className="mf-builder mf-decision-rule-builder space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        <Button variant="outline" size="sm" onClick={() => b.set({ rules: [...model.rules, newDecisionRule(model.rules.length)] })}>
          <Plus className="size-4" /> Thêm rule
        </Button>
        <Button className="ml-auto" size="sm" disabled={props.saving || !validation.ok} onClick={() => props.onSave?.(model)}>Lưu rule set</Button>
      </div>

      <div className="space-y-3">
        {model.rules.map((rule, ruleIndex) => (
          <section key={`${rule.key}-${ruleIndex}`} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-40" value={rule.key} onChange={(event) => patchRule(ruleIndex, { key: event.target.value })} placeholder="rule-key" />
              <Input className="w-20" type="number" min={1} value={rule.version} onChange={(event) => patchRule(ruleIndex, { version: Number(event.target.value) })} aria-label="Version" />
              <Input className="w-24" type="number" value={rule.priority} onChange={(event) => patchRule(ruleIndex, { priority: Number(event.target.value) })} aria-label="Priority" />
              <Select value={rule.logic} onValueChange={(value) => patchRule(ruleIndex, { logic: value as "all" | "any" })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Tất cả điều kiện</SelectItem><SelectItem value="any">Một điều kiện</SelectItem></SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={rule.active} onChange={(event) => patchRule(ruleIndex, { active: event.target.checked })} /> Active</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={rule.stop} onChange={(event) => patchRule(ruleIndex, { stop: event.target.checked })} /> Stop khi match</label>
              <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => b.set({ rules: model.rules.filter((_, index) => index !== ruleIndex) })} aria-label={`Xoá rule ${rule.key}`}><Trash2 /></Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={rule.effectiveFrom ?? ""} onChange={(event) => patchRule(ruleIndex, { effectiveFrom: event.target.value || undefined })} aria-label="Hiệu lực từ" />
              <Input type="date" value={rule.effectiveTo ?? ""} onChange={(event) => patchRule(ruleIndex, { effectiveTo: event.target.value || undefined })} aria-label="Hiệu lực đến" />
            </div>

            <div className="space-y-2">
              {rule.conditions.map((condition, conditionIndex) => (
                <div key={conditionIndex} className="flex flex-wrap items-center gap-2">
                  {props.fields?.length ? (
                    <Select value={condition.field || undefined} onValueChange={(value) => patchRule(ruleIndex, { conditions: rule.conditions.map((entry, index) => index === conditionIndex ? { ...entry, field: value } : entry) })}>
                      <SelectTrigger className="min-w-44 flex-1"><SelectValue placeholder="Field" /></SelectTrigger>
                      <SelectContent>{props.fields.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input className="min-w-40 flex-1" value={condition.field} onChange={(event) => patchRule(ruleIndex, { conditions: rule.conditions.map((entry, index) => index === conditionIndex ? { ...entry, field: event.target.value } : entry) })} placeholder="field_name" />
                  )}
                  <Select value={condition.operator} onValueChange={(value) => patchRule(ruleIndex, { conditions: rule.conditions.map((entry, index) => index === conditionIndex ? { ...entry, operator: value as DecisionRuleOperator } : entry) })}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {condition.operator === "exists" ? (
                    <Select value={condition.value ?? "true"} onValueChange={(value) => patchRule(ruleIndex, { conditions: rule.conditions.map((entry, index) => index === conditionIndex ? { ...entry, value } : entry) })}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="true">Có giá trị</SelectItem><SelectItem value="false">Không có</SelectItem></SelectContent>
                    </Select>
                  ) : (
                    <Input className="min-w-36 flex-1" value={condition.value ?? ""} onChange={(event) => patchRule(ruleIndex, { conditions: rule.conditions.map((entry, index) => index === conditionIndex ? { ...entry, value: event.target.value } : entry) })} placeholder={condition.operator === "in" || condition.operator === "not_in" ? "A, B, C" : "Giá trị"} />
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => patchRule(ruleIndex, { conditions: rule.conditions.filter((_, index) => index !== conditionIndex) })} aria-label="Xoá điều kiện"><Trash2 /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => patchRule(ruleIndex, { conditions: [...rule.conditions, { field: "", operator: "eq", value: "" }] })}><Plus className="size-3.5" /> Điều kiện</Button>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Outcome JSON</div>
              <Textarea value={rule.outcomeJson} onChange={(event) => patchRule(ruleIndex, { outcomeJson: event.target.value })} className="min-h-20 font-mono text-xs" placeholder='{"route":"director"}' />
            </div>
          </section>
        ))}
      </div>

      {validation.issues.length ? (
        <div className="rounded-md border p-3 text-xs" role="status">
          {validation.issues.map((entry, index) => <div key={`${entry.code}-${index}`} className={entry.severity === "error" ? "text-destructive" : "text-muted-foreground"}>{entry.path}: {entry.message}</div>)}
        </div>
      ) : null}
    </div>
  );
}
