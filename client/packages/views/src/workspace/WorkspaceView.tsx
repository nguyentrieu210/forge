/** @jsxImportSource react */
/**
 * WorkspaceView (M-Workspace, presentational) — landing từ get_workspaces + get_desktop_page.
 * Switcher workspace + shortcuts (grid card, click → link_to) + cards (nhóm link). Data-driven,
 * KHÔNG hardcode. Container lo adapter.getWorkspaces/getWorkspace.
 */
import { LayoutGrid, ArrowRight, FileText, BarChart3, ExternalLink, Gauge, ListTree, Blocks, GraduationCap } from "lucide-react";
import { cn, Button, Badge, ScrollArea, useT } from "@metaforge/ui";

export interface WsItem {
  name: string;
  label: string;
  icon?: string;
  public?: 0 | 1;
}
export interface WsShortcut {
  label?: string;
  link_to?: string;
  type?: string; // DocType | Report | Page | URL | Dashboard
  color?: string;
  stats_filter?: string;
  format?: string;
}
export interface WsCardLink {
  label?: string;
  link_to?: string;
  link_type?: string;
  onboard?: number;
}
export interface WsCard {
  label?: string;
  links?: WsCardLink[];
}
export interface WsArtifact {
  name?: string;
  label?: string;
  title?: string;
  type?: string;
  link_to?: string;
  document_type?: string;
  report_name?: string;
  chart_name?: string;
  route?: string;
  [key: string]: unknown;
}
export interface WsPage {
  shortcuts?: WsShortcut[];
  cards?: WsCard[];
  number_cards?: WsArtifact[];
  charts?: WsArtifact[];
  onboardings?: WsArtifact[];
  quick_lists?: WsArtifact[];
  custom_blocks?: WsArtifact[];
}

export interface WorkspaceViewProps {
  workspaces: WsItem[];
  active?: string;
  page?: WsPage;
  loading?: boolean;
  onSelect: (name: string) => void;
  onOpenLink: (link: { type?: string; link_to?: string }) => void;
}

function linkIcon(type?: string) {
  if (type === "Report") return <BarChart3 className="size-4" />;
  if (type === "URL") return <ExternalLink className="size-4" />;
  return <FileText className="size-4" />;
}

function artifactLabel(item: WsArtifact, t: (k: string, f?: string) => string): string {
  return String(item.label ?? item.title ?? item.name ?? item.chart_name ?? item.report_name ?? item.document_type ?? t("workspace.block_label"));
}
function artifactTarget(item: WsArtifact): string | undefined {
  const target = item.link_to ?? item.route ?? item.document_type ?? item.report_name ?? item.chart_name ?? item.name;
  return target ? String(target) : undefined;
}
function artifactIcon(kind: string) {
  if (kind === "number_cards") return <Gauge className="size-4" />;
  if (kind === "charts") return <BarChart3 className="size-4" />;
  if (kind === "quick_lists") return <ListTree className="size-4" />;
  if (kind === "onboardings") return <GraduationCap className="size-4" />;
  return <Blocks className="size-4" />;
}

export function WorkspaceView(props: WorkspaceViewProps) {
  const t = useT();
  const { workspaces, active, page } = props;
  const shortcuts = page?.shortcuts ?? [];
  const cards = page?.cards ?? [];
  const artifactSections = [
    { key: "number_cards", label: t("workspace.block_number"), items: page?.number_cards ?? [], type: "Number Card" },
    { key: "charts", label: t("workspace.block_chart"), items: page?.charts ?? [], type: "Dashboard" },
    { key: "quick_lists", label: t("workspace.block_quicklist"), items: page?.quick_lists ?? [], type: "DocType" },
    { key: "onboardings", label: t("workspace.block_onboarding"), items: page?.onboardings ?? [], type: "Page" },
    { key: "custom_blocks", label: t("workspace.block_custom"), items: page?.custom_blocks ?? [], type: "Page" },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="mf-workspace flex h-full min-h-0 gap-5 p-4 md:p-5">
      {/* switcher */}
      <div className="mf-workspace-switcher w-56 shrink-0">
        <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <LayoutGrid className="size-4" /> {t("workspace.switcher_title")}
        </div>
        <ScrollArea className="h-[calc(100%-2rem)]">
          <div className="space-y-0.5 pr-2">
            {workspaces.map((w) => (
              <Button
                key={w.name}
                variant={w.name === active ? "secondary" : "ghost"}
                className={cn("w-full justify-start gap-2 font-normal", w.name === active && "font-medium")}
                onClick={() => props.onSelect(w.name)}
              >
                <span className="truncate">{w.label}</span>
                {w.public ? null : <Badge variant="outline" className="ml-auto text-[10px]">{t("workspace.private")}</Badge>}
              </Button>
            ))}
            {workspaces.length === 0 && !props.loading ? (
              <div className="px-2 text-sm text-muted-foreground">{t("workspace.none")}</div>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      {/* content */}
      <div className="min-w-0 flex-1 overflow-auto">
        {props.loading ? (
          <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("workspace.loading")}</div>
        ) : (
          <div className="space-y-6">
            {shortcuts.length ? (
              <section>
                <h3 className="mb-3 text-sm font-semibold">{t("workspace.shortcuts")}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                  {shortcuts.map((s, i) => (
                    <Button
                      key={`${s.link_to}-${i}`}
                      variant="ghost"
                      onClick={() => props.onOpenLink({ type: s.type, link_to: s.link_to })}
                      className="mf-workspace-shortcut group h-auto w-full justify-start gap-2.5 p-3 text-left font-normal"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">{linkIcon(s.type)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.label ?? s.link_to}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.type ?? "DocType"}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            {cards.length ? (
              <section>
                <h3 className="mb-3 text-sm font-semibold">{t("workspace.cards")}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {cards.map((c, i) => (
                    <div key={`${c.label}-${i}`} className="mf-section-card">
                      <div className="mb-2 text-sm font-medium">{c.label}</div>
                      <ul className="space-y-0.5">
                        {(c.links ?? []).map((l, j) => (
                          <li key={`${l.link_to}-${j}`}>
                            <Button
                              variant="ghost"
                              onClick={() => props.onOpenLink({ type: l.link_type, link_to: l.link_to })}
                              className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1 text-left text-sm font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              {linkIcon(l.link_type)}
                              <span className="truncate">{l.label ?? l.link_to}</span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}


            {artifactSections.map((section) => (
              <section key={section.key}>
                <h3 className="mb-3 text-sm font-semibold">{section.label}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {section.items.map((item, index) => {
                    const target = artifactTarget(item);
                    const supported = Boolean(target) && section.key !== "custom_blocks";
                    return (
                      <Button
                        key={`${section.key}-${target ?? index}`}
                        type="button"
                        variant="ghost"
                        disabled={!supported}
                        onClick={() => supported && props.onOpenLink({ type: String(item.type ?? section.type), link_to: target })}
                        className="h-auto min-h-24 w-full items-start justify-start gap-3 rounded-xl border bg-card p-3 text-left font-normal shadow-sm hover:border-primary/30 hover:bg-accent/40 disabled:opacity-100"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{artifactIcon(section.key)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{artifactLabel(item, t)}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{supported ? String(item.type ?? section.type) : t("workspace.no_renderer")}</span>
                        </span>
                        {supported ? <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" /> : null}
                      </Button>
                    );
                  })}
                </div>
              </section>
            ))}

            {!shortcuts.length && !cards.length && !artifactSections.length ? (
              <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("workspace.empty")}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
