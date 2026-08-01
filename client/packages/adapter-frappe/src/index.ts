/**
 * @metaforge/adapter-frappe — FrappeAdapter (contract api-map.md) + DTO.
 * Impl thật (bọc frappe-react-sdk) sẽ vào src/frappe-adapter.ts ở PHA 5.
 */
export * from "./dto.js";
export * from "./adapter.js";
export { FrappeAdapterImpl } from "./stock-compatible-adapter.js";
export type { FrappeAdapterOptions } from "./frappe-adapter.js";
export { mapError } from "@metaforge/core";
