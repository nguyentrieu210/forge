import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check, ChevronsUpDown, Database, Eye, KeyRound, Loader2, Plus, RefreshCw,
  Save, ShieldAlert, ShieldCheck, Trash2, UserRound, UsersRound,
} from "lucide-react";
import { useMetaForge } from "../container/provider.js";
import type { AccessProfileSummary, EffectivePermissionResult } from "@metaforge/core";
import type { RolesAndDoctypes, DocPermRule } from "@metaforge/adapter-frappe";
import {
  cn, Badge, Button, Checkbox, Input, Label, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, toast,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Popover, PopoverTrigger, PopoverContent, Command, CommandInput, CommandList, CommandEmpty, CommandItem,
  useT,
} from "@metaforge/ui";

const SCOPE_TYPES = ["Company", "Warehouse", "Branch", "Cost Center", "Project", "Territory"] as const;

/** Permission Center — writes only native Frappe Role/User Permission records.
 * Backend remains the final permission boundary and effective trace source. */
export function PermissionCenter() {
  const t = useT();
  const { adapter, businessContext } = useMetaForge();
  const [meta, setMeta] = useState<RolesAndDoctypes | null>(null);
  const [metaError, setMetaError] = useState<string>();
  const [doctype, setDoctype] = useState("");
  const [rules, setRules] = useState<DocPermRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string>();
  const [updating, setUpdating] = useState<string>();
  const [user, setUser] = useState("");
  const [profile, setProfile] = useState<AccessProfileSummary>();
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string>();
  const [documentName, setDocumentName] = useState("");
  const [effective, setEffective] = useState<EffectivePermissionResult>();
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [effectiveError, setEffectiveError] = useState<string>();

  useEffect(() => {
    let alive = true;
    adapter.perm.rolesAndDoctypes()
      .then((result) => { if (alive) { setMeta(result); setDoctype((current) => current || result.doctypes[0]?.value || ""); } })
      .catch((error) => { if (alive) setMetaError(adapter.mapError(error).message); });
    return () => { alive = false; };
  }, [adapter]);

  const loadRules = useCallback(async () => {
    if (!doctype) return;
    setRulesLoading(true); setRulesError(undefined);
    try { setRules(await adapter.perm.get(doctype)); }
    catch (error) { setRules([]); setRulesError(adapter.mapError(error).message); }
    finally { setRulesLoading(false); }
  }, [adapter, doctype]);
  useEffect(() => { void loadRules(); }, [loadRules]);

  const loadProfile = useCallback(async (requestedUser?: string) => {
    setProfileLoading(true); setProfileError(undefined);
    try {
      const result = await adapter.getAccessProfile(requestedUser?.trim() || undefined);
      setProfile(result); setUser(result.user); setEffective(undefined);
    } catch (error) { setProfile(undefined); setProfileError(adapter.mapError(error).message); }
    finally { setProfileLoading(false); }
  }, [adapter]);
  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const loadEffective = useCallback(async () => {
    if (!doctype) return;
    setEffectiveLoading(true); setEffectiveError(undefined);
    try {
      setEffective(await adapter.explainPermission(
        doctype,
        documentName.trim() || undefined,
        businessContext,
        user.trim() || profile?.user,
      ));
    } catch (error) { setEffective(undefined); setEffectiveError(adapter.mapError(error).message); }
    finally { setEffectiveLoading(false); }
  }, [adapter, doctype, documentName, businessContext, user, profile?.user]);

  const ptypes = meta?.doctype_ptype_map?.[doctype] ?? ["read", "write", "create", "delete", "submit", "cancel", "amend"];
  const doctypes = meta?.doctypes ?? [];

  async function togglePermission(rule: DocPermRule, ptype: string, checked: boolean) {
    const key = `${rule.role}:${rule.permlevel}:${ptype}:${rule.if_owner ?? 0}`;
    setUpdating(key);
    try {
      await adapter.perm.update(doctype, rule.role, rule.permlevel, ptype, checked ? 1 : 0, rule.if_owner);
      setRules((current) => current.map((candidate) => candidate === rule ? ({ ...candidate, [ptype]: checked ? 1 : 0 } as DocPermRule) : candidate));
      toast.success(`${t("perm.toast_updated_prefix")} ${ptype} ${t("perm.toast_updated_for")} ${rule.role}`);
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setUpdating(undefined); }
  }

  async function saveRoles(roles: string[], roleProfile?: string) {
    if (!profile?.user) return;
    try {
      await adapter.setUserRoles(profile.user, roles, roleProfile);
      toast.success(t("perm.toast_roles_saved"));
      await loadProfile(profile.user);
    } catch (error) { toast.error(adapter.mapError(error).message); }
  }

  async function addScope(allow: string, forValue: string, applicableFor?: string) {
    if (!profile?.user) return;
    try {
      await adapter.addUserPermission({ user: profile.user, allow, forValue, applicableFor });
      toast.success(t("perm.toast_scope_added"));
      await loadProfile(profile.user);
    } catch (error) { toast.error(adapter.mapError(error).message); }
  }

  async function removeScope(id: string) {
    try {
      await adapter.removeUserPermission(id);
      toast.success(t("perm.toast_scope_removed"));
      if (profile?.user) await loadProfile(profile.user);
    } catch (error) { toast.error(adapter.mapError(error).message); }
  }

  if (metaError) return <ErrorBox message={metaError} />;

  return (
    <div className="mx-auto max-w-[1700px] space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="size-6 text-primary" /> {t("perm.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("perm.subtitle")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t("perm.doctype_under_test")}</Label>
          {meta ? <Select value={doctype} onValueChange={setDoctype}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger><SelectContent>{doctypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select> : <Skeleton className="h-9 w-64" />}
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="users"><UserRound className="size-4" /> {t("perm.tab_users")}</TabsTrigger>
          <TabsTrigger value="roles"><UsersRound className="size-4" /> {t("perm.tab_roles")}</TabsTrigger>
          <TabsTrigger value="scope"><Database className="size-4" /> {t("perm.tab_scope")}</TabsTrigger>
          <TabsTrigger value="apps"><Eye className="size-4" /> {t("perm.tab_apps")}</TabsTrigger>
          <TabsTrigger value="effective"><KeyRound className="size-4" /> {t("perm.tab_effective")}</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <ProfilePanel
            user={user} setUser={setUser} profile={profile} loading={profileLoading} error={profileError}
            availableRoles={meta?.roles ?? []} adapter={adapter} onLoad={() => loadProfile(user)} onSaveRoles={saveRoles}
          />
        </TabsContent>
        <TabsContent value="roles"><RoleMatrix doctype={doctype} ptypes={ptypes} rows={rules} loading={rulesLoading} error={rulesError} updating={updating} onRefresh={loadRules} onToggle={togglePermission} /></TabsContent>
        <TabsContent value="scope">
          <ScopePanel profile={profile} loading={profileLoading} adapter={adapter} onLoad={() => loadProfile(user)} onAdd={addScope} onRemove={removeScope} />
        </TabsContent>
        <TabsContent value="apps"><AppsPanel profile={profile} /></TabsContent>
        <TabsContent value="effective"><EffectivePanel selectedUser={profile?.user ?? user} doctype={doctype} documentName={documentName} setDocumentName={setDocumentName} data={effective} loading={effectiveLoading} error={effectiveError} onLoad={loadEffective} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ProfilePanel(props: {
  user: string; setUser: (value: string) => void; profile?: AccessProfileSummary; loading: boolean; error?: string;
  availableRoles: Array<{ value: string; label: string }>; adapter: ReturnType<typeof useMetaForge>["adapter"]; onLoad: () => void; onSaveRoles: (roles: string[], roleProfile?: string) => Promise<void>;
}) {
  const t = useT();
  const [roles, setRoles] = useState<string[]>([]);
  const [roleProfile, setRoleProfile] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setRoles((props.profile?.assignedRoles ?? props.profile?.roles ?? []).filter((role) => !["All", "Guest"].includes(role)));
    setRoleProfile(props.profile?.roleProfile ?? "");
  }, [props.profile]);
  const roleSet = useMemo(() => new Set(roles), [roles]);
  async function save() { setSaving(true); try { await props.onSaveRoles(roles, roleProfile || undefined); } finally { setSaving(false); } }
  return <section className="rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1"><Label htmlFor="permission-user">{t("perm.user_field")}</Label><Input id="permission-user" className="mt-1.5" value={props.user} onChange={(event: React.ChangeEvent<HTMLInputElement>) => props.setUser(event.target.value)} placeholder="user@example.com" /></div>
      <Button onClick={props.onLoad} disabled={props.loading}>{props.loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("perm.load_profile")}</Button>
    </div>
    {props.error ? <ErrorBox message={props.error} inline /> : null}
    {props.loading ? <div className="mt-5 grid gap-3 md:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div> : props.profile ? <>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <InfoCard title={t("perm.card_identity")}><div className="font-semibold">{props.profile.fullName ?? props.profile.user}</div><div className="text-sm text-muted-foreground">{props.profile.user}</div></InfoCard>
        <InfoCard title={t("perm.card_roles")}><div className="flex flex-wrap gap-1.5">{props.profile.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</div></InfoCard>
        <InfoCard title={t("perm.card_scope_summary")}><div className="text-2xl font-semibold">{props.profile.scopes.reduce((sum, item) => sum + item.values.length, 0)}</div><div className="text-sm text-muted-foreground">{t("perm.scope_values_prefix")} {props.profile.scopes.length} {t("perm.scope_values_suffix")}</div></InfoCard>
      </div>
      <div className="mt-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3"><div><h3 className="font-semibold">{t("perm.access_profile_title")}</h3><p className="text-xs text-muted-foreground">{t("perm.access_profile_hint")}</p></div>{props.profile.canManage ? <Button className="ml-auto" size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t("perm.save_perms")}</Button> : null}</div>
        <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_auto]">
          <div><Label>Role Profile</Label><ScopeValuePicker adapter={props.adapter} doctype="Role Profile" value={roleProfile} onChange={setRoleProfile} /></div>
          <Button type="button" variant="outline" disabled={!roleProfile || !props.profile.canManage} onClick={() => setRoleProfile("")}>{t("perm.use_roles_directly")}</Button>
        </div>
        {roleProfile ? <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">{t("perm.role_profile_locked_prefix")} <strong>{roleProfile}</strong>{t("perm.role_profile_locked_suffix")}</div> : null}
        <div className="mt-3 grid max-h-72 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {props.availableRoles.filter((role) => !["All", "Guest"].includes(role.value)).map((role) => <label key={role.value} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent"><Checkbox checked={roleSet.has(role.value)} disabled={!props.profile?.canManage || Boolean(roleProfile)} onCheckedChange={(checked: boolean | "indeterminate") => setRoles((current) => checked ? [...new Set([...current, role.value])] : current.filter((item) => item !== role.value))} /><span className="truncate">{role.label}</span></label>)}
        </div>
      </div>
    </> : null}
  </section>;
}

function RoleMatrix(props: { doctype: string; ptypes: string[]; rows: DocPermRule[]; loading: boolean; error?: string; updating?: string; onRefresh: () => void; onToggle: (rule: DocPermRule, ptype: string, checked: boolean) => void }) {
  const t = useT();
  return <section className="rounded-xl border bg-card shadow-sm"><div className="flex items-center gap-2 border-b px-4 py-3"><div><h2 className="font-semibold">{t("perm.matrix_title_prefix")} {props.doctype}</h2><p className="text-xs text-muted-foreground">{t("perm.matrix_hint")}</p></div><Button className="ml-auto" variant="outline" size="sm" onClick={props.onRefresh}><RefreshCw className="size-4" /> {t("common.refresh")}</Button></div>{props.loading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9" />)}</div> : props.error ? <ErrorBox message={props.error} inline /> : <div className="overflow-auto"><Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="sticky left-0 z-10 min-w-52 bg-card">{t("perm.col_role")}</TableHead><TableHead className="w-20 text-center">{t("perm.col_level")}</TableHead><TableHead className="w-24 text-center">{t("perm.col_if_owner")}</TableHead>{props.ptypes.map((ptype) => <TableHead key={ptype} className="min-w-20 text-center capitalize">{ptype}</TableHead>)}</TableRow></TableHeader><TableBody>{props.rows.length ? props.rows.map((rule, index) => <TableRow key={`${rule.role}:${rule.permlevel}:${rule.if_owner ?? 0}:${index}`}><TableCell className="sticky left-0 z-[1] bg-card font-medium">{rule.role}</TableCell><TableCell className="text-center tabular-nums">{rule.permlevel}</TableCell><TableCell className="text-center">{rule.if_owner ? <Badge variant="outline">{t("common.yes")}</Badge> : "—"}</TableCell>{props.ptypes.map((ptype) => { const key = `${rule.role}:${rule.permlevel}:${ptype}:${rule.if_owner ?? 0}`; const checked = (rule as Record<string, unknown>)[ptype] === 1; return <TableCell key={ptype} className="text-center"><div className="inline-flex size-8 items-center justify-center">{props.updating === key ? <Loader2 className="size-4 animate-spin text-primary" /> : <Checkbox checked={checked} onCheckedChange={(value: boolean | "indeterminate") => props.onToggle(rule, ptype, value === true)} aria-label={`${ptype} ${rule.role}`} />}</div></TableCell>; })}</TableRow>) : <TableRow><TableCell colSpan={props.ptypes.length + 3} className="h-24 text-center text-muted-foreground">{t("perm.matrix_empty")}</TableCell></TableRow>}</TableBody></Table></div>}</section>;
}

function ScopePanel(props: {
  profile?: AccessProfileSummary; loading: boolean; adapter: ReturnType<typeof useMetaForge>["adapter"];
  onLoad: () => void; onAdd: (allow: string, forValue: string, applicableFor?: string) => Promise<void>; onRemove: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [allow, setAllow] = useState<string>("Company");
  const [value, setValue] = useState("");
  const [applicableFor, setApplicableFor] = useState("");
  const [saving, setSaving] = useState(false);
  async function add() { if (!value) return; setSaving(true); try { await props.onAdd(allow, value, applicableFor || undefined); setValue(""); } finally { setSaving(false); } }
  return <section className="rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex items-center"><div><h2 className="font-semibold">{t("perm.scope_title")}</h2><p className="text-sm text-muted-foreground">{t("perm.scope_hint")}</p></div><Button className="ml-auto" variant="outline" size="sm" onClick={props.onLoad} disabled={props.loading}><RefreshCw className="size-4" /> {t("common.refresh")}</Button></div>
    {props.profile?.canManage ? <div className="mt-4 grid items-end gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-[12rem_1fr_14rem_auto]">
      <div><Label>{t("perm.scope_type")}</Label><Select value={allow} onValueChange={(next: string) => { setAllow(next); setValue(""); }}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{SCOPE_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>{t("perm.scope_value")}</Label><ScopeValuePicker adapter={props.adapter} doctype={allow} value={value} onChange={setValue} /></div>
      <div><Label>{t("perm.scope_applicable_for")}</Label><Input className="mt-1.5" value={applicableFor} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setApplicableFor(event.target.value)} placeholder={t("perm.scope_applicable_placeholder")} /></div>
      <Button onClick={add} disabled={!value || saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t("common.add")}</Button>
    </div> : null}
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{props.profile?.scopes.length ? props.profile.scopes.map((scope) => <InfoCard key={scope.doctype} title={scope.doctype}><div className="space-y-2">{scope.values.map((item) => <div key={item.id ?? item.value} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{item.label}</div>{item.applicableFor ? <div className="truncate text-xs text-muted-foreground">{t("perm.scope_only_prefix")} {item.applicableFor}</div> : null}</div>{item.isDefault ? <Badge variant="outline">{t("perm.scope_default")}</Badge> : null}{props.profile?.canManage && item.id ? <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => props.onRemove(item.id!)} aria-label={`${t("common.remove_prefix")} ${item.label}`}><Trash2 /></Button> : null}</div>)}</div></InfoCard>) : <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("perm.scope_empty")}</div>}</div>
  </section>;
}

function ScopeValuePicker({ adapter, doctype, value, onChange }: { adapter: ReturnType<typeof useMetaForge>["adapter"]; doctype: string; value: string; onChange: (value: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false); const [text, setText] = useState(""); const [items, setItems] = useState<Array<{ value: string; description?: string }>>([]); const [loading, setLoading] = useState(false); const seq = useRef(0);
  useEffect(() => { if (!open) return; const current = ++seq.current; const timer = setTimeout(() => { setLoading(true); void adapter.searchLink(doctype, text, { pageLength: 20 }).then((result) => { if (seq.current === current) setItems(result); }).catch(() => { if (seq.current === current) setItems([]); }).finally(() => { if (seq.current === current) setLoading(false); }); }, 200); return () => clearTimeout(timer); }, [adapter, doctype, open, text]);
  const picked = items.find((item) => item.value === value);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" className="mt-1.5 w-full justify-between font-normal"><span className="truncate">{picked?.description || value || `${t("common.choose_prefix")} ${doctype}`}</span><ChevronsUpDown className="size-4 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0"><Command shouldFilter={false}><CommandInput value={text} onValueChange={setText} placeholder={`${t("common.search_prefix")} ${doctype}…`} /><CommandList>{loading ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("common.searching")}</div> : <><CommandEmpty>{t("common.no_results")}</CommandEmpty>{items.map((item) => <CommandItem key={item.value} value={item.value} onSelect={() => { onChange(item.value); setOpen(false); }}><Check className={cn("mr-2 size-4", item.value === value ? "opacity-100" : "opacity-0")} /><span className="min-w-0"><span className="block truncate">{item.description || item.value}</span>{item.description && item.description !== item.value ? <span className="block truncate text-xs text-muted-foreground">{item.value}</span> : null}</span></CommandItem>)}</>}</CommandList></Command></PopoverContent></Popover>;
}

function AppsPanel({ profile }: { profile?: AccessProfileSummary }) {
  const t = useT();
  return <section className="rounded-xl border bg-card p-5 shadow-sm"><h2 className="font-semibold">{t("perm.apps_title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("perm.apps_hint")}</p><div className="mt-4 grid gap-4 md:grid-cols-2"><InfoCard title={t("perm.apps_card")}><div className="flex flex-wrap gap-1.5">{profile?.applications?.length ? profile.applications.map((app) => <Badge key={app}>{app}</Badge>) : <span className="text-sm text-muted-foreground">{t("perm.apps_empty")}</span>}</div></InfoCard><InfoCard title={t("perm.workspaces_card")}><div className="flex flex-wrap gap-1.5">{profile?.workspaces?.length ? profile.workspaces.map((workspace) => <Badge key={workspace} variant="secondary">{workspace}</Badge>) : <span className="text-sm text-muted-foreground">{t("perm.workspaces_empty")}</span>}</div></InfoCard></div></section>;
}

function EffectivePanel(props: { selectedUser: string; doctype: string; documentName: string; setDocumentName: (value: string) => void; data?: EffectivePermissionResult; loading: boolean; error?: string; onLoad: () => void }) {
  const t = useT();
  return <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm"><span className="text-muted-foreground">{t("perm.analysing_for")}</span> <span className="font-semibold">{props.selectedUser || t("perm.current_user")}</span></div><div className="flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1"><Label htmlFor="permission-document">{t("perm.document_field")}</Label><Input id="permission-document" className="mt-1.5" value={props.documentName} onChange={(event: React.ChangeEvent<HTMLInputElement>) => props.setDocumentName(event.target.value)} placeholder="MAT-STE-2026-00001" /></div><Button onClick={props.onLoad} disabled={props.loading || !props.doctype}>{props.loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {t("perm.analyse")}</Button></div>{props.error ? <ErrorBox message={props.error} inline /> : null}{props.data ? <div className="mt-5 space-y-5"><div><h3 className="mb-2 text-sm font-semibold">Capabilities · {props.data.user ?? props.selectedUser}</h3><div className="flex flex-wrap gap-2">{Object.entries(props.data.capabilities).map(([key, allowed]) => <Badge key={key} variant={allowed ? "default" : "destructive"}>{allowed ? <Check className="mr-1 size-3" /> : <ShieldAlert className="mr-1 size-3" />}{key}</Badge>)}</div></div><div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><div><h3 className="mb-2 text-sm font-semibold">{t("perm.trace_title")}</h3><div className="space-y-2">{props.data.trace.map((item, index) => <div key={`${item.source}:${item.label}:${index}`} className={cn("rounded-lg border p-3", item.effect === "deny" && "border-destructive/30 bg-destructive/5", item.effect === "allow" && "border-emerald-500/30 bg-emerald-500/5")}><div className="flex items-center gap-2"><Badge variant="outline">{item.source}</Badge><span className="text-sm font-medium">{item.label}</span></div>{item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}</div>)}</div></div><div><h3 className="mb-2 text-sm font-semibold">{t("perm.field_perm_title")}</h3><div className="max-h-[28rem] overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead className="text-center">Read</TableHead><TableHead className="text-center">Write</TableHead><TableHead>{t("perm.col_reason")}</TableHead></TableRow></TableHeader><TableBody>{(props.data.fieldRules ?? []).map((field) => <TableRow key={field.fieldname}><TableCell className="font-mono text-xs">{field.fieldname}</TableCell><TableCell className="text-center">{field.read ? <Check className="mx-auto size-4 text-emerald-600" /> : "—"}</TableCell><TableCell className="text-center">{field.write ? <Check className="mx-auto size-4 text-emerald-600" /> : "—"}</TableCell><TableCell className="text-xs text-muted-foreground">{field.reason}</TableCell></TableRow>)}</TableBody></Table></div></div></div></div> : null}</section>;
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-xl border bg-muted/20 p-4"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>{children}</div>; }
function ErrorBox({ message, inline }: { message: string; inline?: boolean }) { return <div className={cn("mt-4 flex items-center gap-2 text-sm text-destructive", inline ? "rounded-lg border border-destructive/30 bg-destructive/5 p-3" : "rounded-xl border border-destructive/40 bg-destructive/10 p-4")} role="alert"><ShieldAlert className="size-4 shrink-0" /><span>{message}</span></div>; }
