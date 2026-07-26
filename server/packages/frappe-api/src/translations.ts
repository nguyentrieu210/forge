/**
 * Server-side translation catalogue.
 *
 * The client has a translator core but no source of strings, so every label has
 * been rendering as its English source text. For a Vietnamese deployment that is
 * not a missing nicety — it is the product being in the wrong language.
 *
 * Lookup falls back to the source string rather than an empty value: a missing
 * translation must degrade to readable English, never to a blank label.
 */

import { errors } from "../../core/src/index.js";

const MAX_BATCH = 500;

export class D1TranslationStore {
  private readonly db: D1Database | D1DatabaseSession;
  constructor(db: D1Database) { this.db = db.withSession?.("first-primary") ?? db; }

  /**
   * Translates a batch of strings.
   *
   * Batched in one query because the client asks for every label on a screen at
   * once; a query per string would multiply D1 round-trips by the field count.
   */
  async translate(tenantId: string, language: string, sources: string[], context = ""): Promise<Record<string, string>> {
    const unique = [...new Set(sources.filter((source) => typeof source === "string" && source !== ""))];
    if (!unique.length) return {};
    if (unique.length > MAX_BATCH) throw errors.validation(`At most ${MAX_BATCH} strings may be translated at once`);

    const output: Record<string, string> = {};
    // Fall back to the source first, then let any real translation overwrite it —
    // so a partially translated catalogue still returns a full, readable map.
    for (const source of unique) output[source] = source;

    // Chunked to stay inside D1's bound-parameter cap; the batch limit above alone
    // would not.
    const chunkSize = 60;
    for (let start = 0; start < unique.length; start += chunkSize) {
      const chunk = unique.slice(start, start + chunkSize);
      const placeholders = chunk.map((_value, index) => `?${index + 3}`).join(", ");
      const result = await this.db.prepare(
        `SELECT source_text, translated_text FROM translations
         WHERE tenant_id=?1 AND language=?2 AND context=?${chunk.length + 3} AND source_text IN (${placeholders})`,
      ).bind(tenantId, language, ...chunk, context).all<{ source_text: string; translated_text: string }>();
      for (const row of result.results ?? []) {
        if (row.translated_text) output[row.source_text] = row.translated_text;
      }
    }
    return output;
  }

  async put(tenantId: string, language: string, entries: Array<{ source: string; translated: string; context?: string }>, now: string): Promise<number> {
    if (entries.length > MAX_BATCH) throw errors.validation(`At most ${MAX_BATCH} translations may be written at once`);
    const statements = entries
      .filter((entry) => entry.source)
      .map((entry) => this.db.prepare(
        `INSERT INTO translations(tenant_id,language,source_text,translated_text,context,modified_at)
         VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(tenant_id,language,context,source_text) DO UPDATE SET
           translated_text=excluded.translated_text, modified_at=excluded.modified_at`,
      ).bind(tenantId, language, entry.source, entry.translated, entry.context ?? "", now));
    if (!statements.length) return 0;
    await this.db.batch(statements);
    return statements.length;
  }

  /** Removes a translation, so a bad entry can fall back to source text again. */
  async remove(tenantId: string, language: string, source: string, context = ""): Promise<boolean> {
    const result = await this.db.prepare(
      `DELETE FROM translations WHERE tenant_id=?1 AND language=?2 AND context=?3 AND source_text=?4`,
    ).bind(tenantId, language, context, source).run();
    return (result.meta?.changes ?? 0) > 0;
  }
}
