import { errors } from "../../core/src/index.js";
import { StockReconciliationController } from "./alumdoor-inventory.js";

type ReconciliationContext = Parameters<StockReconciliationController["normalize"]>[0];
type ReconciliationData = Awaited<ReturnType<StockReconciliationController["normalize"]>>;
type ReconciliationRow = ReconciliationData["items"][number];

const FROZEN_SNAPSHOT_FIELDS = ["warehouse", "scope", "item_group", "item_code", "snapshot_at", "counted_by"] as const;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function rowIdentity(row: Pick<ReconciliationRow, "item_code" | "batch_no">): string {
  return `${text(row.item_code)}\u0000${text(row.batch_no)}`;
}

function displayIdentity(row: Pick<ReconciliationRow, "item_code" | "batch_no">): string {
  const item = text(row.item_code);
  const batch = text(row.batch_no);
  return batch ? `${item} / lô ${batch}` : item;
}

function assertNoDuplicateOrAmbiguousRows(rows: ReconciliationRow[], source: string): void {
  const identities = new Set<string>();
  const itemModes = new Map<string, { aggregate: boolean; batches: Set<string> }>();
  for (const row of rows) {
    const itemCode = text(row.item_code);
    if (!itemCode) throw errors.validation(`${source}: có dòng thiếu mã hàng`);
    const identity = rowIdentity(row);
    if (identities.has(identity)) throw errors.validation(`${source}: trùng dòng ${displayIdentity(row)}`);
    identities.add(identity);
    const batch = text(row.batch_no);
    const mode = itemModes.get(itemCode) ?? { aggregate: false, batches: new Set<string>() };
    if (batch) mode.batches.add(batch);
    else mode.aggregate = true;
    itemModes.set(itemCode, mode);
  }
  for (const [itemCode, mode] of itemModes) {
    if (mode.aggregate && mode.batches.size) {
      throw errors.validation(`${source}: ${itemCode} không được vừa có dòng tổng vừa có dòng theo lô`);
    }
  }
}

function assertSnapshotEnvelopeImmutable(current: ReconciliationData, previous: ReconciliationData): void {
  for (const field of FROZEN_SNAPSHOT_FIELDS) {
    if (text(current[field]) !== text(previous[field])) {
      throw errors.validation(`Phiếu kiểm kê đã chốt sổ: không được đổi ${field}`);
    }
  }
}

async function assertRowWithinScope(
  context: ReconciliationContext,
  document: ReconciliationData,
  row: ReconciliationRow,
): Promise<void> {
  if (["Theo mã hàng", "Một mặt hàng"].includes(text(document.scope)) && text(row.item_code) !== text(document.item_code)) {
    throw errors.validation(`Dòng ${displayIdentity(row)} nằm ngoài mã hàng ${text(document.item_code)} của phiếu kiểm kê`);
  }
  if (text(document.scope) === "Theo nhóm hàng") {
    const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", text(row.item_code));
    if (!item) throw errors.reference(`Mặt hàng ${text(row.item_code)} không tồn tại`);
    if (text(item.item_group) !== text(document.item_group)) {
      throw errors.validation(`Dòng ${displayIdentity(row)} nằm ngoài nhóm hàng ${text(document.item_group)} của phiếu kiểm kê`);
    }
  }
}

export class StockReconciliationIntegrityController extends StockReconciliationController {
  override async normalize(context: ReconciliationContext): Promise<ReconciliationData> {
    const input = context.command.document;
    assertNoDuplicateOrAmbiguousRows(input.items, "Phiếu kiểm kê");

    const previous = context.existing?.data;
    if (!previous) {
      for (const row of input.items) await assertRowWithinScope(context, input, row);
      return super.normalize(context);
    }

    assertSnapshotEnvelopeImmutable(input, previous);
    assertNoDuplicateOrAmbiguousRows(previous.items, "Snapshot kiểm kê");

    const inputByIdentity = new Map(input.items.map((row) => [rowIdentity(row), row]));
    const previousIdentities = new Set(previous.items.map(rowIdentity));
    const missing = previous.items.filter((row) => !inputByIdentity.has(rowIdentity(row)));
    if (missing.length) {
      const sample = missing.slice(0, 5).map(displayIdentity).join(", ");
      throw errors.validation(
        `Phiếu kiểm kê đã chốt sổ: không được xoá ${missing.length} dòng snapshot (${sample}${missing.length > 5 ? ", ..." : ""})`,
      );
    }

    const matched = previous.items.map((original, index) => {
      const incoming = inputByIdentity.get(rowIdentity(original))!;
      return {
        ...incoming,
        row_id: original.row_id || incoming.row_id || `ROW-${index + 1}`,
      } as ReconciliationRow;
    });
    const extras = input.items.filter((row) => !previousIdentities.has(rowIdentity(row)));
    for (const row of extras) await assertRowWithinScope(context, input, row);

    const delegated = {
      ...context,
      command: {
        ...context.command,
        document: { ...input, items: [...matched, ...extras] },
      },
    } as ReconciliationContext;
    return super.normalize(delegated);
  }
}
