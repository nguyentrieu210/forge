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
  value: string;
  description?: string;
}
