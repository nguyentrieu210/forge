/** @jsxImportSource react */
import { Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metaforge/ui";
import { useEffect } from "react";
import { useBuilder } from "../kernel.js";
import {
  newFormulaRule,
  validateFormulaRuleSet,
  type FormulaOperandKind,
  type FormulaRuleSetModel,
  type FormulaStepOperator,
} from "./formula-rule.js";

export interface FormulaBuilderProps {
  initial: FormulaRuleSetModel;
  fields?: string[];
  onChange?: (model: FormulaRuleSetModel) => void;
  onSave?: (model: FormulaRuleSetModel) => void;
  saving?: boolean;
}

const STEP_OPS: Array<{ value: FormulaStepOperator; label: string }> = [
  { value: "add", label: "+" },
  { value: "sub", label: "−" },
  { value: "mul", label: "×" },
  { value: "div", label: "÷" },
];

function OperandEditor(props: {
  kind: FormulaOperandKind;
  value: string;
  fields?: string[];
  onChange: (next: { kind: FormulaOperandKind; value: string }) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Select value={props.kind} onValueChange={(value) => props.onChange({ kind: value as FormulaOperandKind, value: "" })}>
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="field">Field</SelectItem>
          <SelectItem value="const">Hằng số</SelectItem>
          <SelectItem value="formula">Formula</SelectItem>
        </SelectContent>
      </Select>
      {props.kind === "field" && props.fields?.length ? (
        <Select value={props.value || undefined} onValueChange={(value) => props.onChange({ kind: "field", value })}>
          <SelectTrigger className="min-w-40 flex-1"><SelectValue placeholder="Chọn field" /></SelectTrigger>
          <SelectContent>{props.fields.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Input
          className="min-w-36 flex-1"
          value={props.value}
          onChange={(event) => props.onChange({ kind: props.kind, value: event.target.value })}
          placeholder={props.kind === "field" ? "amount" : props.kind === "formula" ? "subtotal" : "10.25"}
        />
      )}
    </div>
  );
}

export function FormulaBuilder(props: FormulaBuilderProps) {
  const b = useBuilder<FormulaRuleSetModel>(props.initial);
  const model = b.model;
  const knownFields = props.fields?.length ? new Set(props.fields) : undefined;
  const validation = validateFormulaRuleSet(model, knownFields);

  useEffect(() => { props.onChange?.(model); }, [model, props.onChange]);

  const patchFormula = (formulaIndex: number, patch: Partial<FormulaRuleSetModel["formulas"][number]>) => {
    b.set({ formulas: model.formulas.map((formula, index) => index === formulaIndex ? { ...formula, ...patch } : formula) });
  };

  return (
    <div className="mf-builder mf-formula-builder space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={b.undo} disabled={!b.canUndo} aria-label="Hoàn tác"><Undo2 /></Button>
        <Button variant="outline" size="icon-sm" onClick={b.redo} disabled={!b.canRedo} aria-label="Làm lại"><Redo2 /></Button>
        <Button variant="outline" size="sm" onClick={() => b.set({ formulas: [...model.formulas, newFormulaRule(model.formulas.length)] })}>
          <Plus className="size-4" /> Thêm formula
        </Button>
        <Button className="ml-auto" size="sm" disabled={props.saving || !validation.ok} onClick={() => props.onSave?.(model)}>Lưu formula set</Button>
      </div>

      <div className="space-y-3">
        {model.formulas.map((formula, formulaIndex) => (
          <section key={`${formula.key}-${formulaIndex}`} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-40" value={formula.key} onChange={(event) => patchFormula(formulaIndex, { key: event.target.value })} placeholder="formula-key" />
              <Input className="w-20" type="number" min={1} value={formula.version} onChange={(event) => patchFormula(formulaIndex, { version: Number(event.target.value) })} aria-label="Version" />
              <Input className="w-20" type="number" min={0} max={8} value={formula.scale} onChange={(event) => patchFormula(formulaIndex, { scale: Number(event.target.value) })} aria-label="Scale" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={formula.active} onChange={(event) => patchFormula(formulaIndex, { active: event.target.checked })} /> Active</label>
              <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => b.set({ formulas: model.formulas.filter((_, index) => index !== formulaIndex) })} aria-label={`Xoá formula ${formula.key}`}><Trash2 /></Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={formula.effectiveFrom ?? ""} onChange={(event) => patchFormula(formulaIndex, { effectiveFrom: event.target.value || undefined })} aria-label="Hiệu lực từ" />
              <Input type="date" value={formula.effectiveTo ?? ""} onChange={(event) => patchFormula(formulaIndex, { effectiveTo: event.target.value || undefined })} aria-label="Hiệu lực đến" />
            </div>

            <div className="space-y-2 rounded-md bg-muted/20 p-2">
              <div className="text-xs font-medium text-muted-foreground">Biểu thức trái sang phải</div>
              <OperandEditor kind={formula.start.kind} value={formula.start.value} fields={props.fields} onChange={(start) => patchFormula(formulaIndex, { start })} />
              {formula.steps.map((step, stepIndex) => (
                <div key={stepIndex} className="flex items-center gap-2">
                  <Select value={step.operator} onValueChange={(value) => patchFormula(formulaIndex, { steps: formula.steps.map((entry, index) => index === stepIndex ? { ...entry, operator: value as FormulaStepOperator } : entry) })}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{STEP_OPS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <OperandEditor
                    kind={step.operand.kind}
                    value={step.operand.value}
                    fields={props.fields}
                    onChange={(operand) => patchFormula(formulaIndex, { steps: formula.steps.map((entry, index) => index === stepIndex ? { ...entry, operand } : entry) })}
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => patchFormula(formulaIndex, { steps: formula.steps.filter((_, index) => index !== stepIndex) })} aria-label="Xoá phép tính"><Trash2 /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => patchFormula(formulaIndex, { steps: [...formula.steps, { operator: "add", operand: { kind: "const", value: "0" } }] })}>
                <Plus className="size-3.5" /> Phép tính
              </Button>
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
