export interface PurchaseOrderPreviewClock {
  revision: number;
  pending: number;
}

export function createPurchaseOrderPreviewClock(): PurchaseOrderPreviewClock {
  return { revision: 0, pending: 0 };
}

export function markPurchaseOrderChanged(clock: PurchaseOrderPreviewClock): number {
  clock.revision += 1;
  return clock.revision;
}

export function beginPurchaseOrderPreview(clock: PurchaseOrderPreviewClock): number {
  clock.pending += 1;
  return clock.revision;
}

export function finishPurchaseOrderPreview(clock: PurchaseOrderPreviewClock): number {
  clock.pending = Math.max(0, clock.pending - 1);
  return clock.pending;
}

export function canApplyPurchaseOrderPreview(clock: PurchaseOrderPreviewClock, revision: number): boolean {
  return clock.revision === revision;
}

export function isPurchaseOrderPersistenceBlocked(clock: PurchaseOrderPreviewClock, previewError: string): boolean {
  return clock.pending > 0 || previewError.trim().length > 0;
}
