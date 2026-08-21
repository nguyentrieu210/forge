/** @jsxImportSource react */
/**
 * Ô chọn cho màn công nợ — luôn là `LinkControl` trỏ vào MỘT DANH MỤC THẬT.
 *
 * Không màn nào trong thư mục này được dựng danh sách đối tác/chứng từ bằng mảng
 * chuỗi cứng. Danh mục là nguồn sự thật: `Customer`, `Supplier`, `Sales Invoice`,
 * `Purchase Invoice`, `Payment Entry`, `Credit Note`, `Debit Note`,
 * `Sales Order`, `Purchase Order`, `Delivery Note`, `Purchase Receipt`,
 * `Tài khoản ngân hàng`, `Price List` — mỗi ô ở đây nêu đúng tên DocType và để
 * `LinkControl` + `FieldServices` lo tìm kiếm, phân quyền và nhãn hiển thị.
 *
 * Bọc mỏng theo đúng lối `sales-order-v2/AlumdoorSalesOrderField.tsx`, nhưng
 * không mang theo nhánh riêng của Sales Order (gộp NCC vào picker khách hàng,
 * tỉnh/xã, tài khoản ngân hàng ghép nhãn) vì màn báo cáo không có các ngữ cảnh đó.
 */
import type { DocField } from "@metaforge/core";
import { LinkControl, type FieldServices } from "@metaforge/controls";
import { X } from "lucide-react";
import { Button, Label } from "@metaforge/ui";
import { fallbackField } from "../sales-order-v2/AlumdoorSalesOrderField.js";

/** Dựng một `DocField` kiểu Link trỏ đúng DocType danh mục. */
export function debtLinkField(fieldname: string, label: string, doctype: string): DocField {
  return fallbackField(fieldname, label, "Link", doctype);
}

export function AlumdoorDebtField(props: {
  id: string;
  label: string;
  /** DocType danh mục đích. */
  doctype: string;
  fieldname: string;
  value: string;
  onChange: (value: string) => void;
  services: FieldServices;
  /** DocType cha, để server áp user-permission theo ngữ cảnh tham chiếu. */
  parentDoctype?: string;
  readOnly?: boolean;
  hint?: string;
  className?: string;
}) {
  const field = debtLinkField(props.fieldname, props.label, props.doctype);
  return (
    <div className={`min-w-0 space-y-1.5 ${props.className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={props.id} className="text-[11px] font-medium leading-tight text-muted-foreground">
          {props.label}
        </Label>
        {props.value && !props.readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1 text-[11px] text-muted-foreground"
            onClick={() => props.onChange("")}
            aria-label={`Bỏ chọn ${props.label}`}
          >
            <X className="size-3" /> Bỏ chọn
          </Button>
        ) : null}
      </div>
      <LinkControl
        id={props.id}
        field={field}
        linkTarget={props.doctype}
        parentDoctype={props.parentDoctype}
        value={props.value}
        readOnly={props.readOnly}
        label={props.label}
        services={props.services}
        onChange={(next) => props.onChange(String(next ?? "").trim())}
      />
      {props.hint ? <p className="text-[11px] leading-tight text-muted-foreground">{props.hint}</p> : null}
    </div>
  );
}
