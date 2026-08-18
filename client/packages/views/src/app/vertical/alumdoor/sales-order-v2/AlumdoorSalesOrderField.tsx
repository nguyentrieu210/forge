/** @jsxImportSource react */
import type { DocField } from "@metaforge/core";
import { LinkControl, type ControlRegistry, type FieldServices } from "@metaforge/controls";
import { toast } from "@metaforge/ui";
import type { Json } from "./model.js";

const SUPPLIER_OPTION_PREFIX = "NCC · ";

function supplierOptionValue(name: string): string {
  return `${SUPPLIER_OPTION_PREFIX}${name}`;
}

function supplierNameFromOption(value: unknown): string | null {
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

      // Sales Order remains Customer-authoritative for AR/Delivery/Invoice. The picker may
      // nevertheless surface a Supplier because the same real-world counterparty can buy from
      // Alumdoor too. We do NOT write a Supplier name into Sales Order.customer: selecting an
      // NCC routes through Customer quick-create so the operator must explicitly assign the
      // sales-only price group instead of the client inventing Đại lý/Lẻ.
      const [customersResult, suppliersResult] = await Promise.allSettled([
        baseSearch("Customer", txt, { ...opts, pageLength: Math.max(opts?.pageLength ?? 10, 50) }),
        // Customer link_filters are not valid Supplier fields. Keep only generic search context;
        // adapterServices will still apply safe tenant/company/permission rules for Supplier.
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
          return {
            value: display,
            // Keep primary === value so the shared Link formatter does not render a second
            // technical token underneath. Supplier naming is supplier_name, so this is the
            // human-readable identity the operator expects to see.
            description: display,
          };
        });
      return [...customers, ...supplierOptions];
    },
  };
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
  // `compact` is correct for grid cells, but LinkControl intentionally hides its adjacent `+`
  // while compact. The Sales Order header had reused that flag merely to reduce height, which
  // accidentally removed quick-create from Customer, Price List, Employee, Bank Account, etc.
  const effectiveCompact = isSalesOrderHeaderLink ? false : props.compact;
  const isSalesCounterparty = props.parentDoctype === "Sales Order"
    && props.field.fieldname === "customer"
    && props.field.fieldtype === "Link";

  const onCounterpartyChange = (value: unknown) => {
    const supplierName = supplierNameFromOption(value);
    if (!supplierName) {
      props.onChange(value);
      return;
    }
    void (async () => {
      if (!props.services.quickCreate) {
        toast.error("NCC này chưa có vai trò Khách hàng và màn tạo nhanh Khách hàng chưa sẵn sàng.");
        return;
      }
      toast.info(`NCC ${supplierName} chưa có vai trò Khách hàng. Tạo hồ sơ Khách hàng và chọn Nhóm giá Đại lý/Lẻ để dùng trên đơn bán.`);
      const customerName = await props.services.quickCreate("Customer");
      if (customerName) props.onChange(customerName);
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Không mở được hồ sơ Khách hàng.");
    });
  };

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
      onChange={onCounterpartyChange}
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
