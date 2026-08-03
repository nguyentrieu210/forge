/**
 * @metaforge/core — nền engine: types (meta/doc/error), fieldtype registry.
 * P0 build order: adapter → meta → field → List → Form (architecture §B).
 * Renderer/View/Builder chỉ phụ thuộc các type ở đây + interface adapter.
 */

export * from "./types/fieldtype.js";
export * from "./types/meta.js";
export * from "./types/matrix.js";
export * from "./types/doc.js";
export * from "./types/error.js";
export * from "./meta/eval.js";
export * from "./meta/safe-eval.js";
export * from "./meta/normalize.js";
export * from "./meta/serialize.js";
export * from "./meta/link-query.js";
export * from "./meta/fetch-from.js";
export * from "./meta/resolver.js";
export * from "./security/sanitize.js";
export * from "./security/url.js";
export * from "./i18n/translate.js";
export * from "./i18n/format.js";
export * from "./app/manifest.js";
export * from "./app/form-profile.js";
export * from "./app/bulk-policy.js";
export * from "./business/context.js";
export * from "./business/catalog.js";
export * from "./business/overview.js";
export * from "./business/process.js";
export * from "./business/access.js";
export * from "./business/display.js";

export const CORE_VERSION = "0.1.0";
/** Engine 1.x ↔ Frappe 16 (architecture §J versioning). */
export const FRAPPE_TARGET = "16" as const;

export { withAppBase } from "./util/app-base.js";
