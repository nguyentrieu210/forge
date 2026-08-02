import type { CanonicalDocument } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DomainReader } from "../../document-kernel/src/index.js";
import type { AppFactoryDefinitionData, AppFactoryDefinitionKind } from "./app-factory-definition.js";

export interface ResolveAppFactoryDefinitionInput {
  tenant_id: string;
  definition_key: string;
  definition_kind: AppFactoryDefinitionKind;
  target_doctype: string;
  effective_on: string;
}

const MAX_DEFINITIONS = 5_000;

function day(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw errors.validation("effective_on must be YYYY-MM-DD");
  }
  return normalized;
}

/**
 * Read-side source of truth for Process/Decision/Formula definitions.
 *
 * Definition documents remain ordinary kernel documents, so version history/audit/correction
 * stay in one place. The resolver only selects an already-published version and deliberately
 * fails on overlapping Active rows rather than silently picking one configuration from corrupt
 * data. A scan cap makes the current generic DomainReader implementation safe until WS00 exposes
 * a targeted definition index/query.
 */
export class AppFactoryDefinitionResolver {
  constructor(private readonly reader: DomainReader) {}

  async resolve(input: ResolveAppFactoryDefinitionInput): Promise<CanonicalDocument<AppFactoryDefinitionData> | null> {
    const effectiveOn = day(input.effective_on);
    const rows = await this.reader.listDocumentsByDoctype<AppFactoryDefinitionData>(input.tenant_id, "App Factory Definition");
    if (rows.length > MAX_DEFINITIONS) {
      throw errors.validation(`App Factory Definition scan exceeds ${MAX_DEFINITIONS} rows; targeted store/index is required`);
    }
    const matches = rows
      .filter((document) => document.data.definition_key === input.definition_key)
      .filter((document) => document.data.definition_kind === input.definition_kind)
      .filter((document) => document.data.target_doctype === input.target_doctype)
      .filter((document) => document.data.status === "Active")
      .filter((document) => document.data.effective_from <= effectiveOn)
      .filter((document) => !document.data.effective_to || document.data.effective_to >= effectiveOn)
      .sort((left, right) => right.data.version_no - left.data.version_no || right.version - left.version);

    if (!matches.length) return null;
    if (matches.length > 1) {
      throw errors.lifecycle(
        `Multiple Active ${input.definition_kind} definitions overlap for ${input.definition_key}/${input.target_doctype} on ${effectiveOn}`,
      );
    }
    return matches[0]!;
  }

  async require(input: ResolveAppFactoryDefinitionInput): Promise<CanonicalDocument<AppFactoryDefinitionData>> {
    const resolved = await this.resolve(input);
    if (!resolved) {
      throw errors.notFound(
        `No Active ${input.definition_kind} definition for ${input.definition_key}/${input.target_doctype} on ${input.effective_on}`,
      );
    }
    return resolved;
  }
}
