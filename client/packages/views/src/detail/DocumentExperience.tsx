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
  CircleDot,
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
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  info: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  neutral: "border-border bg-muted/60 text-muted-foreground",
};

export function DocumentExperienceSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/20" aria-label="Đang tải chứng từ">
      <div className="shrink-0 border-b bg-card px-4 py-3 sm:px-5">
        <div className="mx-auto w-full max-w-[96rem] animate-pulse space-y-3">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-5 w-56 max-w-[65%] rounded bg-muted" />
              <div className="h-3 w-40 max-w-[50%] rounded bg-muted" />
            </div>
          </div>
          <div className="h-9 rounded-lg bg-muted" />
        </div>
      </div>
      <div className="min-h-0 flex-1 animate-pulse p-4">
        <div className="h-full rounded-xl border bg-card" />
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

  return (
    <div
      className="mf-document-experience relative flex h-full min-h-0 flex-col overflow-hidden bg-muted/20"
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
            top: 0.72rem;
            right: 1.25rem;
            z-index: 40;
            min-height: 0;
            width: auto;
            padding: 0;
            gap: 0.45rem;
            background: transparent;
          }

          .mf-document-experience .mf-form-header > div:first-child > div:first-child {
            min-width: 0;
          }

          .mf-document-experience .mf-form-header > div:first-child > div:first-child > div:first-child {
            min-height: 2rem;
            align-items: center;
          }
        }
      `}</style>

      <section
        className={cn(
          "mf-document-hero relative shrink-0 overflow-hidden border-b px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3",
          profile.heroClass,
        )}
        aria-label="Tổng quan chứng từ"
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", profile.accentClass)} aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[96rem]">
          <div className="min-w-0 sm:pr-[24rem] xl:pr-[30rem]">
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl ring-1 shadow-sm",
                profile.iconClass,
              )}>
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className={cn("text-[9px] font-semibold uppercase tracking-[0.17em]", profile.kickerClass)}>
                  {presentation.eyebrow}
                </p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="max-w-full truncate text-lg font-semibold tracking-tight sm:text-xl">{presentation.title}</h1>
                  {presentation.status ? (
                    <span className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      STATUS_CLASS[presentation.statusTone],
                    )}>
                      <CircleDot className="size-2.5" />
                      {presentation.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 max-w-3xl truncate text-xs text-muted-foreground">{presentation.subtitle}</p>
              </div>
            </div>
          </div>

          {presentation.metrics.length ? (
            <div
              className="mt-2.5 flex max-w-full flex-wrap items-stretch gap-x-1 rounded-xl border bg-card/55 p-1 shadow-sm backdrop-blur-sm"
              aria-label="Chỉ số chứng từ"
            >
              {presentation.metrics.map((metric, index) => (
                <div
                  key={metric.field}
                  className={cn(
                    "min-w-[8.5rem] flex-1 rounded-lg px-3 py-1.5 sm:flex-none sm:min-w-[9.5rem]",
                    index === 0 && "bg-background/55",
                  )}
                >
                  <div className="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</div>
                  <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">
                    {formatPresentationValue(metric.value, metric.format)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {presentation.progress.length ? (
            <div className="mt-2.5 overflow-x-auto pb-0.5" aria-label="Tiến độ nghiệp vụ">
              <ol className="flex min-w-max items-center">
                {presentation.progress.map((step, index) => (
                  <li key={`${step.label}-${index}`} className="flex items-center">
                    {index > 0 ? <span className={cn("h-px w-7 sm:w-10", step.state === "todo" ? "bg-border" : "bg-primary/45")} /> : null}
                    <span className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
                      step.state === "done" && "border-primary/20 bg-primary/10 text-primary",
                      step.state === "active" && "border-primary/35 bg-primary text-primary-foreground shadow-sm",
                      step.state === "todo" && "border-border bg-muted/35 text-muted-foreground",
                    )}>
                      <span className={cn("size-1.5 rounded-full", step.state === "todo" ? "bg-muted-foreground/40" : step.state === "active" ? "bg-primary-foreground" : "bg-primary")} />
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {presentation.contextItems.length ? (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5 lg:hidden" aria-label="Thông tin nhanh">
              {presentation.contextItems.slice(0, 4).map((item) => (
                <div key={item.field} className={cn("min-w-[8.5rem] shrink-0 rounded-lg border px-2.5 py-1.5", profile.metricClass)}>
                  <div className="truncate text-[9px] text-muted-foreground">{item.label}</div>
                  <div className="mt-0.5 truncate text-xs font-medium">{formatPresentationValue(item.value, item.format)}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className={cn(
        "relative grid min-h-0 flex-1 transition-[grid-template-columns] duration-200",
        contextOpen ? "lg:grid-cols-[minmax(0,1fr)_18rem]" : "lg:grid-cols-1",
      )}>
        <div className="min-w-0 overflow-hidden bg-card">{children}</div>
        <aside
          className={cn(
            "hidden min-h-0 flex-col lg:flex",
            contextOpen
              ? "overflow-auto border-l bg-card/90 shadow-[-8px_0_24px_-24px_rgba(0,0,0,0.4)]"
              : "pointer-events-none absolute right-3 top-3 z-30 overflow-visible border-0 bg-transparent",
          )}
          aria-label="Ngữ cảnh chứng từ"
        >
          {contextOpen ? (
            <>
              <div className="border-b px-4 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", profile.kickerClass)}>Ngữ cảnh</p>
                    <h2 className="mt-0.5 text-sm font-semibold">{profile.railTitle}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{profile.railDescription}</p>
                  </div>
                  <button
                    type="button"
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setContextOpen(false)}
                    aria-label="Thu gọn ngữ cảnh"
                    title="Thu gọn ngữ cảnh"
                  >
                    <PanelRightClose className="size-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1 p-2.5">
                {presentation.contextItems.length ? presentation.contextItems.map((item) => (
                  <div key={item.field} className="rounded-lg px-2.5 py-2 hover:bg-muted/45">
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{item.label}</div>
                    <div className="mt-0.5 break-words text-sm font-medium leading-5">{formatPresentationValue(item.value, item.format)}</div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-5 text-center text-xs text-muted-foreground">Chưa có trường ngữ cảnh phù hợp.</div>
                )}
              </div>

              <div className="mt-auto border-t p-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Clock3 className="size-3.5 text-muted-foreground" /> Hệ thống
                </div>
                <dl className="mt-2 space-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">DocType</dt>
                    <dd className="mt-0.5 break-words font-medium">{meta.label ?? meta.name}</dd>
                  </div>
                  {doc.name ? (
                    <div>
                      <dt className="text-muted-foreground">Mã chứng từ</dt>
                      <dd className="mt-0.5 break-all font-mono text-[11px]">{String(doc.name)}</dd>
                    </div>
                  ) : null}
                  {systemModified ? (
                    <div>
                      <dt className="text-muted-foreground">Cập nhật</dt>
                      <dd className="mt-0.5 font-medium">{systemModified}</dd>
                    </div>
                  ) : null}
                  {systemOwner ? (
                    <div>
                      <dt className="text-muted-foreground">Người tạo</dt>
                      <dd className="mt-0.5 break-all font-medium">{systemOwner}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="pointer-events-auto grid size-9 place-items-center rounded-lg border bg-card/95 text-muted-foreground shadow-md backdrop-blur transition-all hover:-translate-x-0.5 hover:bg-muted hover:text-foreground"
              onClick={() => setContextOpen(true)}
              aria-label="Mở ngữ cảnh"
              title="Mở ngữ cảnh"
              aria-expanded="false"
            >
              <PanelRightOpen className="size-4" />
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
