import type { JsonObject, StockBundleUsageEntry, StockLedgerEntry } from "../../contracts/src/index.js";
import { requireLeafWarehouse } from "../../clouderp-stock/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { reverseStock } from "../../ledger/src/index.js";
import { StockReconciliationController } from "./alumdoor-inventory.js";

type ReconciliationContext = Parameters<StockReconciliationController["normalize"]>[0];
type ReconciliationData = Awaited<ReturnType<StockReconciliationController["normalize"]>>;
type ReconciliationRow = ReconciliationData["items"][number];
type ReconciliationLedgers = Awaited<ReturnType<StockReconciliationController["ledger"]>>;

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

function assertReversalApprover(context: ReconciliationContext, countedBy: string): void {
  if (!context.command.actor.roles.includes("Chủ xưởng")
    && !context.command.actor.roles.includes("System Manager")
    && context.command.actor.user_id !== "Administrator") {
    throw errors.permission("Chỉ Chủ xưởng được đảo phiếu kiểm kê đã ghi sổ");
  }
  if (context.command.actor.user_id === countedBy) {
    throw errors.permission("Người đếm không được tự đảo phiếu kiểm kê của mình");
  }
}

async function assertReversalPeriodOpen(context: ReconciliationContext, document: ReconciliationData): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const company = text(document.company);
  if (!company) throw errors.validation("Phiếu kiểm kê đã ghi sổ phải có công ty để đảo sổ");
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && text(document.snapshot_at).slice(0, 10) <= lock) {
    throw errors.validation(`Ngày ${text(document.snapshot_at).slice(0, 10)} thuộc kỳ đã khoá`, { lock_date: lock });
  }
}

function reverseReconciliationBundleUsages(document: ReconciliationData): StockBundleUsageEntry[] {
  const usages: StockBundleUsageEntry[] = [];
  for (const [index, row] of document.items.entries()) {
    const bundleName = text(row.serial_and_batch_bundle);
    const varianceQty = row.variance_qty_micros ?? 0;
    if (!bundleName || varianceQty === 0) continue;
    usages.push({
      line_key: `REV-RECON-BUNDLE-${text(row.row_id) || index + 1}`,
      bundle_name: bundleName,
      item_code: text(row.item_code),
      warehouse: text(document.warehouse),
      direction: varianceQty > 0 ? "Inward" : "Outward",
      usage_delta: -1,
      posting_at: text(document.snapshot_at),
    });
  }
  return usages;
}

export class StockReconciliationIntegrityController extends StockReconciliationController {
  override async normalize(context: ReconciliationContext): Promise<ReconciliationData> {
    const input = context.command.document;
    if (input.warehouse) {
      await requireLeafWarehouse(
        context as unknown as ControllerContext<JsonObject>,
        input.warehouse,
        input.company,
      );
    }
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

  override async ledger(context: ReconciliationContext, data: ReconciliationData): Promise<ReconciliationLedgers> {
    if (context.command.action !== "cancel") return super.ledger(context, data);
    if (!context.existing || context.existing.docstatus !== 1) {
      throw errors.lifecycle("Chỉ phiếu kiểm kê đã ghi sổ mới được đảo");
    }
    assertReversalApprover(context, text(data.counted_by));
    await assertReversalPeriodOpen(context, data);

    const original: StockLedgerEntry[] = await context.reader.getVoucherStockEntries(
      context.command.tenant_id,
      this.doctype,
      context.command.aggregate.name,
      context.existing.version,
    );
    return {
      stock: reverseStock(original),
      bundleUsages: reverseReconciliationBundleUsages(data),
    };
  }

  protected override status(context: ReconciliationContext, data: ReconciliationData): string {
    if (context.command.action === "cancel") return "Đã đảo kiểm kê";
    return super.status(context, data);
  }
}
