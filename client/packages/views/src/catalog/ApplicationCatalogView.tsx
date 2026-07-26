/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { AppWindow, ArrowRight, BarChart3, Boxes, FileText, LayoutGrid, Search, Settings, Wrench } from "lucide-react";
import type { ApplicationCatalog, CatalogApplication, CatalogItem, CatalogSection } from "@metaforge/core";
import { Badge, Button, Input, ScrollArea, Skeleton, cn, useT } from "@metaforge/ui";

export interface ApplicationCatalogViewProps {
  catalog?: ApplicationCatalog;
  loading?: boolean;
  error?: string;
  activeWorkspace?: string;
  onNavigate: (route: string) => void;
  onRefresh?: () => void;
}

function itemIcon(item: CatalogItem) {
  if (item.kind === "report" || item.kind === "dashboard") return <BarChart3 className="size-4" />;
  if (item.kind === "page" || item.kind === "route" || item.kind === "experience") return <AppWindow className="size-4" />;
  if (item.kind === "system") return <Settings className="size-4" />;
  return <FileText className="size-4" />;
}

function sectionIcon(section: CatalogSection) {
  if (section.kind === "masters") return <Boxes className="size-4" />;
  if (section.kind === "reports") return <BarChart3 className="size-4" />;
  if (section.kind === "settings") return <Settings className="size-4" />;
  if (section.kind === "tools") return <Wrench className="size-4" />;
  return <LayoutGrid className="size-4" />;
}

export function ApplicationCatalogView(props: ApplicationCatalogViewProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const apps = props.catalog?.apps ?? [];
  const normalized = query.trim().toLocaleLowerCase("vi");
  const filtered = useMemo(() => apps.map((app) => filterApp(app, normalized)).filter(Boolean) as CatalogApplication[], [apps, normalized]);

  if (props.loading) return <CatalogSkeleton />;
  if (props.error) return <div className="grid min-h-80 place-items-center rounded-xl border bg-card p-8 text-center"><div><div className="font-semibold text-destructive">{t("catalog.load_error")}</div><p className="mt-1 text-sm text-muted-foreground">{props.error}</p>{props.onRefresh ? <Button className="mt-4" variant="outline" onClick={props.onRefresh}>{t("common.retry")}</Button> : null}</div></div>;

  return (
    <div className="mf-application-catalog mx-auto flex h-full max-w-[1700px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("catalog.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("catalog.subtitle")}</p>
        </div>
        <div className="relative ml-auto w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder={t("catalog.search_placeholder")} />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-2">
        <div className="space-y-6 pb-8">
          {filtered.map((app) => (
            <section key={app.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><AppWindow className="size-4" /></span>
                <div><h2 className="font-semibold">{app.label}</h2>{app.module && app.module !== app.label ? <p className="text-xs text-muted-foreground">{app.module}</p> : null}</div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {app.workspaces.map((workspace) => (
                  <article key={workspace.key} className={cn("rounded-xl border bg-card shadow-sm", workspace.key === props.activeWorkspace && "border-primary/50 ring-1 ring-primary/15")}>
                    <Button type="button" variant="ghost" onClick={() => props.onNavigate(workspace.route)} className="h-auto w-full justify-start gap-3 rounded-none border-b px-4 py-3 text-left font-normal hover:bg-accent/50">
                      <span className="grid size-8 place-items-center rounded-lg bg-muted"><LayoutGrid className="size-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{workspace.label}</span><span className="block truncate text-xs text-muted-foreground">{workspace.module ?? app.module ?? "Workspace"}</span></span>
                      {!workspace.public ? <Badge variant="outline">{t("catalog.private")}</Badge> : null}
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </Button>
                    <div className="grid gap-4 p-4 sm:grid-cols-2">
                      {workspace.sections.map((section) => (
                        <div key={section.key} className="min-w-0">
                          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sectionIcon(section)}<span className="truncate">{section.label}</span></div>
                          <div className="space-y-0.5">
                            {section.items.map((item) => (
                              <Button key={`${section.key}:${item.key}`} variant="ghost" disabled={Boolean(item.disabledReason)} title={item.disabledReason} onClick={() => props.onNavigate(item.route)} className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal">
                                <span className="shrink-0 text-muted-foreground">{itemIcon(item)}</span>
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {typeof item.badge === "number" ? <Badge variant="secondary">{item.badge}</Badge> : null}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!filtered.length ? <div className="grid min-h-60 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{t("catalog.no_match")}</div> : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function filterApp(app: CatalogApplication, query: string): CatalogApplication | null {
  if (!query) return app;
  if (`${app.label} ${app.module ?? ""}`.toLocaleLowerCase("vi").includes(query)) return app;
  const workspaces = app.workspaces.map((workspace) => {
    if (`${workspace.label} ${workspace.module ?? ""}`.toLocaleLowerCase("vi").includes(query)) return workspace;
    const sections = workspace.sections.map((section) => {
      if (section.label.toLocaleLowerCase("vi").includes(query)) return section;
      const items = section.items.filter((item) => `${item.label} ${item.key} ${item.doctype ?? ""}`.toLocaleLowerCase("vi").includes(query));
      return items.length ? { ...section, items } : null;
    }).filter(Boolean) as CatalogSection[];
    return sections.length ? { ...workspace, sections } : null;
  }).filter(Boolean) as CatalogApplication["workspaces"];
  return workspaces.length ? { ...app, workspaces } : null;
}

function CatalogSkeleton() {
  return <div className="space-y-4"><div className="flex justify-between"><Skeleton className="h-12 w-72" /><Skeleton className="h-9 w-80" /></div><div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div></div>;
}
