/** @jsxImportSource react */
import { useState, type ReactNode } from "react";
import type { Doc, DocTypeMeta } from "@metaforge/core";
import { cn } from "@metaforge/ui";
import {
  Boxes,
  Check,
  Circle,
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
  Sparkles,
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

const STATUS_DOT_CLASS: Record<PresentationStatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-muted-foreground",
};

const STATUS_BADGE_CLASS: Record<PresentationStatusTone, string> = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
  info: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  neutral: "border-border bg-muted/55 text-muted-foreground",
};

export function DocumentExperienceSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/10" aria-label="Đang tải chứng từ">
      <div className="shrink-0 border-b bg-card px-3 py-2.5 sm:px-4">
        <div className="mx-auto w-full max-w-[96rem] animate-pulse space-y-2.5">
          <div className="flex h-10 items-center gap-2">
            <div className="size-8 rounded-lg bg-muted" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-40 rounded bg-muted" />
              <div className="h-2.5 w-56 max-w-[40%] rounded bg-muted" />
            </div>
            <div className="hidden h-7 w-28 rounded-lg bg-muted sm:block" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-12 rounded-lg bg-muted/70" />)}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 animate-pulse p-2.5">
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
  const compactMetrics = presentation.metrics.slice(0, 4);

  return (
    <div
      className="mf-document-experience relative flex h-full min-h-0 flex-col overflow-hidden bg-muted/10"
      data-archetype={presentation.archetype}
    >
      <style>{`
        .mf-document-experience {
          container-type: inline-size;
        }

        .mf-document-experience .mf-form-header > div:first-child > div:first-child > div:first-child > span:first-child,
        .mf-document-experience .mf-form-header > div:first-child > div:first-child > div:last-child,
        .mf-document-experience .mf-dirty {
          display: none;
        }

        .mf-document-experience .mf-form-section {
          margin-top: .4rem;
          border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
          border-radius: .75rem;
          background: color-mix(in srgb, var(--card) 96%, var(--muted));
          padding: .75rem;
          box-shadow: 0 1px 2px rgb(0 0 0 / .025);
        }

        .mf-document-experience .mf-section-heading {
          margin-bottom: .6rem;
          gap: .5rem;
          opacity: .82;
        }

        .mf-document-experience .mf-section-heading h3 {
          font-size: 10.5px;
          line-height: 1rem;
          font-weight: 700;
          letter-spacing: .055em;
          text-transform: uppercase;
        }

        .mf-document-experience .mf-form-grid {
          column-gap: .75rem;
          row-gap: .7rem;
        }

        .mf-document-experience .mf-form-body {
          background:
            radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--primary) 5%, transparent), transparent 24rem),
            var(--background);
        }

        .mf-document-experience .mf-form-body > div:last-child {
          max-width: 96rem;
          padding-left: .75rem;
          padding-right: .75rem;
          padding-bottom: 1rem;
        }

        .mf-document-experience .mf-form-header {
          position: static;
          border-bottom: 0;
          background: transparent;
          backdrop-filter: none;
        }

        .mf-document-experience .mf-form-header > div:first-child {
          position: absolute;
          top: -2.35rem;
          right: .65rem;
          z-index: 40;
          min-height: 0;
          width: auto;
          padding: 0;
          gap: .2rem;
          background: transparent;
        }

        .mf-document-experience .mf-form-header > div:first-child > div:first-child {
          min-width: 0;
        }

        .mf-document-experience .mf-form-header > div:first-child > div:first-child > div:first-child {
          min-height: 1.5rem;
          align-items: center;
        }

        .mf-document-experience .mf-form-header > div:first-child > div:last-child {
          gap: .2rem;
          flex-wrap: nowrap;
        }

        .mf-document-experience .mf-form-header button {
          border-radius: .55rem;
          box-shadow: none;
        }

        .mf-document-experience .mf-form-header [role="tablist"] {
          height: 2.1rem;
          margin-top: .35rem;
          border-radius: .65rem;
          border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
          background: color-mix(in srgb, var(--card) 94%, var(--muted));
          padding-left: .25rem;
          padding-right: .25rem;
        }

        .mf-document-experience .mf-form-header [role="tab"] {
          height: 1.75rem;
          border-radius: .45rem;
          padding-left: .65rem;
          padding-right: .65rem;
          font-size: 11px;
        }

        .mf-document-experience .mf-document-hero-main {
          padding-right: 13.75rem;
        }

        @container (max-width: 720px) {
          .mf-document-experience .mf-metric-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @container (max-width: 420px) {
          .mf-document-experience .mf-document-hero-main {
            padding-right: 11.5rem;
          }

          .mf-document-experience .mf-document-hero-subtitle {
            display: none;
          }

          .mf-document-experience .mf-form-header > div:first-child {
            top: -2.2rem;
            right: .35rem;
          }

          .mf-document-experience .mf-metric-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      <section
        className={cn(
          "mf-document-hero relative shrink-0 overflow-hidden border-b px-3 py-2.5 sm:px-4",
          profile.heroClass,
        )}
        aria-label="Tổng quan chứng từ"
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", profile.accentClass)} aria-hidden="true" />
        <span className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-primary/[0.045] blur-2xl" aria-hidden="true" />
        <div className="mx-auto w-full max-w-[96rem]">
          <div className="mf-document-hero-main flex min-h-10 items-center">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg ring-1 shadow-sm",
                profile.iconClass,
              )}>
                <Icon className="size-4" />
              </span>

              <div className="min-w-0">
                <div className={cn("mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.13em]", profile.kickerClass)}>
                  <Sparkles className="size-2.5" /> {presentation.eyebrow}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="max-w-full truncate text-[15px] font-bold leading-5 tracking-tight sm:text-base">
                    {presentation.title}
                  </h1>
                  {presentation.status ? (
                    <span className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold",
                      STATUS_BADGE_CLASS[presentation.statusTone],
                    )}>
                      <span className={cn("size-1.5 rounded-full", STATUS_DOT_CLASS[presentation.statusTone])} />
                      {presentation.status}
                    </span>
                  ) : null}
                </div>

                <div className="mf-document-hero-subtitle mt-0.5 min-w-0 truncate text-[10.5px] leading-4 text-muted-foreground">
                  {presentation.subtitle}
                </div>
              </div>
            </div>
          </div>

          {compactMetrics.length ? (
            <div className="mf-metric-grid mt-2 grid grid-cols-4 gap-1.5">
              {compactMetrics.map((metric) => (
                <div key={metric.field} className="min-w-0 rounded-lg border border-border/65 bg-background/65 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                  <div className="truncate text-[8.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{metric.label}</div>
                  <div className="mt-0.5 truncate text-xs font-bold tabular-nums text-foreground sm:text-[13px]">
                    {formatPresentationValue(metric.value, metric.format)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {presentation.progress.length ? (
            <div className="mt-2 flex min-w-0 items-center overflow-x-auto rounded-lg border border-border/60 bg-background/55 px-2 py-1.5 backdrop-blur-sm" aria-label="Tiến trình chứng từ">
              {presentation.progress.map((step, index) => (
                <div key={`${step.label}-${index}`} className="flex min-w-0 flex-1 items-center">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border text-[8px]",
                      step.state === "done" && "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
                      step.state === "active" && "border-primary/35 bg-primary/12 text-primary ring-2 ring-primary/10",
                      step.state === "todo" && "border-border bg-muted/35 text-muted-foreground",
                    )}>
                      {step.state === "done" ? <Check className="size-2.5" /> : <Circle className="size-2" />}
                    </span>
                    <span className={cn(
                      "whitespace-nowrap text-[9.5px] font-medium",
                      step.state === "active" ? "text-foreground" : "text-muted-foreground",
                    )}>{step.label}</span>
                  </div>
                  {index < presentation.progress.length - 1 ? (
                    <span className={cn(
                      "mx-2 h-px min-w-4 flex-1",
                      step.state === "done" ? "bg-emerald-500/35" : "bg-border",
                    )} aria-hidden="true" />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className={cn(
        "relative grid min-h-0 flex-1 transition-[grid-template-columns] duration-150",
        contextOpen ? "lg:grid-cols-[minmax(0,1fr)_19rem]" : "lg:grid-cols-1",
      )}>
        <div className="min-w-0 overflow-hidden bg-card">{children}</div>
        <aside
          className={cn(
            "hidden min-h-0 flex-col lg:flex",
            contextOpen
              ? "overflow-auto border-l bg-card shadow-[-12px_0_32px_-28px_rgba(0,0,0,0.45)]"
              : "pointer-events-none absolute right-2 top-2 z-30 overflow-visible border-0 bg-transparent",
          )}
          aria-label="Ngữ cảnh chứng từ"
        >
          {contextOpen ? (
            <>
              <div className="border-b bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[9px] font-bold uppercase tracking-[0.13em]", profile.kickerClass)}>Ngữ cảnh</p>
                    <h2 className="mt-0.5 text-sm font-bold">{profile.railTitle}</h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Thông tin cần nhìn nhanh khi xử lý chứng từ.</p>
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

              <div className="grid gap-1.5 p-2.5">
                {presentation.contextItems.length ? presentation.contextItems.map((item) => (
                  <div key={item.field} className="rounded-lg border border-transparent bg-muted/25 px-2.5 py-2 transition-colors hover:border-border/70 hover:bg-muted/45">
                    <div className="text-[8.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{item.label}</div>
                    <div className="mt-0.5 break-words text-xs font-semibold leading-5">{formatPresentationValue(item.value, item.format)}</div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">Chưa có trường ngữ cảnh được khai cho chứng từ này.</div>
                )}
              </div>

              <div className="mt-auto border-t bg-muted/15 p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  <Clock3 className="size-3" /> Hệ thống
                </div>
                <dl className="mt-2 grid gap-1.5 text-[11px]">
                  <div className="rounded-md bg-background/70 px-2 py-1.5">
                    <dt className="text-[9px] text-muted-foreground">DocType</dt>
                    <dd className="font-semibold">{meta.label ?? meta.name}</dd>
                  </div>
                  {doc.name ? (
                    <div className="rounded-md bg-background/70 px-2 py-1.5">
                      <dt className="text-[9px] text-muted-foreground">Mã</dt>
                      <dd className="break-all font-mono text-[10px]">{String(doc.name)}</dd>
                    </div>
                  ) : null}
                  {systemModified ? (
                    <div className="rounded-md bg-background/70 px-2 py-1.5">
                      <dt className="text-[9px] text-muted-foreground">Cập nhật</dt>
                      <dd className="font-medium">{systemModified}</dd>
                    </div>
                  ) : null}
                  {systemOwner ? (
                    <div className="rounded-md bg-background/70 px-2 py-1.5">
                      <dt className="text-[9px] text-muted-foreground">Người tạo</dt>
                      <dd className="break-all font-medium">{systemOwner}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="pointer-events-auto grid size-8 place-items-center rounded-lg border bg-card/95 text-muted-foreground shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-muted hover:text-foreground hover:shadow-md"
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
