/** Document + docinfo shapes (getdoc). */

export interface Doc {
  name: string;
  doctype: string;
  owner?: string;
  creation?: string;
  /** dùng cho optimistic-lock: gửi lại khi update → 417 nếu server lệch. */
  modified?: string;
  docstatus?: 0 | 1 | 2;
  [fieldname: string]: unknown;
}

export interface LabelValue {
  label: string;
  value: string;
}

export interface Comment {
  name: string;
  comment_type?: string;
  content: string;
  comment_email?: string;
  comment_by?: string;
  creation?: string;
}

export interface DocInfo {
  comments: Comment[];
  versions: unknown[];
  communications: unknown[];
  assignments: unknown[];
  attachments: unknown[];
  /** quyền hiệu lực cho doc hiện tại (server là ranh giới cuối). */
  permissions: Record<string, 0 | 1>;
}

export interface ListOpts {
  fields?: string[];
  filters?: Filters;
  orFilters?: Filters;
  orderBy?: string;
  limitStart?: number;
  pageLength?: number;
  parent?: string;
}

export type FilterOperator =
  | "=" | "!=" | ">" | "<" | ">=" | "<="
  | "like" | "not like" | "in" | "not in" | "between" | "is";

export type Filters =
  | Record<string, unknown>
  | Array<[string, FilterOperator, unknown]>;

export interface LinkResult {
  /** Khoá thật của bản ghi (`CS-0001`) — thứ được LƯU. */
  value: string;
  /**
   * Tên hiển thị (`Cơ sở Cầu Giấy`), suy từ `title_field` của DocType.
   *
   * Server vẫn luôn trả trường này; nó chỉ THIẾU trong kiểu ở đây, nên mọi chỗ dùng
   * `LinkResult` đều rơi về `description` — mà `description` chính là cái MÃ. Kết quả:
   * bộ lọc và ô chọn hiện `CT-0001` thay vì `IELTS Foundation`.
   */
  label?: string;
  /** Dòng phụ — thường là chính khoá, để phân biệt hai bản ghi trùng tên. */
  description?: string;
}

/**
 * Cách hiển thị một kết quả Link: TÊN trước, MÃ làm dòng phụ.
 *
 * Luật này trước đây được viết lại ở BỐN nơi — ô Link trong form, ô Link trong bảng con,
 * bộ lọc danh sách, và trung tâm phân quyền — và cả bốn đều đọc `description`, vốn là cái
 * MÃ. Kết quả: mọi dropdown chọn học viên hiện `HV-2026-00120` thay vì tên người.
 *
 * Gom về một chỗ để không có bản sao thứ năm trôi dạt tiếp.
 */
export function linkDisplay(result: LinkResult): { primary: string; secondary?: string } {
  const primary = result.label || result.description || result.value;
  // Dòng phụ chỉ có nghĩa khi nó KHÁC dòng chính — lặp lại cùng một chuỗi hai lần chỉ tốn chỗ.
  return primary !== result.value ? { primary, secondary: result.value } : { primary };
}
