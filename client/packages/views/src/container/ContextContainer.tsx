/** @jsxImportSource react */
/**
 * ContextContainer — nối ContextPanel vào backend: docinfo (timeline/assignments/attachments/tags)
 * + mutation THẬT (P2): comment=addComment · assign=assign_to.add/remove · attach=uploadFile/deleteDoc(File)
 * · tag=add_tag/remove_tag · searchUsers=searchLink("User"). Mọi mutation → refetch ["doc",dt,name]
 * (chia sẻ cache với FormContainer, KHÔNG double-fetch).
 */
import { type ReactNode, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, useT } from "@metaforge/ui";
import type { Comment, DocInfo, Doc } from "@metaforge/core";
import {
  ContextPanel,
  type TimelineItem,
  type TimelineKind,
  type ContextAttachment,
  type ContextShare,
  type ContextConnection,
} from "../detail/ContextPanel.js";
import { useMetaForge } from "./provider.js";
import { useDoc } from "./hooks.js";

export interface ContextContainerProps {
  doctype: string;
  name: string;
  aiSlot?: ReactNode;
  /** app tự điều hướng khi click 1 nhóm liên kết (thiếu ⇒ list liên kết là text tĩnh). */
  onOpenConnection?: (doctype: string) => void;
}

function commentKind(c: Comment): TimelineKind {
  switch (c.comment_type) {
    case "Comment": return "comment";
    case "Workflow": return "workflow";
    case "Created": return "create";
    default: return "edit";
  }
}

function buildTimeline(docinfo: DocInfo | undefined, t: (k: string, f?: string) => string): TimelineItem[] {
  if (!docinfo) return [];
  const items: TimelineItem[] = [];
  for (const c of docinfo.comments ?? []) {
    items.push({ id: `c-${c.name}`, kind: commentKind(c), by: c.comment_by || c.comment_email, when: c.creation, text: c.content });
  }
  for (const v of (docinfo.versions ?? []) as Array<Record<string, unknown>>) {
    items.push({ id: `v-${String(v.name)}`, kind: "edit", by: String(v.owner ?? ""), when: String(v.creation ?? ""), text: t("context.timeline_edited") });
  }
  for (const m of (docinfo.communications ?? []) as Array<Record<string, unknown>>) {
    items.push({ id: `m-${String(m.name)}`, kind: "comm", by: String(m.sender ?? ""), when: String(m.creation ?? ""), text: String(m.subject ?? t("context.timeline_comm")) });
  }
  return items.sort((a, b) => String(b.when ?? "").localeCompare(String(a.when ?? "")));
}

function assignmentsFrom(docinfo?: DocInfo): string[] {
  return (docinfo?.assignments ?? []).map((a) => (typeof a === "string" ? a : String((a as Record<string, unknown>).owner ?? (a as Record<string, unknown>).assign_to ?? ""))).filter(Boolean);
}
function attachmentsFrom(docinfo: DocInfo | undefined, t: (k: string, f?: string) => string): ContextAttachment[] {
  return (docinfo?.attachments ?? []).map((f) => {
    const o = f as Record<string, unknown>;
    // id = File doc name (để deleteDoc("File", id)); label = file_name hiển thị.
    return { id: String(o.name ?? ""), label: String(o.file_name ?? o.name ?? t("context.attachment_fallback")), file_url: o.file_url as string | undefined };
  });
}
function tagsFrom(doc?: Doc): string[] {
  const raw = (doc?._user_tags as string | undefined) ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function ContextContainer(props: ContextContainerProps) {
  const t = useT();
  const { doctype, name } = props;
  const { adapter, scopeKey } = useMetaForge();
  const qc = useQueryClient();
  const docQ = useDoc(doctype, name);
  const docinfo = docQ.data?.docinfo;
  const doc = docQ.data?.doc;

  // shares + connections KHÔNG nằm trong docinfo getdoc → query riêng (cache tách theo doc).
  // P1-03: MỌI queryKey prefix scopeKey (site|user|lang) — KHÔNG rò cache giữa user/site (M1).
  const enabled = Boolean(doctype && name);
  const sharesQ = useQuery({
    queryKey: [scopeKey, "shares", doctype, name],
    queryFn: () => adapter.getShares(doctype, name),
    enabled,
  });
  const connectionsQ = useQuery({
    queryKey: [scopeKey, "connections", doctype, name],
    queryFn: () => adapter.getConnections(doctype, name),
    enabled,
  });

  const timeline = useMemo(() => buildTimeline(docinfo, t), [docinfo, t]);
  const shares: ContextShare[] = useMemo(
    () => (sharesQ.data ?? []).map((s) => ({ user: s.user, read: s.read, write: s.write, share: s.share })),
    [sharesQ.data],
  );
  const connections: ContextConnection[] = useMemo(
    () => (connectionsQ.data ?? []).map((c) => ({ doctype: c.doctype, count: c.count })),
    [connectionsQ.data],
  );

  // H2: invalidate PHẢI gồm scopeKey, nếu không sẽ KHÔNG khớp [scopeKey,"doc",…] của useDoc
  // ⇒ timeline/tags KHÔNG refetch sau comment/assign/attach/tag.
  const run = async (fn: () => Promise<unknown>, ok: string, keys: unknown[] = [scopeKey, "doc", doctype, name]) => {
    try { await fn(); await qc.invalidateQueries({ queryKey: keys }); toast.success(ok); }
    catch (e) { toast.error(adapter.mapError(e).message); }
  };
  const sharesKey = [scopeKey, "shares", doctype, name];

  return (
    <ContextPanel
      loading={docQ.isLoading}
      timeline={timeline}
      assignments={assignmentsFrom(docinfo)}
      attachments={attachmentsFrom(docinfo, t)}
      tags={tagsFrom(doc)}
      shares={shares}
      connections={connections}
      onAddComment={(text) => run(() => adapter.addComment(doctype, name, text), t("context.toast_commented"))}
      searchUsers={(txt) => adapter.searchLink("User", txt).then((r) => r.map((x) => ({ value: x.value, description: x.description ?? x.value })))}
      onAssign={(user) => run(() => adapter.assign({ assignTo: [user], doctype, name }), t("context.toast_assigned"))}
      onRemoveAssign={(user) => run(() => adapter.assignRemove(doctype, name, user), t("context.toast_unassigned"))}
      onAttach={(file) => run(() => adapter.uploadFile(file, { doctype, docname: name }), t("context.toast_attached"))}
      onRemoveAttach={(id) => run(() => adapter.deleteDoc("File", id), t("context.toast_attach_removed"))}
      onAddTag={(tag) => run(() => adapter.addTag(doctype, name, tag), t("context.toast_tag_added"))}
      onRemoveTag={(tag) => run(() => adapter.removeTag(doctype, name, tag), t("context.toast_tag_removed"))}
      onAddShare={(user) => run(() => adapter.addShare(doctype, name, user), t("context.toast_shared"), sharesKey)}
      onRemoveShare={(user) => run(() => adapter.removeShare(doctype, name, user), t("context.toast_unshared"), sharesKey)}
      onOpenConnection={props.onOpenConnection}
      aiSlot={props.aiSlot}
    />
  );
}
