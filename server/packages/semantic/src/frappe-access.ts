import type { Actor } from "../../contracts/src/index.js";
import type { MetadataPermissionService } from "../../frappe-model/src/index.js";
import type { SemanticModelRegistry } from "./index.js";
import { ReadScopeSemanticAccessController } from "./access.js";

/**
 * Concrete adapter to Forge's existing permission implementation.
 * No IAM contract is changed: report permission and getReadScope are consumed exactly as-is.
 */
export function createFrappeSemanticAccessController(
  registry: SemanticModelRegistry,
  permissions: MetadataPermissionService,
  actor: Actor,
): ReadScopeSemanticAccessController {
  return new ReadScopeSemanticAccessController(registry, {
    assertReport: async (tenantId, doctype) => {
      await permissions.assert({ actor, tenantId, doctype, action: "report" });
    },
    getReadScope: async (tenantId, doctype) => permissions.getReadScope(actor, tenantId, doctype),
  });
}
