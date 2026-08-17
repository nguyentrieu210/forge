import type { Doc, DocTypeMeta } from "@metaforge/core";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";

interface RuntimeValidationResult {
  valid?: boolean;
  message?: string;
  field_errors?: Record<string, string>;
}

function validationError(result: RuntimeValidationResult): unknown {
  const fieldErrors = result.field_errors ?? {};
  const messages = Object.entries(fieldErrors).map(([fieldname, message]) => JSON.stringify({ fieldname, message }));
  if (!messages.length && result.message) messages.push(JSON.stringify({ message: result.message }));
  return {
    status: 417,
    httpStatus: 417,
    exc_type: "ValidationError",
    _server_messages: JSON.stringify(messages),
    message: result.message ?? "Dữ liệu chưa hợp lệ.",
  };
}

function methodFrom(meta: DocTypeMeta): string {
  const value = meta.viewPolicy?.form?.validationMethod;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Decorate the canonical adapter with optional metadata-owned async validation.
 *
 * This is intentionally at the mutation boundary rather than inside one form component: generic
 * FormView, quick-create and specialized workbenches all converge on createDoc/updateDoc, so the
 * same server validator and field-error mapping apply everywhere. No validator is guessed from a
 * DocType name; metadata must opt in with `viewPolicy.form.validationMethod`.
 */
export function withDocumentValidation(adapter: FrappeAdapter): FrappeAdapter {
  const metaCache = new Map<string, Promise<DocTypeMeta>>();
  const metaFor = (doctype: string) => {
    const existing = metaCache.get(doctype);
    if (existing) return existing;
    const pending = adapter.getMeta(doctype).catch((error) => {
      metaCache.delete(doctype);
      throw error;
    });
    metaCache.set(doctype, pending);
    return pending;
  };

  const validate = async (
    doctype: string,
    doc: Partial<Doc>,
    mode: "create" | "update",
    name?: string,
  ) => {
    const meta = await metaFor(doctype);
    const method = methodFrom(meta);
    if (!method) return;

    let document: Record<string, unknown> = { ...doc, doctype };
    if (mode === "update" && name) {
      const current = await adapter.getDoc(doctype, name);
      document = { ...current.doc, ...doc, name, doctype };
    }
    const result = await adapter.callPost<RuntimeValidationResult>(method, {
      doctype,
      name,
      mode,
      doc: document,
    });
    if (result?.valid === false || Object.keys(result?.field_errors ?? {}).length) throw validationError(result ?? {});
  };

  return new Proxy(adapter as FrappeAdapter & Record<PropertyKey, unknown>, {
    get(target, property, receiver) {
      if (property === "createDoc") {
        return async (doctype: string, doc: Partial<Doc>) => {
          await validate(doctype, doc, "create");
          return adapter.createDoc(doctype, doc);
        };
      }
      if (property === "updateDoc") {
        return async (doctype: string, name: string, doc: Partial<Doc>, modified: string) => {
          await validate(doctype, doc, "update", name);
          return adapter.updateDoc(doctype, name, doc, modified);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(adapter) : value;
    },
  }) as FrappeAdapter;
}
