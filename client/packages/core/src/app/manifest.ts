/**
 * App manifest (Gate 7) — hợp đồng DỮ LIỆU khai báo 1 app MetaForge: identity + brand + home + nav.
 * Được suy từ NHU CẦU runtime (nav/home/brand/locale) — KHÔNG phải cấu trúc tạm. App (kể cả app do
 * create-metaforge-app sinh ra) chỉ cấp manifest này; engine dựng shell/nav/home từ đó ⇒ bỏ hard-code
 * HOME_DOCTYPE/NAV (P1-01). Manifest THUẦN + serializable (icon = tên chuỗi, app map sang component).
 */

export type AppBrand = "zinc" | "blue" | "warm";
export type NavKind = "doctype" | "route" | "workspace" | "system" | "experience" | "overview" | "process";

export interface AppNavItem {
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
const BRANDS: ReadonlySet<string> = new Set(["zinc", "blue", "warm"]);
const KINDS: ReadonlySet<string> = new Set(["doctype", "route", "workspace", "system", "experience", "overview", "process"]);

export function validateManifest(m: AppManifest): ManifestResult {
  const issues: ManifestIssue[] = [];
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message });

  if (!m || typeof m !== "object") { err("shape", "manifest phải là object"); return { ok: false, issues }; }
  if (!m.id || !ID_RE.test(m.id)) err("id", `id không hợp lệ: "${m.id}" (kebab: chữ thường/số/-, bắt đầu bằng chữ)`);
  if (!m.name || !String(m.name).trim()) err("name", "name bắt buộc");
  if (m.brand && !BRANDS.has(m.brand)) err("brand", `brand không hợp lệ: "${m.brand}" (zinc|blue|warm)`);

  if (!m.home || (!m.home.doctype && !m.home.route)) err("home", "home phải có doctype hoặc route");
  if (!Array.isArray(m.nav) || m.nav.length === 0) err("nav", "nav phải có ít nhất 1 mục");

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
    const matches = (m.nav ?? []).some((n) => {
      if (n.kind === "route") return n.route === m.home!.route;
      if (n.kind === "workspace") return m.home!.route === "/workspace";
      if (n.kind === "system") return m.home!.route === `/${n.key.replace(/^__/, "")}`;
      if (n.kind === "experience") return m.home!.route === `/x/${n.key}`;
      if (n.kind === "overview") return m.home!.route === `/overview/${n.key}`;
      if (n.kind === "process") return m.home!.route === `/process/${n.key}`;
      return false;
    });
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
