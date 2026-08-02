import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export const WEBSITE_MANIFEST = "/api/method/forge.website.manifest";
export const WEBSITE_PAGE = "/api/method/forge.website.page";

const WEBSITE_PATHS = new Set([WEBSITE_MANIFEST, WEBSITE_PAGE]);
const BLOCK_TYPES = new Set(["hero", "text", "features", "image-gallery", "project-gallery", "product-grid", "cta", "contact"]);
const TONES = new Set(["neutral", "primary", "muted", "dark"]);
const ALIGNS = new Set(["left", "center"]);
const SOURCES = new Set(["none", "storefront-catalog"]);
const FONTS = new Set(["system", "serif", "rounded"]);
const RADII = new Set(["square", "soft", "round"]);
const DENSITIES = new Set(["compact", "comfortable", "touch"]);

export function isWebsitePath(pathname: string): boolean {
  return WEBSITE_PATHS.has(pathname);
}

export interface WebsiteContext {
  db: D1Database;
  tenantId: string;
}

interface StoredDocumentRow {
  name: string;
  payload_json: string;
}

interface MasterRecordRow {
  data_json: string;
}

interface WebsiteSettings {
  enabled: boolean;
  published: boolean;
  siteTitle: string;
  siteDescription: string;
  homePage: string;
  templatePreset: string;
  templateVersion: number;
  themePreset: string;
  themeVersion: number;
  logo: string | null;
  favicon: string | null;
  contactPhone: string;
  contactEmail: string;
  address: string;
  footerText: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  radius: string | null;
  density: string | null;
}

interface PublicPage {
  slug: string;
  title: string;
  show_in_nav: boolean;
  nav_label: string;
  nav_order: number;
  meta_title: string;
  meta_description: string;
  blocks: JsonObject[];
}

export async function websiteManifest(context: WebsiteContext): Promise<JsonObject> {
  const resolved = await resolveWebsite(context);
  return publicManifest(resolved.settings, resolved.theme, resolved.pages);
}

export async function websitePage(context: WebsiteContext, requestedSlug: string): Promise<JsonObject> {
  const resolved = await resolveWebsite(context);
  const slug = normalizeSlug(requestedSlug || resolved.settings.homePage);
  const page = resolved.pages.get(slug);
  if (!page) throw errors.notFound("Không tìm thấy trang này");
  return {
    ...publicManifest(resolved.settings, resolved.theme, resolved.pages),
    page: page as unknown as JsonValue,
  };
}

async function resolveWebsite(context: WebsiteContext): Promise<{
  settings: WebsiteSettings;
  theme: JsonObject;
  pages: Map<string, PublicPage>;
}> {
  const settings = await loadSettings(context);
  if (!settings.enabled || !settings.published) throw errors.notFound("Website chưa được công khai");

  const template = await loadMasterRecord(
    context,
    "Website Template",
    presetRecordName(settings.templatePreset, settings.templateVersion),
  );
  const themePreset = await loadMasterRecord(
    context,
    "Website Theme Preset",
    presetRecordName(settings.themePreset, settings.themeVersion),
  );
  const pages = templatePages(template);

  for (const page of await loadPublishedOverrides(context)) pages.set(page.slug, page);
  if (!pages.has(settings.homePage)) throw errors.validation(`Trang chủ ${settings.homePage} không tồn tại trong website đã publish`);

  return { settings, theme: resolveTheme(themePreset, settings), pages };
}

async function loadSettings(context: WebsiteContext): Promise<WebsiteSettings> {
  const row = await context.db.prepare(
    `SELECT payload_json FROM documents
     WHERE tenant_id=?1 AND doctype='Website Settings' AND name='Website Settings' AND docstatus<2`,
  ).bind(context.tenantId).first<{ payload_json: string }>();
  if (!row) throw errors.notFound("Website chưa được cấu hình");

  const payload = parseObject(row.payload_json, "Website Settings");
  const templatePreset = normalizePresetId(shortText(payload.template_preset, 80) || "business-landing");
  const themePreset = normalizePresetId(shortText(payload.theme_preset, 80) || "business-blue");
  return {
    enabled: flag(payload.enabled),
    published: flag(payload.published),
    siteTitle: shortText(payload.site_title, 160) || "Website doanh nghiệp",
    siteDescription: shortText(payload.site_description, 500),
    homePage: normalizeSlug(shortText(payload.home_page, 80) || "home"),
    templatePreset,
    templateVersion: clampInteger(payload.template_version, 1, 1_000_000, 1),
    themePreset,
    themeVersion: clampInteger(payload.theme_version, 1, 1_000_000, 1),
    logo: safeAsset(payload.logo),
    favicon: safeAsset(payload.favicon),
    contactPhone: shortText(payload.contact_phone, 80),
    contactEmail: shortText(payload.contact_email, 160),
    address: shortText(payload.address, 500),
    footerText: shortText(payload.footer_text, 500),
    primaryColor: safeColor(payload.primary_color),
    secondaryColor: safeColor(payload.secondary_color),
    backgroundColor: safeColor(payload.background_color),
    textColor: safeColor(payload.text_color),
    headingFont: enumText(payload.heading_font, FONTS),
    bodyFont: enumText(payload.body_font, FONTS),
    radius: enumText(payload.radius, RADII),
    density: enumText(payload.density, DENSITIES),
  };
}

async function loadMasterRecord(context: WebsiteContext, recordType: string, name: string): Promise<JsonObject> {
  const row = await context.db.prepare(
    `SELECT data_json FROM master_records
     WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0`,
  ).bind(context.tenantId, recordType, name).first<MasterRecordRow>();
  if (!row) throw errors.validation(`${recordType} ${name} chưa được cài trên tenant này`);
  return parseObject(row.data_json, `${recordType} ${name}`);
}

async function loadPublishedOverrides(context: WebsiteContext): Promise<PublicPage[]> {
  const rows = await context.db.prepare(
    `SELECT name,payload_json FROM documents
     WHERE tenant_id=?1 AND doctype='Web Page' AND docstatus<2
     ORDER BY name LIMIT 200`,
  ).bind(context.tenantId).all<StoredDocumentRow>();

  const output: PublicPage[] = [];
  for (const row of rows.results ?? []) {
    let payload: JsonObject;
    try { payload = JSON.parse(row.payload_json) as JsonObject; } catch { continue; }
    if (!flag(payload.published)) continue;
    output.push(publicPage(payload, row.name));
  }
  return output;
}

function templatePages(template: JsonObject): Map<string, PublicPage> {
  const rawPages = Array.isArray(template.pages) ? template.pages : [];
  const pages = new Map<string, PublicPage>();
  for (const [index, raw] of rawPages.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Website Template có page ${index + 1} không hợp lệ`);
    const page = publicPage(raw as JsonObject, `template-${index + 1}`);
    pages.set(page.slug, page);
  }
  if (!pages.size) throw errors.validation("Website Template không có trang nào");
  return pages;
}

function publicPage(payload: JsonObject, fallbackName: string): PublicPage {
  const slug = normalizeSlug(shortText(payload.slug, 80) || fallbackName);
  const title = shortText(payload.title, 200) || slug;
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  return {
    slug,
    title,
    show_in_nav: payload.show_in_nav === undefined ? true : flag(payload.show_in_nav),
    nav_label: shortText(payload.nav_label, 120) || title,
    nav_order: clampInteger(payload.nav_order, 0, 10_000, 10),
    meta_title: shortText(payload.meta_title, 200) || title,
    meta_description: shortText(payload.meta_description, 500),
    blocks: blocks.slice(0, 50).map((block, index) => publicBlock(block, index)),
  };
}

function publicBlock(value: unknown, index: number): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`Website block ${index + 1} không hợp lệ`);
  const input = value as JsonObject;
  const type = shortText(input.block_type ?? input.type, 40);
  if (!BLOCK_TYPES.has(type)) throw errors.validation(`Website block type không được hỗ trợ: ${type || "?"}`);

  const output: JsonObject = {
    id: shortText(input.name ?? input.id, 120) || `block-${index + 1}`,
    type,
  };
  assignText(output, "eyebrow", input.eyebrow, 160);
  assignText(output, "heading", input.heading, 240);
  assignText(output, "body", input.body, 4000);
  const image = safeAsset(input.image);
  if (image) output.image = image;
  assignText(output, "button_label", input.button_label, 120);
  const buttonUrl = safeLink(input.button_url);
  if (buttonUrl) output.button_url = buttonUrl;
  output.tone = enumText(input.tone, TONES) ?? "neutral";
  output.align = enumText(input.align, ALIGNS) ?? "left";
  output.columns = clampInteger(input.columns, 1, 4, 3);
  output.source = enumText(input.source, SOURCES) ?? "none";
  output.limit = clampInteger(input.limit, 1, 24, 6);
  return output;
}

function resolveTheme(preset: JsonObject, settings: WebsiteSettings): JsonObject {
  const raw = preset.tokens;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation("Website Theme Preset thiếu tokens");
  const tokens = raw as JsonObject;
  return {
    primary: settings.primaryColor ?? safeColor(tokens.primary) ?? "#1d4ed8",
    secondary: settings.secondaryColor ?? safeColor(tokens.secondary) ?? "#0f766e",
    background: settings.backgroundColor ?? safeColor(tokens.background) ?? "#ffffff",
    surface: safeColor(tokens.surface) ?? "#f8fafc",
    text: settings.textColor ?? safeColor(tokens.text) ?? "#0f172a",
    muted: safeColor(tokens.muted) ?? "#64748b",
    heading_font: settings.headingFont ?? enumText(tokens.heading_font, FONTS) ?? "system",
    body_font: settings.bodyFont ?? enumText(tokens.body_font, FONTS) ?? "system",
    radius: settings.radius ?? enumText(tokens.radius, RADII) ?? "soft",
    density: settings.density ?? enumText(tokens.density, DENSITIES) ?? "comfortable",
  };
}

function publicManifest(settings: WebsiteSettings, theme: JsonObject, pages: Map<string, PublicPage>): JsonObject {
  const navigation = [...pages.values()]
    .filter((page) => page.show_in_nav)
    .sort((left, right) => left.nav_order - right.nav_order || left.nav_label.localeCompare(right.nav_label, "vi"))
    .map((page) => ({ slug: page.slug, label: page.nav_label }));

  return {
    site: {
      title: settings.siteTitle,
      description: settings.siteDescription,
      home_page: settings.homePage,
      template_preset: settings.templatePreset,
      template_version: settings.templateVersion,
      theme_preset: settings.themePreset,
      theme_version: settings.themeVersion,
      logo: settings.logo,
      favicon: settings.favicon,
      contact_phone: settings.contactPhone,
      contact_email: settings.contactEmail,
      address: settings.address,
      footer_text: settings.footerText,
    } as unknown as JsonValue,
    theme: theme as unknown as JsonValue,
    navigation: navigation as unknown as JsonValue,
  };
}

function presetRecordName(id: string, version: number): string {
  return `${id}@${version}`;
}

function normalizePresetId(value: string): string {
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw errors.validation("Website preset id không hợp lệ");
  return id;
}

function normalizeSlug(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  const slug = trimmed || "home";
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw errors.validation("Website slug chỉ nhận chữ thường, số và dấu gạch ngang");
  return slug;
}

function parseObject(text: string, label: string): JsonObject {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value as JsonObject;
  } catch {
    throw errors.validation(`${label} có dữ liệu JSON không hợp lệ`);
  }
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || String(value ?? "").toLowerCase() === "true";
}

function shortText(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, max);
}

function assignText(target: JsonObject, key: string, value: unknown, max: number): void {
  const text = shortText(value, max);
  if (text) target[key] = text;
}

function safeColor(value: unknown): string | null {
  const text = shortText(value, 20);
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}

function safeAsset(value: unknown): string | null {
  const text = shortText(value, 500);
  if (!text) return null;
  if (text.startsWith("/files/") || /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/|$)/.test(text)) return text;
  return null;
}

function safeLink(value: unknown): string | null {
  const text = shortText(value, 500);
  if (!text) return null;
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  if (/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/|$)/.test(text)) return text;
  if (/^(mailto:|tel:)[^\s]+$/i.test(text)) return text;
  return null;
}

function enumText(value: unknown, allowed: ReadonlySet<string>): string | null {
  const text = shortText(value, 80);
  return allowed.has(text) ? text : null;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}
