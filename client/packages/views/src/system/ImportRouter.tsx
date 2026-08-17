import { ImportContent as GenericImportContent } from "./Import.js";
import { CustomerImportContent } from "./CustomerImport.js";

/**
 * Keep the generic Frappe-style importer unchanged for every DocType, while Customer
 * gets the stricter Alumdoor create-only workflow when the route explicitly asks for it.
 */
export function ImportContent() {
  const doctype = new URLSearchParams(window.location.search).get("doctype")?.trim();
  return doctype === "Customer" ? <CustomerImportContent /> : <GenericImportContent />;
}

export { CustomerImportContent };
