/*
 * Forge UI V3 data-surface presentation layer.
 *
 * This is intentionally a class-only adapter over the existing metadata-driven views.
 * It does not own data, permissions, document state, workflow, table state, or domain logic.
 * Tailwind scans @metaforge/views/src through @metaforge/ui's @source contract, so keeping
 * the classes static here gives V3 one rollout seam without adding a second CSS authority.
 */

export const V3_DATA_SURFACE_CLASS = [
  "mf-data-surface-v3",
  "isolate",
  "flex",
  "h-full",
  "min-h-0",
  "min-w-0",
  "flex-col",
  "overflow-hidden",
  "bg-background",

  // List / table: business-neutral hierarchy instead of the legacy command-center treatment.
  "[&_.mf-list-view]:!bg-background",
  "[&_.mf-list-toolbar]:sticky",
  "[&_.mf-list-toolbar]:top-0",
  "[&_.mf-list-toolbar]:z-20",
  "[&_.mf-list-toolbar]:!border-border/70",
  "[&_.mf-list-toolbar]:!bg-card/95",
  "[&_.mf-list-toolbar]:!shadow-sm",
  "[&_.mf-list-toolbar]:backdrop-blur-xl",
  "[&_.mf-list-filterbar]:min-h-12",
  "[&_.mf-list-filterbar]:!gap-2",
  "[&_.mf-list-filterbar]:!px-4",
  "[&_.mf-list-filterbar]:!py-2.5",
  "[&_.mf-list-filterbar_input]:h-9",
  "[&_.mf-list-filterbar_button]:min-h-8",
  "[&_.mf-bulk-bar]:!mx-3",
  "[&_.mf-bulk-bar]:!mt-2",
  "[&_.mf-bulk-bar]:!rounded-lg",
  "[&_.mf-bulk-bar]:!border",
  "[&_.mf-bulk-bar]:!border-primary/20",
  "[&_.mf-bulk-bar]:!bg-primary/5",
  "[&_.mf-bulk-bar]:!shadow-sm",
  "md:[&_.mf-list-scroll]:m-3",
  "md:[&_.mf-list-scroll]:rounded-lg",
  "md:[&_.mf-list-scroll]:border",
  "md:[&_.mf-list-scroll]:border-border/70",
  "md:[&_.mf-list-scroll]:!bg-card",
  "md:[&_.mf-list-scroll]:shadow-sm",
  "[&_.mf-list-view_thead_th]:!h-9",
  "[&_.mf-list-view_thead_th]:!border-border/70",
  "[&_.mf-list-view_thead_th]:!bg-muted",
  "[&_.mf-list-view_thead_th]:!text-[11px]",
  "[&_.mf-list-view_thead_th]:!font-semibold",
  "[&_.mf-list-view_thead_th]:!tracking-[0.06em]",
  "[&_.mf-list-view_thead_th]:!text-muted-foreground",
  "[&_.mf-list-view_thead_th]:!shadow-[inset_0_-1px_0_var(--border)]",
  "[&_.mf-list-view_tbody_tr]:outline-none",
  "[&_.mf-list-view_tbody_tr]:transition-[background-color,box-shadow]",
  "[&_.mf-list-view_tbody_tr]:duration-150",
  "[&_.mf-list-view_tbody_td]:!border-border/60",
  "[&_.mf-list-mobile]:!divide-y-0",
  "[&_.mf-list-mobile]:space-y-2",
  "[&_.mf-list-mobile]:p-2",
  "[&_.mf-list-mobile_article]:!rounded-lg",
  "[&_.mf-list-mobile_article]:border",
  "[&_.mf-list-mobile_article]:border-border/70",
  "[&_.mf-list-mobile_article]:shadow-sm",
  "[&_.mf-list-mobile_article]:transition-[background-color,box-shadow]",
  "[&_.mf-list-mobile_article]:duration-150",
  "[&_.mf-list-mobile_article:hover]:shadow-md",
  "[&_.mf-list-mobile_article:focus-visible]:ring-2",
  "[&_.mf-list-mobile_article:focus-visible]:ring-ring",
  "[&_.mf-list-mobile_article:focus-visible]:ring-offset-1",
  "[&_.mf-list-mobile_article:focus-visible]:ring-offset-background",

  // Form / detail: compact enterprise surface, one canonical renderer remains authoritative.
  "[&_.mf-form-view]:!bg-background",
  "[&_.mf-form-header]:!border-border/70",
  "[&_.mf-form-header]:!bg-card/95",
  "[&_.mf-form-header]:!shadow-sm",
  "[&_.mf-form-header]:backdrop-blur-xl",
  "[&_.mf-form-body]:!bg-none",
  "[&_.mf-form-body]:!bg-background",
  "[&_.mf-form-section]:!my-2",
  "[&_.mf-form-section]:!rounded-lg",
  "[&_.mf-form-section]:!border",
  "[&_.mf-form-section]:!border-border/70",
  "[&_.mf-form-section]:!bg-card",
  "[&_.mf-form-section]:!px-4",
  "[&_.mf-form-section]:!py-3.5",
  "[&_.mf-form-section]:!shadow-sm",
  "[&_.mf-section-heading]:!mb-3",
  "[&_.mf-section-heading_h3]:!text-[11px]",
  "[&_.mf-section-heading_h3]:!font-bold",
  "[&_.mf-section-heading_h3]:uppercase",
  "[&_.mf-section-heading_h3]:tracking-[0.06em]",
  "[&_.mf-section-heading_h3]:!text-muted-foreground",
  "[&_.mf-field_input]:min-h-9",
  "[&_.mf-field_button]:min-h-9",
  "[&_.mf-field-error]:rounded-md",
  "[&_.mf-field-error]:bg-destructive/5",
  "[&_.mf-form-footer]:!border-border/70",
  "[&_.mf-form-footer]:!bg-card/95",
  "[&_.mf-form-footer]:shadow-[0_-1px_8px_rgb(0_0_0/0.04)]",

  // Detail/context panes remain subordinate to the record surface, never a competing screen.
  "[&_.mf-split]:!bg-background",
  "[&_.mf-context-frame]:!border-border/70",
  "[&_.mf-context-frame]:!bg-card",
  "[&_.mf-context-panel]:!bg-card",
  "[&_.mf-context-tabs]:sticky",
  "[&_.mf-context-tabs]:top-0",
  "[&_.mf-context-tabs]:z-10",
  "[&_.mf-context-tabs]:!border-border/70",
  "[&_.mf-context-tabs]:!bg-card/95",
  "[&_.mf-context-tabs]:backdrop-blur-xl",

  // Motion is functional and short. OS reduced-motion wins over the V3 polish layer.
  "motion-reduce:[&_*]:!animate-none",
  "motion-reduce:[&_*]:!transition-none",
].join(" ");

export const V3_VIEW_SWITCHER_CLASS =
  "mf-view-switcher flex shrink-0 items-center gap-1 border-b border-border/70 bg-card/95 px-3 py-2 shadow-sm backdrop-blur-xl";

export const V3_CONFIRM_DIALOG_CLASS =
  "w-[min(92vw,28rem)] max-w-none overflow-hidden rounded-xl border border-border/70 bg-card p-0 shadow-2xl";

export const V3_QUICK_ENTRY_DIALOG_CLASS =
  "fixed left-1/2 top-[4vh] -translate-x-1/2 !translate-y-0 duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 !zoom-in-100 flex max-h-[92vh] w-[min(96vw,68rem)] max-w-none flex-col overflow-hidden rounded-xl border border-border/70 bg-card p-0 shadow-2xl outline-none focus:outline-none focus-visible:outline-none motion-reduce:duration-0 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none";
