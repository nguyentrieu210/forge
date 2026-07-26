/**
 * Kanban boards and the notification log.
 *
 * Both are per-user Desk state, not business data. They are deliberately NOT
 * documents: a kanban board appearing in a list, a report or an audit trail would
 * be noise at best and misleading at worst.
 */

import { errors } from "../../core/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";

export interface KanbanColumn {
  column_name: string;
  status?: string;
  indicator?: string;
}

export interface KanbanBoardRecord {
  name: string;
  reference_doctype: string;
  field_name: string;
  columns: KanbanColumn[];
  private: boolean;
  owner: string;
}

export class D1DeskViewStore {
  private readonly db: D1Database | D1DatabaseSession;
  constructor(db: D1Database) { this.db = db.withSession?.("first-primary") ?? db; }

  // ---- kanban ---------------------------------------------------------------

  /**
   * Boards for a doctype, filtered to the ones this user may see.
   *
   * A private board belongs to its owner alone; filtering in SQL rather than after
   * the fact means another user's private board never leaves the database.
   */
  async listKanbanBoards(tenantId: string, doctype: string | null, user: string): Promise<KanbanBoardRecord[]> {
    const result = doctype
      ? await this.db.prepare(
        `SELECT name, reference_doctype, field_name, columns_json, private, owner FROM kanban_boards
         WHERE tenant_id=?1 AND reference_doctype=?2 AND (private=0 OR owner=?3) ORDER BY name`,
      ).bind(tenantId, doctype, user).all<Record<string, unknown>>()
      : await this.db.prepare(
        `SELECT name, reference_doctype, field_name, columns_json, private, owner FROM kanban_boards
         WHERE tenant_id=?1 AND (private=0 OR owner=?2) ORDER BY name`,
      ).bind(tenantId, user).all<Record<string, unknown>>();

    return (result.results ?? []).map((row) => ({
      name: String(row.name),
      reference_doctype: String(row.reference_doctype),
      field_name: String(row.field_name),
      columns: safeColumns(row.columns_json),
      private: row.private === 1,
      owner: String(row.owner),
    }));
  }

  async getKanbanBoard(tenantId: string, name: string): Promise<KanbanBoardRecord | null> {
    const row = await this.db.prepare(
      `SELECT name, reference_doctype, field_name, columns_json, private, owner FROM kanban_boards
       WHERE tenant_id=?1 AND name=?2`,
    ).bind(tenantId, name).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      name: String(row.name),
      reference_doctype: String(row.reference_doctype),
      field_name: String(row.field_name),
      columns: safeColumns(row.columns_json),
      private: row.private === 1,
      owner: String(row.owner),
    };
  }

  async putKanbanBoard(tenantId: string, record: KanbanBoardRecord, now: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO kanban_boards(tenant_id,name,reference_doctype,field_name,columns_json,private,owner,modified_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
       ON CONFLICT(tenant_id,name) DO UPDATE SET
         reference_doctype=excluded.reference_doctype, field_name=excluded.field_name,
         columns_json=excluded.columns_json, private=excluded.private, modified_at=excluded.modified_at`,
    ).bind(tenantId, record.name, record.reference_doctype, record.field_name,
      JSON.stringify(record.columns), record.private ? 1 : 0, record.owner, now).run();
  }

  /**
   * Records a card's position within a column.
   *
   * Positions are rewritten for the whole target column rather than patched, so a
   * dropped or duplicated index cannot leave two cards claiming one slot — which
   * would make the board order depend on scan order and appear to shuffle itself.
   */
  async setCardOrder(tenantId: string, board: string, columnName: string, orderedNames: string[], now: string): Promise<void> {
    if (orderedNames.length > 500) throw errors.validation("A kanban column may hold at most 500 ordered cards");
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`DELETE FROM kanban_card_order WHERE tenant_id=?1 AND board=?2 AND column_name=?3`).bind(tenantId, board, columnName),
    ];
    orderedNames.forEach((documentName, index) => {
      statements.push(this.db.prepare(
        `INSERT INTO kanban_card_order(tenant_id,board,column_name,document_name,position,modified_at)
         VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(tenant_id,board,document_name) DO UPDATE SET
           column_name=excluded.column_name, position=excluded.position, modified_at=excluded.modified_at`,
      ).bind(tenantId, board, columnName, documentName, index, now));
    });
    await this.db.batch(statements);
  }

  async getCardOrder(tenantId: string, board: string): Promise<Record<string, string[]>> {
    const result = await this.db.prepare(
      `SELECT column_name, document_name FROM kanban_card_order
       WHERE tenant_id=?1 AND board=?2 ORDER BY column_name, position`,
    ).bind(tenantId, board).all<{ column_name: string; document_name: string }>();
    const grouped: Record<string, string[]> = {};
    for (const row of result.results ?? []) {
      (grouped[row.column_name] ??= []).push(row.document_name);
    }
    return grouped;
  }

  // ---- notification log -----------------------------------------------------

  async listNotifications(tenantId: string, user: string, limit = 20): Promise<JsonObject[]> {
    const bounded = Math.min(Math.max(limit, 1), 100);
    const result = await this.db.prepare(
      `SELECT name, subject, notification_type, document_type, document_name, read, from_user, created_at
       FROM notification_log WHERE tenant_id=?1 AND for_user=?2 ORDER BY created_at DESC LIMIT ?3`,
    ).bind(tenantId, user, bounded).all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      name: String(row.name),
      subject: String(row.subject ?? ""),
      type: String(row.notification_type ?? "Alert"),
      document_type: row.document_type === null ? null : String(row.document_type),
      document_name: row.document_name === null ? null : String(row.document_name),
      read: row.read === 1 ? 1 : 0,
      creation: String(row.created_at),
      from_user: String(row.from_user ?? ""),
    }));
  }

  async unreadCount(tenantId: string, user: string): Promise<number> {
    const row = await this.db.prepare(
      `SELECT COUNT(*) AS total FROM notification_log WHERE tenant_id=?1 AND for_user=?2 AND read=0`,
    ).bind(tenantId, user).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  /**
   * Marks one notification read.
   *
   * Scoped to the recipient, so a caller cannot clear somebody else's inbox by
   * guessing a name.
   */
  async markRead(tenantId: string, user: string, name: string): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE notification_log SET read=1 WHERE tenant_id=?1 AND for_user=?2 AND name=?3 AND read=0`,
    ).bind(tenantId, user, name).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async markAllRead(tenantId: string, user: string): Promise<number> {
    const result = await this.db.prepare(
      `UPDATE notification_log SET read=1 WHERE tenant_id=?1 AND for_user=?2 AND read=0`,
    ).bind(tenantId, user).run();
    return result.meta?.changes ?? 0;
  }

  async notify(tenantId: string, input: {
    name: string;
    forUser: string;
    subject: string;
    type?: string;
    documentType?: string;
    documentName?: string;
    fromUser?: string;
  }, now: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO notification_log(tenant_id,name,for_user,subject,notification_type,document_type,document_name,from_user,created_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
       ON CONFLICT(tenant_id,name) DO NOTHING`,
    ).bind(tenantId, input.name, input.forUser, input.subject.slice(0, 500), input.type ?? "Alert",
      input.documentType ?? null, input.documentName ?? null, input.fromUser ?? "", now).run();
  }
}

/**
 * Parses stored column definitions.
 *
 * A malformed row yields no columns rather than throwing: a corrupt board must not
 * make the whole board list unreadable, including the read needed to repair it.
 */
function safeColumns(value: unknown): KanbanColumn[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => ({
        column_name: String(entry.column_name ?? ""),
        ...(entry.status === undefined ? {} : { status: String(entry.status) }),
        ...(entry.indicator === undefined ? {} : { indicator: String(entry.indicator) }),
      }))
      .filter((column) => column.column_name !== "");
  } catch {
    return [];
  }
}

/** Validates a board definition against the doctype it charts. */
export function assertKanbanField(fieldOptions: string | undefined, fieldname: string, columns: KanbanColumn[]): void {
  if (!fieldOptions) throw errors.validation(`${fieldname} has no options, so it cannot form kanban columns`);
  const allowed = new Set(fieldOptions.split("\n").map((option) => option.trim()).filter(Boolean));
  for (const column of columns) {
    // A column whose value the field cannot hold would be permanently empty, and
    // dragging a card into it would fail on save rather than on drop.
    if (!allowed.has(column.column_name)) {
      throw errors.validation(`Kanban column ${column.column_name} is not one of ${fieldname}'s options`);
    }
  }
}
