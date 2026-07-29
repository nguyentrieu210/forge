/**
 * App manifest (Gate 7) — hợp đồng DỮ LIỆU khai báo 1 app MetaForge: identity + brand + home + nav.
 * Được suy từ NHU CẦU runtime (nav/home/brand/locale) — KHÔNG phải cấu trúc tạm. App (kể cả app do
 * create-metaforge-app sinh ra) chỉ cấp manifest này; engine dựng shell/nav/home từ đó ⇒ bỏ hard-code
 * HOME_DOCTYPE/NAV (P1-01). Manifest THUẦN + serializable (icon = tên chuỗi, app map sang component).
 */

export type AppBrand =
  | "zinc" | "blue" | "warm" | "sakura" | "emerald" | "ocean" | "violet"
  | "indigo" | "teal" | "amber" | "rose" | "aurora" | "sunset";
export type NavKind = "doctype" | "route" | "workspace" | "system" | "experience" | "overview" | "process";

export interface AppNavItem {
  /** App sở hữu mục này khi server đang hợp nhất nhiều app đã cài. */
  app?: string;
  /** doctype (kind=doctype) HOẶC id route/hệ thống/experience (khớp `Experience.key`). */
  key: string;
  label: string;
  /** tên icon (vd lucide "boxes") — app resolve sang component; giữ manifest serializable. */
  icon?: string;
  /** nhóm hiển thị ở sidebar. */
  group?: string;
  /** mặc định "doctype". "experience" = màn App-mode đóng gói tay (touch-first), đăng ký qua
   * `createExperienceRegistry` (@metaforge/shell/app-mode) — xem `resolveNavPath` cho path `/x/<key>`. */
  kind?: NavKind;
  /** path tuỳ biến khi kind="route". */
  route?: string;
}

/**
 * Một thao tác thực hiện bằng cách ĐIỀN FORM rồi bấm chạy, không phải bằng cách sửa một
 * bản ghi. Xem `AppAction` phía server (packages/app-registry) để biết vì sao nó tồn tại.
 *
 * Nằm trong manifest nên màn hình là DỮ LIỆU: một app mới khai thêm một thao tác không cần
 * bản build client nào.
 */
export interface AppActionField {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string;
  required?: boolean;
  default?: string;
  description?: string;
}
export interface AppActionCall {
  method: string;
  label: string;
  /** Câu hỏi phải trả lời trước khi chạy. Có thì màn hình hỏi lại, không thì chạy thẳng. */
  confirm?: string;
}
export interface AppAction {
  /** App sở hữu action; server thêm khi hợp nhất manifest của tenant. */
  app?: string;
  name: string;
  label: string;
  icon?: string;
  group?: string;
  description?: string;
  fields: AppActionField[];
  /** Chỉ ĐỌC: cho xem trước điều sắp xảy ra. */
  preview?: AppActionCall;
  commit: AppActionCall;
  permission_doctype: string;
  /** Khoá trong kết quả chứa mảng dòng để hiện thành bảng. */
  result_table?: string;
}

export interface AppDesign {
  density?: "compact" | "comfortable" | "touch";
  radius?: "square" | "soft" | "round";
  content_width?: "contained" | "wide" | "fluid";
}

export type AppScreenMode = "desk" | "focus" | "touch";
export type AppScreenTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface AppScreenBlockBase {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  span?: 1 | 2 | 3;
}
export interface AppScreenMetricBlock extends AppScreenBlockBase {
  type: "metric";
  doctype: string;
  filters?: Record<string, unknown>;
  tone?: AppScreenTone;
  route?: string;
}
export interface AppScreenListBlock extends AppScreenBlockBase {
  type: "list";
  doctype: string;
  fields: string[];
  filters?: Record<string, unknown>;
  order_by?: string;
  limit: number;
  empty_text?: string;
}
export interface AppScreenActionBlock extends AppScreenBlockBase {
  type: "action";
  action: string;
}
export type AppScreenBlock = AppScreenMetricBlock | AppScreenListBlock | AppScreenActionBlock;

/**
 * Màn nghiệp vụ do app sở hữu nhưng được cài như dữ liệu.
 *
 * Khác Experience React viết tay, màn này đi cùng manifest và runtime chung có thể dựng
 * ngay sau khi cài app, không cần build/deploy một frontend riêng.
 */
export interface AppScreen {
  /** App sở hữu màn; dùng để ghép đúng action khi nhiều app đặt cùng tên cục bộ. */
  app?: string;
  name: string;
  label: string;
  description?: string;
  icon?: string;
  group?: string;
  permission_doctype: string;
  mode: AppScreenMode;
  columns: 1 | 2 | 3;
  blocks: AppScreenBlock[];
}

export interface AppLocaleOverride {
  numberFormat?: string;
  currency?: string;
  dateFormat?: string;
}

import type { BusinessContextRequirement } from "../business/context.js";

export interface AppManifest {
  /** id máy (kebab). */
  id: string;
  /** tên hiển thị. */
  name: string;
  version?: string;
  brand?: AppBrand;
  /** Điều chỉnh nhịp, bo góc và bề rộng nội dung mà không fork CSS của app. */
  design?: AppDesign;
  /** override locale (nếu bỏ → dùng boot sysdefaults). */
  locale?: AppLocaleOverride;
  /** trang đích khi vào gốc app — thay HOME_DOCTYPE hard-code. */
  home: { doctype?: string; route?: string };
  /** Context nghiệp vụ toàn cục; options/default do server resolve theo role + User Permission. */
  businessContext?: BusinessContextRequirement;
  /** Khi true, runtime tải catalog Workspace đầy đủ từ Frappe thay nav viết tay. */
  catalogMode?: "manifest" | "workspace" | "hybrid";
  /** app key dùng cho Overview/Process server definitions (vd stock/selling/buying). */
  domain?: string;
  nav: AppNavItem[];
  /** Thao tác dạng form do app khai. Server đã lọc theo quyền trước khi gửi xuống. */
  actions?: AppAction[];
  /** Màn nghiệp vụ đã được server lọc theo quyền. */
  screens?: AppScreen[];
}

export interface ManifestIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}
export interface ManifestResult {
  ok: boolean;
  issues: ManifestIssue[];
}

const ID_RE = /^[a-z][a-z0-9-]*$/;
const BRANDS: ReadonlySet<string> = new Set([
  "zinc", "blue", "warm", "sakura", "emerald", "ocean", "violet",
  "indigo", "teal", "amber", "rose", "aurora", "sunset",
]);
const KINDS: ReadonlySet<string> = new Set(["doctype", "route", "workspace", "system", "experience", "overview", "process"]);
const DENSITIES: ReadonlySet<string> = new Set(["compact", "comfortable", "touch"]);
const RADII: ReadonlySet<string> = new Set(["square", "soft", "round"]);
const CONTENT_WIDTHS: ReadonlySet<string> = new Set(["contained", "wide", "fluid"]);
const SCREEN_MODES: ReadonlySet<string> = new Set(["desk", "focus", "touch"]);
const SCREEN_BLOCK_TYPES: ReadonlySet<string> = new Set(["metric", "list", "action"]);

export function validateManifest(m: AppManifest): ManifestResult {
  const issues: ManifestIssue[] = [];
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message });

  if (!m || typeof m !== "object") { err("shape", "manifest phải là object"); return { ok: false, issues }; }
  if (!m.id || !ID_RE.test(m.id)) err("id", `id không hợp lệ: "${m.id}" (kebab: chữ thường/số/-, bắt đầu bằng chữ)`);
  if (!m.name || !String(m.name).trim()) err("name", "name bắt buộc");
  if (m.brand && !BRANDS.has(m.brand)) err("brand", `brand không hợp lệ: "${m.brand}"`);
  if (m.design?.density && !DENSITIES.has(m.design.density)) err("design_density", `design.density không hợp lệ: "${m.design.density}"`);
  if (m.design?.radius && !RADII.has(m.design.radius)) err("design_radius", `design.radius không hợp lệ: "${m.design.radius}"`);
  if (m.design?.content_width && !CONTENT_WIDTHS.has(m.design.content_width)) err("design_content_width", `design.content_width không hợp lệ: "${m.design.content_width}"`);

  if (!m.home || (!m.home.doctype && !m.home.route)) err("home", "home phải có doctype hoặc route");
  if (!Array.isArray(m.nav) || m.nav.length === 0) err("nav", "nav phải có ít nhất 1 mục");

  const screens = new Map<string, AppScreen>();
  for (const screen of m.screens ?? []) {
    if (!screen.name || !ID_RE.test(screen.name)) {
      err("screen_name", `screen.name không hợp lệ: "${screen.name}"`);
      continue;
    }
    if (screens.has(screen.name)) err("screen_name_dup", `screen name trùng: "${screen.name}"`);
    screens.set(screen.name, screen);
    if (screen.app && !screen.name.startsWith(`${screen.app}-`)) {
      err("screen_namespace", `screen "${screen.name}" không thuộc namespace app "${screen.app}"`);
    }
    if (!screen.label?.trim()) err("screen_label", `screen "${screen.name}" thiếu label`);
    if (!screen.permission_doctype?.trim()) err("screen_permission", `screen "${screen.name}" thiếu permission_doctype`);
    if (!SCREEN_MODES.has(screen.mode)) err("screen_mode", `screen "${screen.name}" mode không hợp lệ: "${screen.mode}"`);
    if (![1, 2, 3].includes(screen.columns)) err("screen_columns", `screen "${screen.name}" columns chỉ nhận 1–3`);
    const blockIds = new Set<string>();
    for (const block of screen.blocks ?? []) {
      if (!block.id || !ID_RE.test(block.id)) err("screen_block_id", `screen "${screen.name}" có block id không hợp lệ: "${block.id}"`);
      if (blockIds.has(block.id)) err("screen_block_dup", `screen "${screen.name}" trùng block id: "${block.id}"`);
      blockIds.add(block.id);
      if (!SCREEN_BLOCK_TYPES.has(block.type)) err("screen_block_type", `screen "${screen.name}" có block type không hợp lệ: "${block.type}"`);
      if (block.span != null && (block.span < 1 || block.span > screen.columns)) {
        err("screen_block_span", `block "${block.id}" có span vượt số cột của screen "${screen.name}"`);
      }
    }
    if (!screen.blocks?.length) err("screen_blocks", `screen "${screen.name}" chưa có block`);
  }

  const keys = new Set<string>();
  for (const n of m.nav ?? []) {
    if (!n.key) { err("nav_key_empty", "nav item thiếu key"); continue; }
    if (keys.has(n.key)) err("nav_key_dup", `nav key trùng: "${n.key}"`);
    keys.add(n.key);
    if (!n.label || !String(n.label).trim()) err("nav_label", `nav "${n.key}" thiếu label`);
    if (n.kind && !KINDS.has(n.kind)) err("nav_kind", `nav "${n.key}" kind không hợp lệ: "${n.kind}"`);
    if (n.kind === "route" && !n.route) err("nav_route", `nav "${n.key}" kind=route cần route`);
    // route tương đối ("docs" thay vì "/docs") resolve SAI trong React Router (coi là path CON của
    // URL hiện tại, không phải tuyệt đối) — lỗi khó thấy lúc runtime (route "tồn tại" nhưng không bao
    // giờ khớp khi vào từ URL khác) → chặn sớm ở validate (review độc lập).
    if (n.kind === "route" && n.route && !n.route.startsWith("/")) {
      err("nav_route_relative", `nav "${n.key}" route "${n.route}" phải bắt đầu bằng "/" (tuyệt đối) — route tương đối resolve sai trong React Router`);
    }
    if (n.kind === "experience" && n.key.startsWith("screen:") && !screens.has(n.key.slice("screen:".length))) {
      err("nav_screen_missing", `nav "${n.key}" trỏ tới màn riêng không có trong manifest`);
    }
  }
  // 2 nav item khác key nhưng cùng resolve tới 1 path (vd system key "__ws" và "ws" đều còn "/ws" sau
  // khi bỏ tiền tố "__", hoặc route thủ công trùng path /app/<doctype> của 1 item khác) — React Router
  // chỉ khớp <Route> ĐẦU TIÊN khai báo, path còn lại KHÔNG BAO GIỜ tới được dù nav item "tồn tại"
  // (review độc lập — "route trùng nhau không được phát hiện").
  const pathOwner = new Map<string, string>();
  for (const n of m.nav ?? []) {
    if (!n.key) continue;
    const path = resolveNavPath(n);
    if (!path) continue;
    const owner = pathOwner.get(path);
    if (owner) err("nav_route_dup", `nav "${n.key}" và "${owner}" cùng resolve tới route "${path}" — 1 trong 2 sẽ không bao giờ tới được`);
    else pathOwner.set(path, n.key);
  }
  // home.doctype nên nằm trong nav (cảnh báo, không chặn)
  if (m.home?.doctype && !keys.has(m.home.doctype)) warn("home_not_in_nav", `home.doctype "${m.home.doctype}" không có trong nav`);
  // home.route PHẢI khớp route/workspace/system nào đó trong nav — nếu không, runtime sẽ KHÔNG có
  // <Route> tương ứng cho home ⇒ rơi vào catch-all → Navigate về home → lại catch-all → redirect loop
  // (P2-MANIFEST, review P1-MANIFEST-01). Đây là error (không phải warning) vì hậu quả là app KHÔNG
  // vào được (khác home.doctype thiếu trong nav — vẫn còn deep-link doctype khác dùng được).
  if (m.home?.route) {
    // Qua CHÍNH `resolveNavPath` — không viết lại luật lần thứ hai.
    //
    // Trước đây khối này có bản sao riêng của quy ước path, và nó ĐÃ trôi dạt: bản sao
    // dùng `/x/${key}` thô trong khi `resolveNavPath` (thứ router thật sự dùng, và cũng là
    // thứ dùng cho kiểm trùng path ở trên) dùng `encodeURIComponent(key)`. Hệ quả là mọi
    // experience key có ký tự cần mã hoá — vd `approval:Asset Request` — đều hỏng theo cả
    // hai chiều: manifest mã hoá ĐÚNG thì bị từ chối, manifest không mã hoá thì lọt kiểm
    // rồi không bao giờ khớp route thật. Bắt được khi app đầu tiên sinh từ brief mở ra
    // đúng màn "Không dựng được giao diện" mà luật này lẽ ra phải ngăn.
    const matches = (m.nav ?? []).some((n) => resolveNavPath(n) === m.home!.route);
    if (!matches) err("home_route_unmatched", `home.route "${m.home.route}" không khớp route/workspace/system nào trong nav — sẽ gây redirect loop`);
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/** resolveNavPath — đích điều hướng THẬT cho 1 nav item theo `kind` (P2 — ManifestAppRuntime parity,
 * review P1-MANIFEST-01). Trả `null` cho kind KHÔNG NHẬN RA — caller PHẢI xử lý tường minh (vd hiện
 * "chưa hỗ trợ"), TUYỆT ĐỐI không được ngầm coi là doctype (đó chính là lỗi review bắt được: runtime
 * cũ gửi MỌI nav item tới `/app/<key>` bất kể kind). Quy ước path (doctypeBase/workspacePath) khớp
 * ĐÚNG những gì apps/demo (LiveApp.tsx) đã dùng — hàm này chỉ RÚT RA logic đã đúng, không đổi hành vi. */
export interface NavRoutePaths {
  /** mặc định "/app" — doctype item → `${doctypeBase}/${key}`. */
  doctypeBase?: string;
  /** mặc định "/workspace". */
  workspacePath?: string;
  /** mặc định "/x" — experience item → `${experienceBase}/${key}` (khớp `Experience.key` registry). */
  experienceBase?: string;
}
export function resolveNavPath(n: AppNavItem, paths: NavRoutePaths = {}): string | null {
  const kind = n.kind ?? "doctype";
  switch (kind) {
    case "doctype": return `${paths.doctypeBase ?? "/app"}/${encodeURIComponent(n.key)}`;
    case "route": return n.route ?? null;
    case "workspace": return paths.workspacePath ?? "/workspace";
    case "system": return `/${n.key.replace(/^__/, "")}`;
    case "experience": return `${paths.experienceBase ?? "/x"}/${encodeURIComponent(n.key)}`;
    case "overview": return `/overview/${encodeURIComponent(n.key)}`;
    case "process": return `/process/${encodeURIComponent(n.key)}`;
    default: return null;
  }
}

/** mergeLocale — override CỤ THỂ TỪNG FIELD của manifest.locale lên boot.sysdefaults (field nào
 * manifest không set thì giữ nguyên giá trị boot). KHÔNG thay thế nguyên cục — 1 app chỉ muốn ép
 * `currency` không nên vô tình mất `date_format` của site. */
export interface BootSysdefaults {
  number_format?: string;
  currency?: string;
  date_format?: string;
  /** Frappe trả về dạng CHUỖI ("2", "0", hoặc "") — không phải số. */
  float_precision?: string | number;
  currency_precision?: string | number;
}

/** Đọc độ chính xác từ boot. Chuỗi rỗng/undefined ⇒ chưa đặt; "0" ⇒ số 0 THẬT, phải giữ. */
function precisionOf(raw: string | number | undefined): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function mergeLocale(bootSysdefaults: BootSysdefaults | undefined, override: AppLocaleOverride | undefined) {
  return {
    numberFormat: override?.numberFormat ?? bootSysdefaults?.number_format,
    currency: override?.currency ?? bootSysdefaults?.currency,
    dateFormat: override?.dateFormat ?? bootSysdefaults?.date_format,
    floatPrecision: precisionOf(bootSysdefaults?.float_precision),
    currencyPrecision: precisionOf(bootSysdefaults?.currency_precision),
  };
}

/** resolveHomeRoute — path đích khi vào gốc app (route tuỳ biến → doctype home → nav doctype đầu). */
export function resolveHomeRoute(m: AppManifest): string {
  if (m.home?.route) return m.home.route;
  if (m.home?.doctype) return `/app/${m.home.doctype}`;
  const firstDoc = (m.nav ?? []).find((n) => (n.kind ?? "doctype") === "doctype");
  return firstDoc ? `/app/${firstDoc.key}` : "/";
}

export interface NavGroup {
  group: string;
  items: AppNavItem[];
}

/** navGroups — gom nav theo `group`, GIỮ thứ tự xuất hiện (group + item). */
export function navGroups(m: AppManifest): NavGroup[] {
  const order: string[] = [];
  const map = new Map<string, AppNavItem[]>();
  for (const n of m.nav ?? []) {
    const g = n.group ?? "Khác";
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g)!.push(n);
  }
  return order.map((g) => ({ group: g, items: map.get(g)! }));
}
