import type { CanonicalDocument, JsonObject, MutationAction } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export function assertLifecycleTransition(existing: CanonicalDocument<JsonObject> | null, action: MutationAction): void {
  if (action === "create") {
    if (existing) throw errors.exists();
    return;
  }
  if (!existing) throw errors.notFound();
  if (action === "save" && existing.docstatus !== 0) {
    throw errors.lifecycle("Only draft documents can be saved", { current_docstatus: existing.docstatus, action });
  }
  if (action === "submit" && existing.docstatus !== 0) {
    throw errors.lifecycle("Only draft documents can be submitted", { current_docstatus: existing.docstatus, action });
  }
  if (action === "cancel" && existing.docstatus !== 1) {
    throw errors.lifecycle("Only submitted documents can be cancelled", { current_docstatus: existing.docstatus, action });
  }
}

export function nextDocStatus(action: MutationAction): 0 | 1 | 2 {
  if (action === "submit") return 1;
  if (action === "cancel") return 2;
  return 0;
}
