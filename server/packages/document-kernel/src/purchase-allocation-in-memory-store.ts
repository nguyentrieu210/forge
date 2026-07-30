import type {
  JsonObject,
  MutationPlan,
  MutationReceipt,
  MutationSnapshot,
} from "../../contracts/src/index.js";
import type {
  PurchaseReceiptAllocationEntry,
  PurchaseSettlementEntry,
  PurchaseUnappliedReceiptEntry,
  PurchaseWindowObligationEntry,
} from "../../contracts/src/purchase-allocation.js";
import { InMemoryMutationStore } from "./in-memory-store.js";

/** Test adapter mirroring the allocation arrays persisted by the D1 store. */
export class InMemoryPurchaseAllocationMutationStore extends InMemoryMutationStore {
  private readonly purchaseObligations: PurchaseWindowObligationEntry[] = [];
  private readonly purchaseAllocations: PurchaseReceiptAllocationEntry[] = [];
  private readonly purchaseUnapplied: PurchaseUnappliedReceiptEntry[] = [];
  private readonly purchaseSettlements: PurchaseSettlementEntry[] = [];

  override async execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt> {
    // The base store performs all document/ledger validation before returning. The
    // pushes below are deterministic in-memory copies and cannot partially fail.
    const receipt = await super.execute(plan);
    this.purchaseObligations.push(...structuredClone(plan.purchase_obligation_entries ?? []));
    this.purchaseAllocations.push(...structuredClone(plan.purchase_allocation_entries ?? []));
    this.purchaseUnapplied.push(...structuredClone(plan.purchase_unapplied_entries ?? []));
    this.purchaseSettlements.push(...structuredClone(plan.purchase_settlement_entries ?? []));
    return receipt;
  }

  override snapshot(): MutationSnapshot {
    return {
      ...super.snapshot(),
      purchase_obligation_entries: structuredClone(this.purchaseObligations),
      purchase_allocation_entries: structuredClone(this.purchaseAllocations),
      purchase_unapplied_entries: structuredClone(this.purchaseUnapplied),
      purchase_settlement_entries: structuredClone(this.purchaseSettlements),
    };
  }
}
