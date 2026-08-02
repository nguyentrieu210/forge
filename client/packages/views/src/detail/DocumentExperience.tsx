/** @jsxImportSource react */
import { useState, type ReactNode } from "react";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import { cn } from "@metaforge/ui";
import {
  Boxes,
  Factory,
  FileCheck2,
  Landmark,
  Package,
  ShoppingCart,
  UserRound,
  WalletCards,
  Clock3,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import {
  formatPresentationValue,
  resolveDocumentPresentation,
  type DocumentArchetype,
  type PresentationStatusTone,
} from "./document-presentation.js";
import { resolveDocumentExperienceProfile } from "./document-experience-profile.js";

const ARCHETYPE_ICON: Record<DocumentArchetype, typeof Package> = {
  master: UserRound,
  transaction: ShoppingCart,
  inventory: Boxes,
  production: Factory,
  approval: FileCheck2,
  ledger: WalletCards,
  analysis: Landmark,
  generic: Package,
};

const STATUS_CLASS: Record<PresentationStatusTone, string> = {
  success: "bg-emerald-500 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500 text-red-700 dark:text-red-300",
  info: "bg-blue-500 text-blue-700 dark:text-blue-300",
  neutral: "bg-muted-foreground text-muted-foreground",
};

export function DocumentExperienceSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/10" aria-label="Đang tải chứng từ">
      <div className="shrink-0 border-b bg-card px-4 py-2 sm:px-5">
        <div className="mx-auto flex h-11 w-full max-w-[96rem] animate-pulse items-center gap-2.5">
          <div className="size-8 rounded-lg bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-4 w-44 rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-[45%] rounded bg-muted" />
          </div>
          <div className="hidden h-7 w-40 rounded-md bg-muted sm:block" />
        </div>
      </div>
      <div className="min-h-0 flex-1 animate-pulse p-3">
        <div className="h-full rounded-lg bg-card" />
      </div>
    </div>
  );
}

export function DocumentExperience({
  meta,
  doc,
  children,
}: {
  meta: DocTypeMeta;
  doc: Doc;
  children: ReactNode;
}) {
  const presentation = resolveDocumentPresentation(meta, doc);
  const [contextOpen, setContextOpen] = useState(false);
  if (!presentation) return <>{children}</>;

  const Icon = ARCHETYPE_ICON[presentation.archetype];
  const profile = resolveDocumentExperienceProfile(presentation.archetype);
  const systemModified = doc.modified ? String(doc.modified) : "";
  const systemOwner = doc.owner ? String(doc.owner) : "";
  const compactMetrics = presentation.metrics.slice(0, 2);

  return (
    <div
      className="mf-document-experience relative flex h-full min-h-0 flex-col overflow-hidden bg-muted/10"
      data-archetype={presentation.archetype}
    >
      <style>{`
        .mf-document-experience .mf-form-header > div:first-child > div:first-child > div:first-child > span:first-child,
        .mf-document-experience .mf-form-header > div:first-child > div:first-child > div:last-child {
          display: none;
        }

        @media (min-width: 640px) {
          .mf-document-experience .mf-form-header {
            position: static;
            border-bottom: 0;
            background: transparent;
            backdrop-filter: none;
          }

          .mf-document-experience .mf-form-header > div:first-child {
            position: absolute;
            top: 0.62rem;
            right: 1rem;
            z-index: 40;
            min-height: 0;
            width: auto;
            padding: 0;
            gap: 0.3rem;
            background: transparent;
          }

          .mf-document-experience .mf-form-header > div:first-child > div:first-child {
            min-width: 0;
          }

          .mf-document-experience .mf-form-header > div:first-child > div:first-child > div:first-child {
            min-height: 1.75rem;
            align-items: center;
          }

          .mf-document-experience .mf-form-header button {
            box-shadow: none;
          }
        }
      `}</style>

      <section
        className={cn(
          "mf-document-hero relative shrink-0 border-b px-3 py-2 sm:px-5",
          profile.heroClass,
        )}
        aria-label="Tổng quan chứng từ"
      >
        <span className={cn("absolute inset-y-0 left-0 w-0.5", profile.accentClass)} aria-hidden="true" />
        <div className="mx-auto flex min-h-11 w-full max-w-[96rem] items-center sm:pr-[22rem]">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg ring-1",
              profile.iconClass,
            )}>
              <Icon className="size-4" />
            </span>

            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="max-w-full truncate text-[15px] font-semibold leading-5 tracking-tight sm:text-base">
                  {presentation.title}
                </h1>
                {presentation.status ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", STATUS_CLASS[presentation.statusTone].split(" ")[0])} />
                    {presentation.status}
                  </span>
                ) : null}
              </div>

              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] text-muted-foreground">
                <span className="truncate">{presentation.subtitle}</span>
                {compactMetrics.map((metric) => (
                  <span key={metric.field} className="hidden shrink-0 items-center gap-1 sm:inline-flex">
                    <span className="text-border">•</span>
                    <span>{metric.label}</span>
                    <strong className="font-semibold tabular-nums text-foreground">
                      {formatPresentationValue(metric.value, metric.format)}
                    </strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={cn(
        "relative grid min-h-0 flex-1 transition-[grid-template-columns] duration-150",
        contextOpen ? "lg:grid-cols-[minmax(0,1fr)_18rem]" : "lg:grid-cols-1",
      )}>
        <div className="min-w-0 overflow-hidden bg-card">{children}</div>
        <aside
          className={cn(
            "hidden min-h-0 flex-col lg:flex",
            contextOpen
              ? "overflow-auto border-l bg-card shadow-[-8px_0_24px_-24px_rgba(0,0,0,0.35)]"
              : "pointer-events-none absolute right-2 top-2 z-30 overflow-visible border-0 bg-transparent",
          )}
          aria-label="Ngữ cảnh chứng từ"
        >
          {contextOpen ? (
            <>
              <div className="border-b px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[9px] font-semibold uppercase tracking-[0.12em]", profile.kickerClass)}>Ngữ cảnh</p>
                    <h2 className="mt-0.5 text-sm font-semibold">{profile.railTitle}</h2>
                  </div>
                  <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setContextOpen(false)}
                    aria-label="Thu gọn ngữ cảnh"
                    title="Thu gọn ngữ cảnh"
                  >
                    <PanelRightClose className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-0.5 p-2">
                {presentation.contextItems.length ? presentation.contextItems.map((item) => (
                  <div key={item.field} className="rounded-md px-2 py-1.5 hover:bg-muted/45">
                    <div className="text-[9px] font-medium uppercase tracking-[0.05em] text-muted-foreground">{item.label}</div>
                    <div className="mt-0.5 break-words text-xs font-medium leading-5">{formatPresentationValue(item.value, item.format)}</div>
                  </div>
                )) : null}
              </div>

              <div className="mt-auto border-t p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <Clock3 className="size-3 text-muted-foreground" /> Hệ thống
                </div>
                <dl className="mt-1.5 space-y-1.5 text-[11px]">
                  <div>
                    <dt className="text-muted-foreground">DocType</dt>
                    <dd className="font-medium">{meta.label ?? meta.name}</dd>
                  </div>
                  {doc.name ? (
                    <div>
                      <dt className="text-muted-foreground">Mã</dt>
                      <dd className="break-all font-mono text-[10px]">{String(doc.name)}</dd>
                    </div>
                  ) : null}
                  {systemModified ? (
                    <div>
                      <dt className="text-muted-foreground">Cập nhật</dt>
                      <dd className="font-medium">{systemModified}</dd>
                    </div>
                  ) : null}
                  {systemOwner ? (
                    <div>
                      <dt className="text-muted-foreground">Người tạo</dt>
                      <dd className="break-all font-medium">{systemOwner}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="pointer-events-auto grid size-7 place-items-center rounded-md border bg-card/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setContextOpen(true)}
              aria-label="Mở ngữ cảnh"
              title="Mở ngữ cảnh"
              aria-expanded="false"
            >
              <PanelRightOpen className="size-3.5" />
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
