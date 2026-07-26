/** @jsxImportSource react */
/**
 * ContextPanel (M11 cột phải, luật #4 timeline) — presentational + PICKER thật (P2).
 * Tabs: Hoạt động (timeline + bình luận) | Chi tiết (Phụ trách/Tệp/Nhãn) | AI.
 * Picker: assign = combobox tìm user (searchUsers) · attach = FileButton · tag = input inline.
 * Mỗi mục có nút xoá (onRemove*). Handler thiếu ⇒ nút disable (KHÔNG nút giả). Optimistic/refetch
 * do container lo. UI 100% @metaforge/ui.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MessageSquarePlus, User, Paperclip, Tag, GitCommitHorizontal, Send, Workflow, Plus, Sparkles, X, Check,
  Share2, Link2, History, PanelRight,
} from "lucide-react";
import {
  Button, Input, Textarea, Badge, Avatar, AvatarFallback, Separator, ScrollArea, FileButton,
  Tabs, TabsList, TabsTrigger, TabsContent, cn,
  Popover, PopoverTrigger, PopoverContent,
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
  useT, useI18n,
} from "@metaforge/ui";
import { sanitizeHtml } from "@metaforge/core";

export type TimelineKind = "comment" | "edit" | "create" | "workflow" | "comm";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  by?: string;
  when?: string;
  text?: string;
}

export interface ContextAttachment {
  /** name = File doc name (dùng để xoá). */
  id: string;
  label: string;
  file_url?: string;
}

export interface UserOption {
  value: string;
  description?: string;
}

/** 1 dòng chia sẻ (docshare) — cờ quyền để hiển thị chỉ báo "sửa". */
export interface ContextShare {
  user: string;
  read?: 0 | 1;
  write?: 0 | 1;
  share?: 0 | 1;
}

/** 1 nhóm liên kết — số doc liên quan theo linked DocType (chỉ đọc). */
export interface ContextConnection {
  doctype: string;
  count: number;
}

export interface ContextPanelProps {
  timeline: TimelineItem[];
  assignments?: string[];
  attachments?: ContextAttachment[];
  tags?: string[];
  shares?: ContextShare[];
  connections?: ContextConnection[];
  loading?: boolean;
  onAddComment?: (text: string) => void | Promise<void>;
  searchUsers?: (txt: string) => Promise<UserOption[]>;
  onAssign?: (user: string) => void | Promise<void>;
  onRemoveAssign?: (user: string) => void | Promise<void>;
  onAttach?: (file: File) => void | Promise<void>;
  onRemoveAttach?: (id: string) => void | Promise<void>;
  onAddTag?: (tag: string) => void | Promise<void>;
  onRemoveTag?: (tag: string) => void | Promise<void>;
  /** chia sẻ doc: thêm/gỡ user (dùng lại searchUsers cho picker). */
  onAddShare?: (user: string) => void | Promise<void>;
  onRemoveShare?: (user: string) => void | Promise<void>;
  /** click 1 nhóm liên kết → app tự điều hướng (thiếu ⇒ hiện text tĩnh, KHÔNG nút giả). */
  onOpenConnection?: (doctype: string) => void;
  /** tab AI (app truyền AIPanel — views KHÔNG phụ thuộc shell). */
  aiSlot?: ReactNode;
}

const KIND_ICON: Record<TimelineKind, ReactNode> = {
  comment: <MessageSquarePlus className="size-3.5" />,
  edit: <GitCommitHorizontal className="size-3.5" />,
  create: <Plus className="size-3.5" />,
  workflow: <Workflow className="size-3.5" />,
  comm: <Send className="size-3.5" />,
};

export function ContextPanel(props: ContextPanelProps) {
  const t = useT();
  const hasAI = Boolean(props.aiSlot);
  return (
    <Tabs defaultValue="activity" className="mf-context-panel flex h-full flex-col">
      <div className="mf-context-tabs shrink-0 border-b px-3 py-2">
        <TabsList className={cn("grid w-full", hasAI ? "grid-cols-3" : "grid-cols-2")}>
          <TabsTrigger value="activity" className="gap-1"><History className="size-3.5" /> {t("context.tab_history")}</TabsTrigger>
          <TabsTrigger value="detail" className="gap-1"><PanelRight className="size-3.5" /> {t("context.tab_context")}</TabsTrigger>
          {hasAI ? <TabsTrigger value="ai" className="gap-1"><Sparkles className="size-3.5" /> AI</TabsTrigger> : null}
        </TabsList>
      </div>

      <TabsContent value="activity" className="mt-0 flex min-h-0 flex-1 flex-col">
        <CommentBox onSubmit={props.onAddComment} />
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          <Timeline items={props.timeline} loading={props.loading} />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="detail" className="mt-0 min-h-0 flex-1 overflow-auto p-3">
        <AssignBlock users={props.assignments ?? []} searchUsers={props.searchUsers} onAssign={props.onAssign} onRemove={props.onRemoveAssign} />
        <ShareBlock shares={props.shares ?? []} searchUsers={props.searchUsers} onAdd={props.onAddShare} onRemove={props.onRemoveShare} />
        <AttachBlock items={props.attachments ?? []} onAttach={props.onAttach} onRemove={props.onRemoveAttach} />
        <TagBlock tags={props.tags ?? []} onAdd={props.onAddTag} onRemove={props.onRemoveTag} />
        <ConnectionsBlock items={props.connections ?? []} onOpen={props.onOpenConnection} />
      </TabsContent>

      {hasAI ? (
        <TabsContent value="ai" className="mt-0 min-h-0 flex-1 overflow-hidden">{props.aiSlot}</TabsContent>
      ) : null}
    </Tabs>
  );
}

// ── Phụ trách (assign combobox) ───────────────────────────────────────────────
function AssignBlock({
  users, searchUsers, onAssign, onRemove,
}: { users: string[]; searchUsers?: ContextPanelProps["searchUsers"]; onAssign?: ContextPanelProps["onAssign"]; onRemove?: ContextPanelProps["onRemoveAssign"] }) {
  const t = useT();
  return (
    <Block icon={<User className="size-4" />} title={t("context.assign_title")}
      action={onAssign && searchUsers ? <UserPicker searchUsers={searchUsers} onPick={onAssign} exclude={users} /> : <DisabledAdd />}>
      {users.length ? (
        <div className="flex flex-wrap gap-1.5">
          {users.map((a) => (
            <Badge key={a} variant="secondary" className="gap-1 pr-1 font-normal">
              <Avatar className="size-4"><AvatarFallback className="text-[9px]">{a.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
              <span className="truncate">{a}</span>
              {onRemove ? <RemoveBtn label={`${t("context.remove_prefix")} ${a}`} onClick={() => onRemove(a)} /> : null}
            </Badge>
          ))}
        </div>
      ) : <Empty text={t("context.assign_empty")} />}
    </Block>
  );
}

function UserPicker({ searchUsers, onPick, exclude, label }: { searchUsers: NonNullable<ContextPanelProps["searchUsers"]>; onPick: (u: string) => void | Promise<void>; exclude: string[]; label?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const [opts, setOpts] = useState<UserOption[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void searchUsers(txt).then((r) => setOpts(r.filter((o) => !exclude.includes(o.value)))); }, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [txt, open, searchUsers, exclude]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label ?? t("context.assign_add")}><Plus /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("context.user_search_placeholder")} value={txt} onValueChange={setTxt} />
          <CommandList>
            <CommandEmpty>{t("context.no_results")}</CommandEmpty>
            {opts.map((o) => (
              <CommandItem key={o.value} value={o.value} onSelect={() => { void onPick(o.value); setOpen(false); setTxt(""); }}>
                <User className="mr-2 size-4 text-muted-foreground" />
                <span className="truncate">{o.description ?? o.value}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Chia sẻ (share combobox, tái dùng UserPicker) ─────────────────────────────
function ShareBlock({
  shares, searchUsers, onAdd, onRemove,
}: { shares: ContextShare[]; searchUsers?: ContextPanelProps["searchUsers"]; onAdd?: ContextPanelProps["onAddShare"]; onRemove?: ContextPanelProps["onRemoveShare"] }) {
  const t = useT();
  const users = shares.map((s) => s.user);
  return (
    <Block icon={<Share2 className="size-4" />} title={t("context.share_title")}
      action={onAdd && searchUsers ? <UserPicker searchUsers={searchUsers} onPick={onAdd} exclude={users} label={t("context.share_title")} /> : <DisabledAdd />}>
      {shares.length ? (
        <div className="flex flex-wrap gap-1.5">
          {shares.map((s) => (
            <Badge key={s.user} variant="secondary" className="gap-1 pr-1 font-normal">
              <Avatar className="size-4"><AvatarFallback className="text-[9px]">{s.user.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
              <span className="truncate">{s.user}</span>
              {s.write ? <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("context.share_write")}</span> : null}
              {onRemove ? <RemoveBtn label={`${t("context.share_remove_prefix")} ${s.user}`} onClick={() => onRemove(s.user)} /> : null}
            </Badge>
          ))}
        </div>
      ) : <Empty text={t("context.share_empty")} />}
    </Block>
  );
}

// ── Tệp đính kèm (FileButton) ─────────────────────────────────────────────────
function AttachBlock({
  items, onAttach, onRemove,
}: { items: ContextAttachment[]; onAttach?: ContextPanelProps["onAttach"]; onRemove?: ContextPanelProps["onRemoveAttach"] }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !onAttach) return;
    setBusy(true);
    try { await onAttach(f); } finally { setBusy(false); }
  };
  return (
    <Block icon={<Paperclip className="size-4" />} title={t("context.attach_title")}
      action={onAttach ? <FileButton onFiles={upload} disabled={busy} className="h-7 px-2 text-xs">{busy ? t("common.loading") : t("context.attach_choose")}</FileButton> : <DisabledAdd />}>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-1">
              <a href={f.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-primary hover:underline">{f.label}</a>
              {onRemove ? <RemoveBtn label={`${t("common.delete")} ${f.label}`} onClick={() => onRemove(f.id)} /> : null}
            </li>
          ))}
        </ul>
      ) : <Empty text={t("context.attach_empty")} />}
    </Block>
  );
}

// ── Nhãn (input inline) ───────────────────────────────────────────────────────
function TagBlock({
  tags, onAdd, onRemove,
}: { tags: string[]; onAdd?: ContextPanelProps["onAddTag"]; onRemove?: ContextPanelProps["onRemoveTag"] }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [txt, setTxt] = useState("");
  const commit = () => {
    const tag = txt.trim();
    if (tag && onAdd) void onAdd(tag);
    setTxt("");
    setAdding(false);
  };
  return (
    <Block icon={<Tag className="size-4" />} title={t("context.tag_title")}
      action={onAdd ? <Button variant="ghost" size="icon-sm" aria-label={t("context.tag_add")} onClick={() => setAdding((a) => !a)}><Plus /></Button> : <DisabledAdd />}>
      <div className="space-y-2">
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1 pr-1 font-normal">
                {tag}
                {onRemove ? <RemoveBtn label={`${t("context.tag_remove_prefix")} ${tag}`} onClick={() => onRemove(tag)} /> : null}
              </Badge>
            ))}
          </div>
        ) : !adding ? <Empty text={t("context.tag_empty")} /> : null}
        {adding ? (
          <Input
            autoFocus value={txt} placeholder={t("context.tag_placeholder")} className="h-8"
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setTxt(""); setAdding(false); } }}
            onBlur={commit}
          />
        ) : null}
      </div>
    </Block>
  );
}

// ── Liên kết (chỉ đọc — {doctype: count}) ─────────────────────────────────────
function ConnectionsBlock({
  items, onOpen,
}: { items: ContextConnection[]; onOpen?: ContextPanelProps["onOpenConnection"] }) {
  const t = useT();
  return (
    <Block icon={<Link2 className="size-4" />} title={t("context.links_title")} action={null}>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((c) => (
            <li key={c.doctype} className="flex items-center gap-2">
              {onOpen ? (
                <Button variant="link" size="sm" onClick={() => onOpen(c.doctype)}
                  className="h-auto min-w-0 flex-1 justify-start truncate p-0 text-sm font-normal">
                  {c.doctype}
                </Button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.doctype}</span>
              )}
              <Badge variant="secondary" className="font-normal">{c.count}</Badge>
            </li>
          ))}
        </ul>
      ) : <Empty text={t("context.links_empty")} />}
    </Block>
  );
}

// ── shared ────────────────────────────────────────────────────────────────────
function Block({ icon, title, action, children }: { icon: ReactNode; title: string; action: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground [&_svg]:size-4">
        {icon}
        <span>{title}</span>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </div>
  );
}

function DisabledAdd() {
  const t = useT();
  return <Button variant="ghost" size="icon-sm" disabled aria-label={t("context.add_disabled")}><Plus /></Button>;
}

function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} aria-label={label} className="size-4 rounded-sm p-0 hover:bg-background/60 [&_svg]:size-3">
      <X />
    </Button>
  );
}

function CommentBox({ onSubmit }: { onSubmit?: (text: string) => void | Promise<void> }) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!text.trim() || !onSubmit) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void submit(); } }}
        placeholder={onSubmit ? t("context.comment_placeholder") : t("context.comment_disabled")}
        rows={3}
        disabled={!onSubmit || busy}
        className="resize-none text-sm"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={!onSubmit || busy || !text.trim()}>
          <Send /> {busy ? t("context.comment_sending") : t("context.comment_submit")}
        </Button>
      </div>
    </div>
  );
}

function parseFrappeDate(value?: string): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(" ", "T").replace(/(\.\d{3})\d+$/, "$1");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTimelineWhen(value: string | undefined, tag: string): { label: string; full?: string } {
  const date = parseFrappeDate(value);
  if (!date) return { label: value ?? "" };
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  let label: string;
  if (abs < 60_000) label = rtf.format(-Math.round(diff / 1_000), "second");
  else if (abs < 3_600_000) label = rtf.format(-Math.round(diff / 60_000), "minute");
  else if (abs < 86_400_000) label = rtf.format(-Math.round(diff / 3_600_000), "hour");
  else if (abs < 604_800_000) label = rtf.format(-Math.round(diff / 86_400_000), "day");
  else label = new Intl.DateTimeFormat(tag, { dateStyle: "short", timeStyle: "short" }).format(date);
  return { label, full: new Intl.DateTimeFormat(tag, { dateStyle: "full", timeStyle: "medium" }).format(date) };
}

function plainTextFromHtml(html: string): string {
  if (typeof document !== "undefined") {
    const node = document.createElement("div");
    node.innerHTML = sanitizeHtml(html);
    return (node.textContent ?? "").trim();
  }
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function TimelineText({ item }: { item: TimelineItem }) {
  const sanitized = useMemo(() => item.text ? sanitizeHtml(item.text) : "", [item.text]);
  if (!item.text) return null;
  if (item.kind === "comment") {
    return <div className="mf-timeline-item-card mt-1 max-w-none break-words text-sm [&_a]:text-primary [&_a]:underline [&_p]:my-1" dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  return <div className="mt-0.5 text-sm text-muted-foreground">{plainTextFromHtml(item.text)}</div>;
}

function Timeline({ items, loading }: { items: TimelineItem[]; loading?: boolean }) {
  const { locale, t } = useI18n();
  const tag = locale === "en" ? "en-US" : "vi-VN";
  if (loading) return <div className="p-3 text-sm text-muted-foreground">{t("context.timeline_loading")}</div>;
  if (!items.length) return <Empty text={t("context.timeline_empty")} className="p-6" />;
  return (
    <ol className="relative space-y-4 p-3 pl-6">
      <span className="absolute bottom-2 left-[13px] top-2 w-px bg-border" aria-hidden="true" />
      {items.map((it) => {
        const when = formatTimelineWhen(it.when, tag);
        return (
          <li key={it.id} className="relative">
            <span className={cn(
              "absolute -left-[18px] grid size-5 place-items-center rounded-full border bg-background text-muted-foreground",
              (it.kind === "comment" || it.kind === "workflow") && "text-primary",
            )}>
              {KIND_ICON[it.kind]}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-foreground">{it.by ?? t("context.system_user")}</span>
              <time className="text-xs text-muted-foreground" dateTime={it.when} title={when.full}>{when.label}</time>
            </div>
            <TimelineText item={it} />
          </li>
        );
      })}
    </ol>
  );
}

function Empty({ text, className }: { text: string; className?: string }) {
  return <div className={cn("text-sm text-muted-foreground", className)}>{text}</div>;
}
