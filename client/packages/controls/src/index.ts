/**
 * @metaforge/controls — 43 control (field-ledger.md) trên shadcn/ui.
 * Ở scaffold: registry contract (fieldtype → control) + prop shape.
 * Component thật (RHF + shadcn) build ở PHA 5 theo field-ledger.
 */
import type { ComponentType } from "react";
import type { DocField, Fieldtype, BoundFormatters } from "@metaforge/core";
import { AUTHORABLE_FIELDTYPES } from "@metaforge/core";

/** Tuỳ chọn Link search (P0-09): lọc theo link_filters + ngữ cảnh, giới hạn trang, huỷ request. */
export interface LinkSearchOpts {
  /** filters tĩnh/động dựng từ field.link_filters (buildLinkFilters). */
  filters?: Record<string, unknown> | Array<unknown>;
  /** doctype cha (parent) → server phân quyền/user-permission theo tham chiếu. */
  referenceDoctype?: string;
  /** page_length (Frappe mặc định ~10). */
  pageLength?: number;
  /** huỷ request cũ khi có phím mới (chống race stale-overwrite). */
  signal?: AbortSignal;
}

/** Service tiêm từ ngoài (FormView cấp, backed by adapter) — controls KHÔNG import adapter. */
export interface FieldServices {
  /**
   * Bộ định dạng số/tiền/ngày theo locale của site.
   *
   * Cần ở tầng control vì ô CHỈ ĐỌC không dùng được `<input type="number">` để hiện dấu phân cách
   * — chuẩn HTML không cho. Không có nó thì tổng tiền hiện ra "75982503967,3", con số mà không ai
   * đọc nổi và cũng không kiểm tra được đúng sai.
   */
  fmt?: BoundFormatters;
  searchLink?: (doctype: string, txt: string, opts?: LinkSearchOpts) => Promise<Array<{ value: string; description?: string }>>;
  /** upload file → trả file_url (dùng cho Attach/Attach Image). */
  uploadFile?: (file: File, opts: { isPrivate?: 0 | 1; doctype?: string; docname?: string; fieldname?: string }) => Promise<{ file_url: string; name: string }>;
  /** nạp meta child DocType (dùng cho Table/child grid). */
  getMeta?: (doctype: string) => Promise<unknown>;
  /** P1-09 fetch_from: lấy 1 field của doc đích (get_value) để điền tự động khi Link đổi. */
  fetchValue?: (doctype: string, name: string, field: string) => Promise<unknown>;
  /** Resolve name kỹ thuật → title/label thân thiện cho Link đã có sẵn. */
  resolveDisplay?: (doctype: string, name: string) => Promise<{ label: string; description?: string; image?: string }>;
  /** Mở form tạo nhanh bản ghi đích ngay trong Link combobox (giống ERPNext "+ Create a new …") khi
   * gõ không khớp bản ghi nào có sẵn. Trả về name bản ghi vừa tạo, hoặc undefined nếu người dùng huỷ.
   * Quyền tạo vẫn do form tạo nhanh (fail-closed) tự kiểm — service này chỉ điều phối mở/đóng UI. */
  quickCreate?: (doctype: string) => Promise<string | undefined>;
}

/** Prop chung cho mọi field control (data-driven từ DocField). */
export interface FieldControlProps<T = unknown> {
  field: DocField;
  value: T;
  onChange: (v: T) => void;
  /** trạng thái field (schema/displayed/value-readable/editable/masked/locked). */
  readOnly?: boolean;
  masked?: boolean;
  error?: string;
  /** Liên kết control với mô tả và thông báo lỗi hiển thị cạnh field. */
  describedBy?: string;
  required?: boolean;
  /** Nhãn đọc được khi control tổng hợp không dùng được liên kết label/htmlFor. */
  label?: string;
  /** tên document đang mở (doc.name) — KHÔNG phải fieldname. */
  docname?: string;
  id?: string;
  services?: FieldServices;
  /** doctype đích cho Link/Dynamic Link (Dynamic Link: FormView tính từ field.options → giá trị field kia). */
  linkTarget?: string;
  /** doctype cha đang mở (meta.name) — reference_doctype cho Link search + link_filters ngữ cảnh. */
  parentDoctype?: string;
  /** giá trị doc hiện tại — để resolve eval: trong link_filters (dependent Link filter). */
  docValues?: Record<string, unknown>;
  /** role user — cho control tổ hợp (Table) resolve trạng thái field con theo permlevel. */
  roles?: string[];
}

export type FieldControl<T = unknown> = ComponentType<FieldControlProps<T>>;

/** Registry: mỗi fieldtype ánh xạ 1 control. Rỗng ở scaffold — nạp ở PHA 5. */
export class ControlRegistry {
  private map = new Map<Fieldtype, FieldControl>();

  register(ft: Fieldtype, control: FieldControl): void {
    this.map.set(ft, control);
  }
  resolve(ft: Fieldtype): FieldControl | undefined {
    return this.map.get(ft);
  }
  /** fieldtype authorable chưa có control → cần bổ sung trước Cổng 6. */
  missing(): Fieldtype[] {
    return AUTHORABLE_FIELDTYPES.filter((ft) => !this.map.has(ft));
  }
}

export const CONTROLS_VERSION = "0.1.0";

export * from "./controls.js";
export * from "./media.js";
export * from "./register.js";
