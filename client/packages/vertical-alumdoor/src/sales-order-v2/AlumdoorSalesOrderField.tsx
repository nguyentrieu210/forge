/** @jsxImportSource react */
import type { DocField } from "@metaforge/core";
import { LinkControl, type ControlRegistry, type FieldServices } from "@metaforge/controls";
import type { Json } from "./model.js";

export const SUPPLIER_OPTION_PREFIX = "NCC · ";

export function supplierOptionValue(name: string): string {
  return `${SUPPLIER_OPTION_PREFIX}${name}`;
}

export function supplierNameFromOption(value: unknown): string | null {
  const raw = String(value ?? "");
  return raw.startsWith(SUPPLIER_OPTION_PREFIX)
    ? raw.slice(SUPPLIER_OPTION_PREFIX.length).trim()
    : null;
}

function salesCounterpartyServices(services: FieldServices): FieldServices {
  const baseSearch = services.searchLink;
  if (!baseSearch) return services;
  return {
    ...services,
    searchLink: async (doctype, txt, opts) => {
      if (doctype !== "Customer") return baseSearch(doctype, txt, opts);

      // Picker bán hàng được phép tìm cả Khách hàng lẫn NCC. NCC chỉ là lựa chọn tạm trên UI;
      // trước khi lưu Workbench sẽ dùng/tạo vai trò Customer tương ứng để giữ đúng authority
      // của Sales Order -> Delivery Note -> Sales Invoice, nhưng không bắt người dùng nhảy form.
      const [customersResult, suppliersResult] = await Promise.allSettled([
        baseSearch("Customer", txt, { ...opts, pageLength: Math.max(opts?.pageLength ?? 10, 50) }),
        baseSearch("Supplier", txt, {
          ...opts,
          filters: undefined,
          pageLength: Math.max(opts?.pageLength ?? 10, 50),
        }),
      ]);

      if (customersResult.status === "rejected" && suppliersResult.status === "rejected") {
        throw customersResult.reason;
      }
      const customers = customersResult.status === "fulfilled" ? customersResult.value : [];
      const suppliers = suppliersResult.status === "fulfilled" ? suppliersResult.value : [];
      const customerNames = new Set(customers.map((row) => row.value));
      const supplierOptions = suppliers
        .filter((row) => row.value && !customerNames.has(row.value))
        .map((row) => {
          const display = supplierOptionValue(row.value);
          return { value: display, description: display };
        });
      return [...customers, ...supplierOptions];
    },
  };
}

export function supplierCustomerPrefill(supplierName: string, source?: Record<string, unknown>): Record<string, unknown> {
  const text = (value: unknown) => String(value ?? "").normalize("NFC").trim();
  const result: Record<string, unknown> = {
    customer_name: text(source?.supplier_name) || supplierName,
  };
  const mappings: Array<[string, string]> = [
    ["contact_person", "contact_person"],
    ["phone", "phone"],
    ["email", "email"],
    ["tax_id", "tax_id"],
    ["address", "install_address_line1"],
  ];
  for (const [sourceField, customerField] of mappings) {
    const value = text(source?.[sourceField]);
    if (value) result[customerField] = value;
  }
  return result;
}

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

  const isLink = props.field.fieldtype === "Link" || props.field.fieldtype === "Dynamic Link";
  const isSalesOrderHeaderLink = props.parentDoctype === "Sales Order" && isLink;
  const isAdministrativeLink = props.parentDoctype === "Sales Order"
    && ["install_province", "install_ward"].includes(props.field.fieldname);
  const isCompositeBankLink = props.parentDoctype === "Sales Order"
    && props.field.fieldname === "bank_account";
  // Tỉnh/xã lưu bằng mã ổn định nhưng người dùng chỉ cần thấy tên hành chính.
  // Tài khoản ngân hàng đã có nhãn ghép Ngân hàng · STK · CTK nên cũng không
  // nối thêm document name (chính là STK) lần thứ hai.
  const effectiveCompact = isAdministrativeLink || isCompositeBankLink ? true : isSalesOrderHeaderLink ? false : props.compact;
  const isSalesCounterparty = props.parentDoctype === "Sales Order"
    && props.field.fieldname === "customer"
    && props.field.fieldtype === "Link";

  const commonProps = {
    field: props.field,
    id: props.id,
    value: props.value,
    readOnly: props.readOnly,
    required: props.required,
    label,
    parentDoctype: props.parentDoctype,
    docValues: props.docValues,
    roles: props.roles,
    compact: effectiveCompact,
  };
  const control = isSalesCounterparty ? (
    <LinkControl
      {...commonProps}
      services={salesCounterpartyServices(props.services)}
      onChange={props.onChange}
    />
  ) : (
    <Control
      {...commonProps}
      services={props.services}
      onChange={props.onChange}
    />
  );
  if (props.field.fieldtype === "Check") {
    return (
      <div className={`min-w-0 ${props.className ?? ""}`}>
        <div className={`flex min-h-8 items-center ${props.hideLabel ? "justify-center" : "gap-2"}`}>
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
