/** @jsxImportSource react */
import type { DocField } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import type { Json } from "./model.js";

export function fallbackField(
  fieldname: string,
  label: string,
  fieldtype: DocField["fieldtype"] = "Data",
  options?: string,
): DocField {
  return {
    fieldname,
    label,
    fieldtype,
    ...(options ? { options } : {}),
  } as DocField;
}

export function selectField(
  base: DocField | undefined,
  fieldname: string,
  label: string,
  values: string[],
): DocField {
  const unique = [...new Set(values.filter(Boolean))];
  return {
    ...(base ?? fallbackField(fieldname, label, "Select")),
    fieldname,
    label,
    fieldtype: "Select",
    options: ["", ...unique].join("\n"),
  } as DocField;
}

export function AlumdoorSalesOrderField(props: {
  id: string;
  field: DocField;
  value: unknown;
  onChange: (value: unknown) => void;
  registry: ControlRegistry;
  services: FieldServices;
  parentDoctype: string;
  docValues: Json;
  roles: string[];
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  className?: string;
  onCommit?: () => void;
  hideLabel?: boolean;
}) {
  const Control = props.registry.resolve(props.field.fieldtype);
  const label = props.label || String(props.field.label ?? props.field.fieldname);
  if (!Control) {
    return <div className={props.className}><div className="text-xs text-destructive">Missing control for {props.field.fieldtype}</div></div>;
  }
  const control = (
    <Control
      field={props.field}
      id={props.id}
      value={props.value}
      onChange={props.onChange}
      readOnly={props.readOnly}
      required={props.required}
      label={label}
      services={props.services}
      parentDoctype={props.parentDoctype}
      docValues={props.docValues}
      roles={props.roles}
      compact={props.compact}
    />
  );
  if (props.field.fieldtype === "Check") {
    return (
      <div className={`min-w-0 ${props.className ?? ""}`}>
        <div className="flex min-h-8 items-center gap-2">
          {control}
          {!props.hideLabel ? (
            <label htmlFor={props.id} className="cursor-pointer text-[11px] font-medium text-foreground">
              {label}{props.required ? <span className="ml-0.5 text-destructive">*</span> : null}
            </label>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`min-w-0 ${props.className ?? ""}`}
      onBlurCapture={() => props.onCommit?.()}
      onKeyDownCapture={(event) => { if (event.key === "Enter") props.onCommit?.(); }}
    >
      {!props.hideLabel ? (
        <label htmlFor={props.id} className="mb-1 block text-[11px] font-medium leading-tight text-muted-foreground">
          {label}{props.required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </label>
      ) : null}
      {control}
    </div>
  );
}
