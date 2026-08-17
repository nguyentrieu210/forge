export interface SalesOrderPreviewClock {
  revision: number;
  pending: number;
}

export interface SalesOrderDocumentPreviewPatch {
  patch: Record<string, unknown>;
  clear: string[];
}

export function createSalesOrderPreviewClock(): SalesOrderPreviewClock {
  return { revision: 0, pending: 0 };
}

export function markSalesOrderDocumentChanged(clock: SalesOrderPreviewClock): number {
  clock.revision += 1;
  return clock.revision;
}

export function beginSalesOrderDocumentPreview(clock: SalesOrderPreviewClock): number {
  clock.pending += 1;
  return clock.revision;
}

export function finishSalesOrderDocumentPreview(clock: SalesOrderPreviewClock): number {
  clock.pending = Math.max(0, clock.pending - 1);
  return clock.pending;
}

export function canApplySalesOrderDocumentPreview(clock: SalesOrderPreviewClock, revision: number): boolean {
  return clock.revision === revision;
}

export function applySalesOrderDocumentPreview<T extends Record<string, unknown>>(
  base: T,
  preview: SalesOrderDocumentPreviewPatch,
): T {
  const next = { ...base, ...preview.patch } as T;
  for (const field of preview.clear) delete next[field as keyof T];
  return next;
}

export function isSalesOrderPersistenceBlocked(clock: SalesOrderPreviewClock, previewError: string): boolean {
  return clock.pending > 0 || previewError.trim().length > 0;
}
