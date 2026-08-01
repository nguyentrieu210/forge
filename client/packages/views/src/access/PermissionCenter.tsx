/** @jsxImportSource react */
/**
 * Quản lý người dùng & phân quyền — dựng theo lối MISA: DANH SÁCH trước, thao tác sau.
 *
 * Bản trước bắt nhập tên đăng nhập vào một ô trống rồi mới tra được một người. Điều đó trả
 * lời được "người này làm được gì", nhưng không trả lời được câu ĐẦU TIÊN mà bất kỳ ai mở
 * màn phân quyền cũng hỏi: **ai đang đăng nhập được vào hệ thống này**. Hệ quả không phải
 * là bất tiện — một tài khoản còn mở cho người đã nghỉ việc thì không có màn nào cho thấy.
 *
 * Ba chỗ cố ý khác bản cũ:
 *
 *  1. Danh sách người dùng mở ra đầu tiên, kèm trạng thái và vai trò ngay trên từng dòng.
 *  2. Có nút TẠO TÀI KHOẢN. Trước đây nền tảng không có API nào tạo người dùng, nên cách
 *     duy nhất để thêm một người là gọi API bằng tay.
 *  3. Ma trận quyền theo vai trò để CHỈ ĐỌC. Nền tảng từ chối sửa DocPerm ở đây (quyền do
 *     gói app khai), nên một ô tích sửa được là ô bấm vào chỉ để nhận thông báo lỗi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, ChevronsUpDown, ClipboardCheck, Download, ExternalLink, FileClock,
  KeyRound, Loader2, Lock, LockOpen, Plus, RefreshCw, Save, Search, ShieldAlert,
  ShieldCheck, Trash2, UserPlus, UserRound, UsersRound,
} from "lucide-react";
import { useMetaForge } from "../container/provider.js";
import { formatDate, type AccessProfileSummary, type ApprovalInboxItem, type AuditEventItem, type Doc, type DocTypeMeta, type EffectivePermissionResult, type TenantUser } from "@metaforge/core";
import type { RolesAndDoctypes, DocPermRule } from "@metaforge/adapter-frappe";
import {
  cn, Badge, Button, Checkbox, Input, Label, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, toast,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Popover, PopoverTrigger, PopoverContent, Command, CommandInput, CommandList, CommandEmpty, CommandItem,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@metaforge/ui";

/** Phạm vi dữ liệu gán được cho một người — trùng danh sách chiều dữ liệu server hiểu. */
const SCOPE_TYPES = [
  { value: "Warehouse", label: "Kho" },
  { value: "Company", label: "Công ty" },
  { value: "Branch", label: "Chi nhánh" },
  { value: "Department", label: "Phòng ban" },
  { value: "Cost Center", label: "Trung tâm chi phí" },
  { value: "Project", label: "Dự án" },
  { value: "Territory", label: "Khu vực" },
] as const;

const MIN_PASSWORD_LENGTH = 8;

export type PermissionCenterTab = "users" | "roles" | "check" | "approvals" | "audit";

const TAB_HEADING: Record<PermissionCenterTab, { title: string; description: string }> = {
  users: { title: "Quản lý người dùng & phân quyền", description: "Tạo tài khoản đăng nhập, gán vai trò, giới hạn phạm vi dữ liệu và kiểm tra quyền thực tế." },
  roles: { title: "Vai trò, phạm vi & tách nhiệm vụ", description: "Đối chiếu quyền theo tài nguyên, chính sách hiệu lực và các xung đột cần tách người." },
  check: { title: "Mô phỏng quyền thực tế", description: "Kiểm tra một người được phép hay bị từ chối trên đúng chứng từ và phạm vi nào." },
  approvals: { title: "Hộp duyệt của tôi", description: "Xử lý phiếu đúng vai trò, phạm vi, chính sách SoD và ủy quyền đang hiệu lực." },
  audit: { title: "Nhật ký kiểm toán", description: "Theo dõi thay đổi bất biến, phiên bản trước–sau và xuất bằng chứng có checksum." },
};

/** Nhãn tiếng Việt cho từng quyền. Khoá lạ thì hiện nguyên khoá, không giấu đi. */
const PTYPE_LABEL: Record<string, string> = {
  read: "Xem", write: "Sửa", create: "Thêm", delete: "Xoá", submit: "Ghi sổ",
  cancel: "Huỷ", amend: "Sửa lại", print: "In", email: "Gửi mail",
  report: "Báo cáo", export: "Xuất file", share: "Chia sẻ", import: "Nhập file",
};

export function PermissionCenter({ initialTab = "users" }: { initialTab?: PermissionCenterTab } = {}) {
  const { adapter } = useMetaForge();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [meta, setMeta] = useState<RolesAndDoctypes | null>(null);
  const [doctype, setDoctype] = useState("");
  const [activeTab, setActiveTab] = useState<PermissionCenterTab>(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const heading = TAB_HEADING[activeTab];

  const loadUsers = useCallback(async () => {
    setListLoading(true); setListError(undefined);
    try {
      const result = await adapter.listUsers();
      setUsers(result.users);
      setAvailableRoles(result.available_roles);
    } catch (error) {
      setUsers([]);
      setListError(adapter.mapError(error).message);
    } finally { setListLoading(false); }
  }, [adapter]);
  useEffect(() => { void loadUsers(); }, [loadUsers]);

  useEffect(() => {
    let alive = true;
    // Ma trận là phần phụ — hỏng nó thì danh sách người dùng vẫn phải dùng được.
    adapter.perm.rolesAndDoctypes()
      .then((result) => { if (alive) { setMeta(result); setDoctype((current) => current || result.doctypes[0]?.value || ""); } })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [adapter]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => user.user.toLowerCase().includes(needle)
      || (user.full_name ?? "").toLowerCase().includes(needle)
      || user.roles.some((role) => role.toLowerCase().includes(needle)));
  }, [users, search]);

  async function toggleEnabled(user: TenantUser) {
    try {
      await adapter.setUserEnabled(user.user, !user.enabled);
      toast.success(user.enabled ? `Đã khoá ${user.user}` : `Đã mở lại ${user.user}`);
      await loadUsers();
    } catch (error) { toast.error(adapter.mapError(error).message); }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="size-6 text-primary" /> {heading.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{heading.description}</p>
        </div>
        {activeTab === "users" ? <Button className="ml-auto" onClick={() => setCreating(true)}><UserPlus className="size-4" /> Thêm người dùng</Button> : null}
      </div>

      <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as PermissionCenterTab)} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="users"><UsersRound className="size-4" /> Người dùng</TabsTrigger>
          <TabsTrigger value="roles"><ShieldCheck className="size-4" /> Quyền theo vai trò</TabsTrigger>
          <TabsTrigger value="check"><KeyRound className="size-4" /> Kiểm tra quyền</TabsTrigger>
          <TabsTrigger value="approvals"><ClipboardCheck className="size-4" /> Hộp duyệt</TabsTrigger>
          <TabsTrigger value="audit"><FileClock className="size-4" /> Nhật ký kiểm toán</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <div className="relative min-w-56 max-w-sm flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={search} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Tìm theo tên, tài khoản hoặc vai trò…" />
              </div>
              <span className="text-sm text-muted-foreground">{filtered.length}/{users.length} tài khoản</span>
              <Button className="ml-auto" variant="outline" size="sm" onClick={loadUsers} disabled={listLoading}>
                {listLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Tải lại
              </Button>
            </div>

            {listError ? <ErrorBox message={listError} /> : null}
            {listLoading ? <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-11" />)}</div> : (<>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-52">Họ và tên</TableHead>
                      <TableHead className="min-w-44">Tên đăng nhập</TableHead>
                      <TableHead className="min-w-60">Vai trò</TableHead>
                      <TableHead className="w-32 text-center">Trạng thái</TableHead>
                      <TableHead className="w-44 text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length ? filtered.map((user) => (
                      <TableRow key={user.user} className={cn("cursor-pointer", selected === user.user && "bg-accent/50", !user.enabled && "opacity-60")} onClick={() => setSelected(user.user)}>
                        <TableCell className="font-medium">{user.full_name || user.user}</TableCell>
                        <TableCell className="font-mono text-xs">{user.user}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length
                              ? user.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)
                              /* Không vai trò = đăng nhập được nhưng không mở được gì. Nói
                                 thẳng, vì với người dùng nó trông như hệ thống hỏng. */
                              : <span className="text-xs text-amber-600">chưa gán vai trò</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {user.enabled ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Đang dùng</Badge> : <Badge variant="destructive">Đã khoá</Badge>}
                        </TableCell>
                        <TableCell className="text-right" onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => setSelected(user.user)}>Phân quyền</Button>
                          <Button variant="ghost" size="icon-sm" title={user.enabled ? "Khoá tài khoản" : "Mở lại tài khoản"} onClick={() => toggleEnabled(user)}>
                            {user.enabled ? <Lock className="size-4" /> : <LockOpen className="size-4 text-emerald-600" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) : <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Không có tài khoản nào khớp.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 p-3 md:hidden">
                {filtered.length ? filtered.map((user) => (
                  <article key={user.user} className={cn("rounded-lg border p-3", selected === user.user && "border-primary bg-primary/5", !user.enabled && "opacity-70")}>
                    <Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal p-0 text-left font-normal hover:bg-transparent" onClick={() => setSelected(user.user)}>
                      <span className="block w-full">
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{user.full_name || user.user}</span><span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{user.user}</span></span>
                        <Badge variant={user.enabled ? "default" : "destructive"}>{user.enabled ? "Đang dùng" : "Đã khoá"}</Badge>
                      </span>
                      <span className="mt-3 flex flex-wrap gap-1">
                        {user.roles.length ? user.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>) : <span className="text-xs text-muted-foreground">Chưa gán vai trò</span>}
                      </span>
                      </span>
                    </Button>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 border-t pt-3">
                      <Button variant="outline" size="sm" onClick={() => setSelected(user.user)}>Phân quyền</Button>
                      <Button variant="outline" size="icon-sm" aria-label={user.enabled ? "Khoá tài khoản" : "Mở lại tài khoản"} onClick={() => void toggleEnabled(user)}>{user.enabled ? <Lock className="size-4" /> : <LockOpen className="size-4" />}</Button>
                    </div>
                  </article>
                )) : <p className="py-8 text-center text-sm text-muted-foreground">Không có tài khoản nào khớp.</p>}
              </div>
            </>)}
          </section>

          {selected ? <UserDetail key={selected} login={selected} availableRoles={availableRoles} onChanged={loadUsers} onClose={() => setSelected(undefined)} /> : null}
        </TabsContent>

        <TabsContent value="roles"><RoleMatrix meta={meta} doctype={doctype} setDoctype={setDoctype} /></TabsContent>
        <TabsContent value="check"><CheckPanel meta={meta} doctype={doctype} setDoctype={setDoctype} users={users} /></TabsContent>
        <TabsContent value="approvals"><ApprovalQueue /></TabsContent>
        <TabsContent value="audit"><AuditCenter /></TabsContent>
      </Tabs>

      <CreateUserDialog open={creating} onOpenChange={setCreating} availableRoles={availableRoles} onCreated={async (login) => { await loadUsers(); setSelected(login); }} />
    </div>
  );
}

/** Tạo tài khoản: một hộp thoại, một lời gọi — có mật khẩu và vai trò ngay. */
function CreateUserDialog({ open, onOpenChange, availableRoles, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; availableRoles: string[]; onCreated: (login: string) => Promise<void>;
}) {
  const { adapter } = useMetaForge();
  const [login, setLogin] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { if (open) { setLogin(""); setFullName(""); setPassword(""); setRoles([]); setError(undefined); } }, [open]);

  const ready = login.trim().length > 0 && password.length >= MIN_PASSWORD_LENGTH;
  async function submit() {
    setSaving(true); setError(undefined);
    try {
      const created = login.trim().toLowerCase();
      await adapter.createUser({ user: login.trim(), password, fullName: fullName.trim() || undefined, roles });
      toast.success(`Đã tạo tài khoản ${created}`);
      onOpenChange(false);
      await onCreated(created);
    } catch (caught) { setError(adapter.mapError(caught).message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="size-5" /> Thêm người dùng</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-user-login">Tên đăng nhập <span className="text-destructive">*</span></Label>
              <Input id="new-user-login" className="mt-1.5" value={login} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLogin(event.target.value)} placeholder="hong.kd hoặc hong@alumdoor.vn" autoComplete="off" />
              <p className="mt-1 text-xs text-muted-foreground">Không đổi được sau khi tạo — mọi chứng từ người này lập sẽ mang tên này.</p>
            </div>
            <div>
              <Label htmlFor="new-user-name">Họ và tên</Label>
              <Input id="new-user-name" className="mt-1.5" value={fullName} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setFullName(event.target.value)} placeholder="Nguyễn Thị Hồng" />
            </div>
          </div>
          <div>
            <Label htmlFor="new-user-password">Mật khẩu <span className="text-destructive">*</span></Label>
            {/* Hiện rõ chứ không che: người tạo phải đọc lại được để đưa cho nhân viên. */}
            <Input id="new-user-password" className="mt-1.5" value={password} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)} placeholder={`ít nhất ${MIN_PASSWORD_LENGTH} ký tự`} autoComplete="new-password" />
            <p className="mt-1 text-xs text-muted-foreground">Hiện rõ để bạn chép lại đưa cho nhân viên. Nhắc họ đổi sau lần đăng nhập đầu.</p>
          </div>
          <div>
            <Label>Vai trò</Label>
            <div className="mt-1.5 grid max-h-56 gap-2 overflow-auto rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3">
              {availableRoles.map((role) => (
                <label key={role} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent">
                  <Checkbox checked={roles.includes(role)} onCheckedChange={(checked: boolean | "indeterminate") => setRoles((current) => checked ? [...new Set([...current, role])] : current.filter((item) => item !== role))} />
                  <span className="truncate">{role}</span>
                </label>
              ))}
            </div>
            {!roles.length ? <p className="mt-1.5 text-xs text-amber-600">Chưa chọn vai trò — người này sẽ đăng nhập được nhưng không thấy màn hình nào.</p> : null}
          </div>
          {error ? <ErrorBox message={error} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button onClick={submit} disabled={saving || !ready}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Tạo tài khoản</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Chi tiết một người: vai trò, phạm vi dữ liệu, cấp lại mật khẩu. */
function UserDetail({ login, availableRoles, onChanged, onClose }: {
  login: string; availableRoles: string[]; onChanged: () => Promise<void>; onClose: () => void;
}) {
  const { adapter } = useMetaForge();
  const [profile, setProfile] = useState<AccessProfileSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [roles, setRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const result = await adapter.getAccessProfile(login);
      setProfile(result);
      setRoles((result.assignedRoles ?? result.roles ?? []).filter((role) => !["All", "Guest"].includes(role)));
    } catch (caught) { setProfile(undefined); setError(adapter.mapError(caught).message); }
    finally { setLoading(false); }
  }, [adapter, login]);
  useEffect(() => { void load(); }, [load]);

  async function saveRoles() {
    setSavingRoles(true);
    try {
      await adapter.setUserRoles(login, roles);
      toast.success("Đã lưu vai trò");
      await load(); await onChanged();
    } catch (caught) { toast.error(adapter.mapError(caught).message); }
    finally { setSavingRoles(false); }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <UserRound className="size-5 text-primary" />
        <div><h2 className="font-semibold">{profile?.fullName || login}</h2><p className="font-mono text-xs text-muted-foreground">{login}</p></div>
        <Button className="ml-auto" variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      {loading ? <div className="grid gap-3 p-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : (
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Vai trò</h3>
              {profile?.canManage ? <Button className="ml-auto" size="sm" onClick={saveRoles} disabled={savingRoles}>{savingRoles ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu</Button> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Vai trò quyết định người này mở được màn hình nào và làm được gì trên đó.</p>
            <div className="mt-3 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
              {availableRoles.map((role) => (
                <label key={role} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent">
                  <Checkbox checked={roles.includes(role)} disabled={!profile?.canManage} onCheckedChange={(checked: boolean | "indeterminate") => setRoles((current) => checked ? [...new Set([...current, role])] : current.filter((item) => item !== role))} />
                  <span className="truncate">{role}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <ScopeCard profile={profile} login={login} onChanged={load} />
            <PasswordCard login={login} />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Phạm vi dữ liệu — giới hạn người này chỉ thấy dữ liệu của một kho / một công ty.
 *
 * Khác với vai trò: vai trò trả lời "làm được gì", phạm vi trả lời "trên dữ liệu nào".
 * Thủ kho Xưởng 2 có đúng quyền của thủ kho, nhưng chỉ trên kho của Xưởng 2.
 */
function ScopeCard({ profile, login, onChanged }: { profile?: AccessProfileSummary; login: string; onChanged: () => Promise<void> }) {
  const { adapter } = useMetaForge();
  const [allow, setAllow] = useState<string>("Warehouse");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!value) return;
    setSaving(true);
    try {
      await adapter.addUserPermission({ user: login, allow, forValue: value });
      toast.success("Đã thêm phạm vi");
      setValue(""); await onChanged();
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    try { await adapter.removeUserPermission(id); toast.success("Đã bỏ phạm vi"); await onChanged(); }
    catch (error) { toast.error(adapter.mapError(error).message); }
  }

  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-semibold">Phạm vi dữ liệu</h3>
      <p className="mt-1 text-xs text-muted-foreground">Bỏ trống = thấy toàn bộ. Thêm một dòng = chỉ thấy đúng những giá trị đã liệt kê.</p>
      {profile?.canManage ? (
        <div className="mt-3 grid items-end gap-2 sm:grid-cols-[9rem_1fr_auto]">
          <div>
            <Label className="text-xs">Loại</Label>
            <Select value={allow} onValueChange={(next: string) => { setAllow(next); setValue(""); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{SCOPE_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Giá trị</Label><ScopeValuePicker adapter={adapter} doctype={allow} value={value} onChange={setValue} /></div>
          <Button onClick={add} disabled={!value || saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}</Button>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {profile?.scopes?.length ? profile.scopes.map((scope) => (
          <div key={scope.doctype} className="rounded-lg border bg-muted/20 p-2">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{SCOPE_TYPES.find((item) => item.value === scope.doctype)?.label ?? scope.doctype}</div>
            {scope.values.map((item) => (
              <div key={item.id ?? item.value} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                {profile.canManage && item.id ? <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => remove(item.id!)} aria-label={`Bỏ ${item.label}`}><Trash2 /></Button> : null}
              </div>
            ))}
          </div>
        )) : <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Không giới hạn — người này thấy toàn bộ dữ liệu.</p>}
      </div>
    </div>
  );
}

function PasswordCard({ login }: { login: string }) {
  const { adapter } = useMetaForge();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  async function reset() {
    setSaving(true);
    try {
      await adapter.updatePassword(password, { user: login, logoutAll: 1 });
      toast.success(`Đã đặt lại mật khẩu cho ${login}`);
      setPassword("");
    } catch (error) { toast.error(adapter.mapError(error).message); }
    finally { setSaving(false); }
  }
  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-semibold">Cấp lại mật khẩu</h3>
      {/* Đặt lại mật khẩu kết thúc mọi phiên đang mở của người đó — nói trước, vì nếu họ
          đang làm dở thì đó là điều người quản trị cần cân nhắc, không phải một bất ngờ. */}
      <p className="mt-1 text-xs text-muted-foreground">Mọi phiên đang đăng nhập của người này sẽ bị thoát ngay.</p>
      <div className="mt-3 flex gap-2">
        <Input value={password} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)} placeholder={`Mật khẩu mới, ít nhất ${MIN_PASSWORD_LENGTH} ký tự`} autoComplete="new-password" />
        <Button variant="outline" onClick={reset} disabled={saving || password.length < MIN_PASSWORD_LENGTH}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Đặt lại
        </Button>
      </div>
    </div>
  );
}

/**
 * Ma trận quyền theo vai trò — CHỈ ĐỌC, và nói rõ vì sao.
 *
 * Nền tảng từ chối sửa DocPerm qua màn này: quyền của một DocType do gói app khai, nên một
 * sửa đổi ở đây sẽ sống tới lần cài app kế tiếp rồi biến mất không dấu vết. Ô tích sửa được
 * chỉ dẫn tới một thông báo lỗi, nên bỏ hẳn và giải thích là trung thực hơn.
 */
function RoleMatrix({ meta, doctype, setDoctype }: { meta: RolesAndDoctypes | null; doctype: string; setDoctype: (value: string) => void }) {
  const { adapter } = useMetaForge();
  const [rules, setRules] = useState<DocPermRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!doctype) return;
    let alive = true;
    setLoading(true); setError(undefined);
    adapter.perm.get(doctype)
      .then((result) => { if (alive) setRules(result); })
      .catch((caught) => { if (alive) { setRules([]); setError(adapter.mapError(caught).message); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [adapter, doctype]);

  const ptypes = meta?.doctype_ptype_map?.[doctype] ?? ["read", "write", "create", "delete", "submit", "cancel", "amend"];
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div><h2 className="font-semibold">Quyền theo vai trò</h2><p className="text-xs text-muted-foreground">Ai làm được gì trên từng loại chứng từ.</p></div>
        <div className="flex w-full flex-col gap-1.5 sm:ml-auto sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <Label className="text-xs text-muted-foreground">Loại chứng từ</Label>
          {meta ? <Select value={doctype} onValueChange={setDoctype}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent>{meta.doctypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select> : <Skeleton className="h-9 w-full sm:w-64" />}
        </div>
      </div>
      <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        Bảng này chỉ để xem. Quyền của mỗi loại chứng từ do gói ứng dụng khai và được cài cùng ứng dụng — sửa trực tiếp ở đây sẽ bị ghi đè ở lần cập nhật kế tiếp. Cần đổi thì sửa trong brief rồi cài lại.
      </div>
      {loading ? <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9" />)}</div>
        : error ? <ErrorBox message={error} />
        : <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 min-w-48 bg-card">Vai trò</TableHead>
                <TableHead className="w-32 text-center">Chỉ bản ghi mình lập</TableHead>
                {ptypes.map((ptype) => <TableHead key={ptype} className="min-w-20 text-center">{PTYPE_LABEL[ptype] ?? ptype}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {rules.length ? rules.map((rule, index) => (
                  <TableRow key={`${rule.role}:${rule.permlevel}:${index}`}>
                    <TableCell className="sticky left-0 z-[1] bg-card font-medium">{rule.role}</TableCell>
                    <TableCell className="text-center">{rule.if_owner ? <Badge variant="outline">Có</Badge> : "—"}</TableCell>
                    {ptypes.map((ptype) => (
                      <TableCell key={ptype} className="text-center">
                        {(rule as Record<string, unknown>)[ptype] === 1 ? <Check className="mx-auto size-4 text-emerald-600" /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                )) : <TableRow><TableCell colSpan={ptypes.length + 2} className="h-24 text-center text-muted-foreground">Chưa có dòng phân quyền nào cho loại chứng từ này.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>}
      {!loading && !error ? <div className="space-y-3 p-3 md:hidden">
        {rules.length ? rules.map((rule, index) => {
          const granted = ptypes.filter((ptype) => (rule as Record<string, unknown>)[ptype] === 1);
          return <article key={`${rule.role}:${rule.permlevel}:${index}`} className="rounded-lg border p-3">
            <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 font-medium">{rule.role}</h3>{rule.if_owner ? <Badge variant="outline">Chỉ bản ghi mình lập</Badge> : null}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">{granted.length ? granted.map((ptype) => <Badge key={ptype} variant="secondary"><Check className="mr-1 size-3" />{PTYPE_LABEL[ptype] ?? ptype}</Badge>) : <span className="text-xs text-muted-foreground">Không có hành động được cấp.</span>}</div>
          </article>;
        }) : <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dòng phân quyền nào cho loại chứng từ này.</p>}
      </div> : null}
    </section>
  );
}

/** Kiểm tra quyền thực tế — trả lời "vì sao người này không mở được chứng từ đó". */
function CheckPanel({ meta, doctype, setDoctype, users }: { meta: RolesAndDoctypes | null; doctype: string; setDoctype: (value: string) => void; users: TenantUser[] }) {
  const { adapter, businessContext } = useMetaForge();
  const [user, setUser] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [data, setData] = useState<EffectivePermissionResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    if (!doctype) return;
    setLoading(true); setError(undefined);
    try { setData(await adapter.explainPermission(doctype, documentName.trim() || undefined, businessContext, user || undefined)); }
    catch (caught) { setData(undefined); setError(adapter.mapError(caught).message); }
    finally { setLoading(false); }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Kiểm tra quyền thực tế</h2>
      <p className="mt-1 text-sm text-muted-foreground">Chọn một người và một loại chứng từ để xem họ thật sự làm được gì, và luật nào quyết định điều đó.</p>
      <div className="mt-4 grid items-end gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <div>
          <Label className="text-xs">Người dùng</Label>
          <Select value={user} onValueChange={setUser}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Tôi (đang đăng nhập)" /></SelectTrigger>
            <SelectContent>{users.map((item) => <SelectItem key={item.user} value={item.user}>{item.full_name || item.user}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Loại chứng từ</Label>
          {meta ? <Select value={doctype} onValueChange={setDoctype}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{meta.doctypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select> : <Skeleton className="mt-1 h-9" />}
        </div>
        <div>
          <Label className="text-xs">Số chứng từ (không bắt buộc)</Label>
          <Input className="mt-1" value={documentName} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDocumentName(event.target.value)} placeholder="vd: DH-2026-0012" />
        </div>
        <Button onClick={run} disabled={loading || !doctype}>{loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Kiểm tra</Button>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      {data ? (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.capabilities).map(([key, allowed]) => (
              <Badge key={key} variant={allowed ? "default" : "destructive"}>{allowed ? <Check className="mr-1 size-3" /> : <ShieldAlert className="mr-1 size-3" />}{PTYPE_LABEL[key] ?? key}</Badge>
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Vì sao</h3>
            <div className="space-y-2">
              {(data.trace ?? []).map((item, index) => (
                <div key={`${item.source}:${item.label}:${index}`} className={cn("rounded-lg border p-3", item.effect === "deny" && "border-destructive/30 bg-destructive/5", item.effect === "allow" && "border-emerald-500/30 bg-emerald-500/5")}>
                  <div className="flex items-center gap-2"><Badge variant="outline">{item.source}</Badge><span className="text-sm font-medium">{item.label}</span></div>
                  {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ScopeValuePicker({ adapter, doctype, value, onChange }: { adapter: ReturnType<typeof useMetaForge>["adapter"]; doctype: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Array<{ value: string; description?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const current = ++seq.current;
    const timer = setTimeout(() => {
      setLoading(true);
      void adapter.searchLink(doctype, text, { pageLength: 20 })
        .then((result) => { if (seq.current === current) setItems(result); })
        .catch(() => { if (seq.current === current) setItems([]); })
        .finally(() => { if (seq.current === current) setLoading(false); });
    }, 200);
    return () => clearTimeout(timer);
  }, [adapter, doctype, open, text]);
  const picked = items.find((item) => item.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" className="mt-1 w-full justify-between font-normal"><span className="truncate">{picked?.description || value || "Chọn…"}</span><ChevronsUpDown className="size-4 opacity-50" /></Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={text} onValueChange={setText} placeholder="Tìm…" />
          <CommandList>
            {loading ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Đang tìm…</div> : <>
              <CommandEmpty>Không có kết quả.</CommandEmpty>
              {items.map((item) => (
                <CommandItem key={item.value} value={item.value} onSelect={() => { onChange(item.value); setOpen(false); }}>
                  <Check className={cn("mr-2 size-4", item.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="block min-w-0 truncate">{item.description || item.value}</span>
                </CommandItem>
              ))}
            </>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ApprovalQueue() {
  const { adapter } = useMetaForge();
  const [items, setItems] = useState<ApprovalInboxItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [document, setDocument] = useState<Doc>();
  const [meta, setMeta] = useState<DocTypeMeta>();
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [processing, setProcessing] = useState("");
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const result = await adapter.getApprovalInbox({ search: search.trim() || undefined, limit: 100 });
      setItems(result.items);
      setSelectedKey((current) => current && result.items.some((item) => approvalKey(item) === current) ? current : undefined);
    } catch (caught) { setItems([]); setError(adapter.mapError(caught).message); }
    finally { setLoading(false); }
  }, [adapter, search]);
  useEffect(() => { void load(); }, [load]);

  const selected = items.find((item) => approvalKey(item) === selectedKey);
  useEffect(() => {
    let alive = true;
    setDocument(undefined); setMeta(undefined);
    if (!selected) return () => { alive = false; };
    setDetailLoading(true);
    void Promise.all([adapter.getDoc(selected.doctype, selected.name), adapter.getMeta(selected.doctype)])
      .then(([loaded, loadedMeta]) => { if (alive) { setDocument(loaded.doc); setMeta(loadedMeta); } })
      .catch((caught) => { if (alive) setError(adapter.mapError(caught).message); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [adapter, selectedKey]);

  async function act(item: ApprovalInboxItem, action: string) {
    const needsReason = /từ chối|yêu cầu|sửa|thu hồi|hủy|huỷ|reject|return/i.test(action);
    if (needsReason && !comment.trim()) { toast.error("Nhập lý do trước khi thực hiện hành động này."); return; }
    setProcessing(action); setError(undefined);
    try {
      const sod = await adapter.checkSoD({ doctype: item.doctype, name: item.name, action });
      if (!sod.allowed) throw new Error(sod.conflicts[0]?.reason || "Luật tách nhiệm vụ không cho phép hành động này.");
      await adapter.workflowActionWithComment(item.doctype, item.name, action, comment.trim() || undefined);
      toast.success(`Đã thực hiện “${action}” cho ${item.name}`);
      setComment(""); await load();
    } catch (caught) { setError(adapter.mapError(caught).message); }
    finally { setProcessing(""); }
  }

  const common = { items, selected, document, meta, selectedKey, setSelectedKey, comment, setComment, processing, act, detailLoading };
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0"><h2 className="font-semibold">Hộp duyệt của tôi</h2><p className="text-xs text-muted-foreground">Phiếu đúng vai trò, phạm vi và ủy quyền đang hiệu lực.</p></div>
        <div className="relative ml-auto min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={search} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Tìm phiếu chờ duyệt…" />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Tải lại</Button>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      {loading ? <div className="grid gap-3 p-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div>
        : !items.length ? <div className="p-8 text-center"><ClipboardCheck className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-medium">Không có phiếu chờ duyệt</p><p className="mt-1 text-sm text-muted-foreground">Các phiếu mới sẽ xuất hiện khi đúng vai trò hoặc ủy quyền của bạn.</p></div>
        : <>
            <div className="hidden min-h-[34rem] md:block"><ApprovalDesktop {...common} /></div>
            <div className="md:hidden"><ApprovalMobile {...common} /></div>
          </>}
    </section>
  );
}

type ApprovalRenderProps = {
  items: ApprovalInboxItem[]; selected?: ApprovalInboxItem; document?: Doc; meta?: DocTypeMeta;
  selectedKey?: string; setSelectedKey: (value?: string) => void; comment: string; setComment: (value: string) => void;
  processing: string; detailLoading: boolean; act: (item: ApprovalInboxItem, action: string) => Promise<void>;
};

function ApprovalDesktop(props: ApprovalRenderProps) {
  return <div className="grid h-full grid-cols-[19rem_minmax(0,1fr)_19rem]">
    <div className="overflow-y-auto border-r p-2">{props.items.map((item) => <ApprovalQueueButton key={approvalKey(item)} item={item} active={approvalKey(item) === props.selectedKey} onClick={() => props.setSelectedKey(approvalKey(item))} />)}</div>
    <div className="min-w-0 overflow-y-auto p-5"><ApprovalDocumentPreview {...props} /></div>
    <aside className="overflow-y-auto border-l bg-muted/20 p-4"><ApprovalActions {...props} /></aside>
  </div>;
}

function ApprovalMobile(props: ApprovalRenderProps) {
  if (!props.selected) return <div className="space-y-2 p-3">{props.items.map((item) => <ApprovalQueueButton key={approvalKey(item)} item={item} active={false} onClick={() => props.setSelectedKey(approvalKey(item))} />)}</div>;
  return <div className="min-h-[32rem]">
    <div className="sticky top-0 z-10 border-b bg-card p-2"><Button variant="ghost" onClick={() => props.setSelectedKey(undefined)}><ArrowLeft className="size-4" /> Danh sách</Button></div>
    <div className="space-y-5 p-4"><ApprovalDocumentPreview {...props} /><ApprovalActions {...props} /></div>
  </div>;
}

function ApprovalQueueButton({ item, active, onClick }: { item: ApprovalInboxItem; active: boolean; onClick: () => void }) {
  return <Button type="button" variant="ghost" onClick={onClick} className={cn("mb-2 h-auto w-full justify-start whitespace-normal rounded-lg border p-3 text-left font-normal transition-colors", active ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
    <span className="block min-w-0 flex-1"><span className="flex items-start gap-2"><span className="min-w-0 flex-1 truncate font-medium">{item.title}</span><Badge variant="outline">{item.state}</Badge></span>
    <span className="mt-1 block truncate text-xs text-muted-foreground">{item.doctype} · {item.name}</span>
    <span className="mt-2 block text-xs text-muted-foreground">Cập nhật {formatDate(item.modified_at, "dd/mm/yyyy")}</span></span>
  </Button>;
}

function ApprovalDocumentPreview({ selected, document, meta, detailLoading }: ApprovalRenderProps) {
  if (!selected) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Chọn một phiếu để xem.</div>;
  if (detailLoading) return <div className="space-y-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10" />)}</div>;
  const fields = (meta?.fields ?? []).filter((field) => !field.hidden && !["Section Break", "Column Break", "Tab Break", "Table"].includes(field.fieldtype)).filter((field) => document?.[field.fieldname] != null && document?.[field.fieldname] !== "").slice(0, 14);
  return <div>
    <div className="flex flex-wrap items-start gap-3 border-b pb-4"><div className="min-w-0 flex-1"><h3 className="truncate text-lg font-semibold">{selected.title}</h3><p className="text-sm text-muted-foreground">{selected.doctype} · {selected.name}</p></div><Button asChild variant="outline" size="sm"><a href={`/app/${encodeURIComponent(selected.doctype)}/${encodeURIComponent(selected.name)}`}><ExternalLink className="size-4" /> Mở hồ sơ</a></Button></div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map((field) => <div key={field.fieldname} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{field.label || field.fieldname}</dt><dd className="mt-1 break-words text-sm font-medium">{displayValue(document?.[field.fieldname])}</dd></div>)}</dl>
  </div>;
}

function ApprovalActions({ selected, comment, setComment, processing, act }: ApprovalRenderProps) {
  if (!selected) return null;
  return <div><h3 className="font-semibold">Quyết định</h3><p className="mt-1 text-xs text-muted-foreground">Server kiểm tra lại phiên bản, phạm vi, ủy quyền và SoD trước khi ghi.</p>
    <div className="mt-4"><Label htmlFor="approval-comment">Lý do / ghi chú</Label><Textarea id="approval-comment" className="mt-1.5 min-h-24" value={comment} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setComment(event.target.value)} placeholder="Bắt buộc khi từ chối hoặc yêu cầu sửa…" /></div>
    <div className="mt-4 grid gap-2">{selected.actions.map((item) => <Button key={item.action} variant={/từ chối|sửa|thu hồi|hủy|huỷ/i.test(item.action) ? "outline" : "default"} onClick={() => void act(selected, item.action)} disabled={Boolean(processing)}>{processing === item.action ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{item.action}</Button>)}</div>
    {selected.actions.some((item) => item.delegation) ? <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">Đang xử lý theo ủy quyền hiệu lực; người ủy quyền và mã ủy quyền được ghi cùng kết quả.</div> : null}
  </div>;
}

function AuditCenter() {
  const { adapter } = useMetaForge();
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [entityType, setEntityType] = useState("");
  const [entityName, setEntityName] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [reason, setReason] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (append = false) => {
    setLoading(true); setError(undefined);
    try {
      const result = await adapter.getAuditEvents({ entityType: entityType.trim() || undefined, entityName: entityName.trim() || undefined, actor: actorFilter.trim() || undefined, cursor: append ? cursor ?? undefined : undefined, limit: 100 });
      setEvents((current) => append ? [...current, ...result.events] : result.events);
      setCursor(result.next_cursor);
      setSelectedId((current) => current && (append ? [...events, ...result.events] : result.events).some((event) => event.event_id === current) ? current : undefined);
    } catch (caught) { if (!append) setEvents([]); setError(adapter.mapError(caught).message); }
    finally { setLoading(false); }
  }, [adapter, entityType, entityName, actorFilter, cursor, events]);
  useEffect(() => { void load(false); }, [adapter]);
  const selected = events.find((event) => event.event_id === selectedId);

  async function download() {
    if (!reason.trim()) { toast.error("Nhập lý do xuất bằng chứng kiểm toán."); return; }
    setExporting(true);
    try {
      const file = await adapter.exportAuditEvidence({ reason: reason.trim(), entityType: entityType.trim() || undefined, entityName: entityName.trim() || undefined, actor: actorFilter.trim() || undefined, limit: 1000 });
      const url = URL.createObjectURL(new Blob([file.content], { type: file.content_type }));
      const link = document.createElement("a"); link.href = url; link.download = file.file_name; link.click(); URL.revokeObjectURL(url);
      toast.success(`Đã xuất ${file.row_count} sự kiện; SHA-256 ${file.checksum_sha256.slice(0, 12)}…`);
    } catch (caught) { setError(adapter.mapError(caught).message); }
    finally { setExporting(false); }
  }

  const common = { events, selected, selectedId, setSelectedId };
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="border-b p-4"><div className="flex flex-wrap items-start gap-2"><div><h2 className="font-semibold">Nhật ký kiểm toán bất biến</h2><p className="text-xs text-muted-foreground">Gộp lịch sử chứng từ và thay đổi tài khoản; bí mật được che trước khi trả về.</p></div><Button className="ml-auto" variant="outline" onClick={() => void download()} disabled={exporting}>{exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Xuất bằng chứng</Button></div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"><Input value={entityType} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEntityType(event.target.value)} placeholder="Loại đối tượng" /><Input value={entityName} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEntityName(event.target.value)} placeholder="Mã bản ghi" /><Input value={actorFilter} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setActorFilter(event.target.value)} placeholder="Người thực hiện" /><Button onClick={() => void load(false)} disabled={loading}><Search className="size-4" /> Lọc</Button></div>
      <div className="mt-2"><Label htmlFor="audit-export-reason" className="text-xs">Lý do xuất file</Label><Input id="audit-export-reason" className="mt-1" value={reason} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setReason(event.target.value)} placeholder="Ví dụ: Hồ sơ kiểm toán quý 3/2026" /></div>
    </div>
    {error ? <ErrorBox message={error} /> : null}
    {loading && !events.length ? <div className="space-y-2 p-4">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
      : !events.length ? <div className="p-8 text-center"><FileClock className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-medium">Chưa có sự kiện phù hợp</p><p className="mt-1 text-sm text-muted-foreground">Xóa bộ lọc hoặc thực hiện một thay đổi để tạo dấu vết đầu tiên.</p></div>
      : <><div className="hidden min-h-[36rem] md:block"><AuditDesktop {...common} /></div><div className="md:hidden"><AuditMobile {...common} /></div>{cursor ? <div className="border-t p-3 text-center"><Button variant="outline" onClick={() => void load(true)} disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : null} Tải thêm</Button></div> : null}</>}
  </section>;
}

type AuditRenderProps = { events: AuditEventItem[]; selected?: AuditEventItem; selectedId?: string; setSelectedId: (value?: string) => void };
function AuditDesktop(props: AuditRenderProps) { return <div className="grid h-full grid-cols-[20rem_minmax(0,1fr)_18rem]"><div className="overflow-y-auto border-r p-2">{props.events.map((event) => <AuditEventButton key={event.event_id} event={event} active={event.event_id === props.selectedId} onClick={() => props.setSelectedId(event.event_id)} />)}</div><div className="min-w-0 overflow-y-auto p-5"><AuditDiff event={props.selected} /></div><aside className="overflow-y-auto border-l bg-muted/20 p-4"><AuditContext event={props.selected} /></aside></div>; }
function AuditMobile(props: AuditRenderProps) { if (!props.selected) return <div className="space-y-2 p-3">{props.events.map((event) => <AuditEventButton key={event.event_id} event={event} active={false} onClick={() => props.setSelectedId(event.event_id)} />)}</div>; return <div><div className="sticky top-0 z-10 border-b bg-card p-2"><Button variant="ghost" onClick={() => props.setSelectedId(undefined)}><ArrowLeft className="size-4" /> Nhật ký</Button></div><div className="space-y-5 p-4"><AuditDiff event={props.selected} /><AuditContext event={props.selected} /></div></div>; }
function AuditEventButton({ event, active, onClick }: { event: AuditEventItem; active: boolean; onClick: () => void }) { return <Button type="button" variant="ghost" onClick={onClick} className={cn("mb-2 h-auto w-full justify-start whitespace-normal rounded-lg border p-3 text-left font-normal", active ? "border-primary bg-primary/5" : "hover:bg-muted/50")}><span className="block min-w-0 flex-1"><span className="flex gap-2"><Badge variant="outline">{event.action}</Badge><span className="ml-auto text-xs text-muted-foreground">{formatDate(event.occurred_at, "dd/mm/yyyy")}</span></span><span className="mt-2 block truncate text-sm font-medium">{event.entity_type} · {event.entity_name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{event.actor}</span></span></Button>; }
function AuditDiff({ event }: { event?: AuditEventItem }) { if (!event) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Chọn một sự kiện để xem thay đổi.</div>; const rows = diffAudit(event.before_json, event.after_json); return <div><h3 className="text-lg font-semibold">Thay đổi dữ liệu</h3><p className="mt-1 text-sm text-muted-foreground">{event.entity_type} · {event.entity_name}</p><div className="mt-4 space-y-2">{rows.length ? rows.map((row) => <div key={row.field} className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[10rem_1fr_1fr]"><div className="text-xs font-semibold">{row.field}</div><div><span className="text-[11px] uppercase text-muted-foreground">Trước</span><p className="break-words text-sm">{row.before}</p></div><div><span className="text-[11px] uppercase text-muted-foreground">Sau</span><p className="break-words text-sm">{row.after}</p></div></div>) : <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Sự kiện không có thay đổi field-level để hiển thị.</p>}</div></div>; }
function AuditContext({ event }: { event?: AuditEventItem }) { if (!event) return null; return <div><h3 className="font-semibold">Dấu vết</h3><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Người thực hiện</dt><dd className="break-all font-medium">{event.actor}</dd></div><div><dt className="text-xs text-muted-foreground">Thời điểm</dt><dd>{formatDate(event.occurred_at, "dd/mm/yyyy")} {event.occurred_at.slice(11, 19)}</dd></div><div><dt className="text-xs text-muted-foreground">Correlation ID</dt><dd className="break-all font-mono text-xs">{event.correlation_id}</dd></div><div><dt className="text-xs text-muted-foreground">Nguồn</dt><dd>{event.source === "rbac" ? "Quản trị truy cập" : "Phiên bản chứng từ"}</dd></div></dl></div>; }
function diffAudit(beforeRaw: unknown, afterRaw: unknown): Array<{ field: string; before: string; after: string }> { const before = auditPayload(beforeRaw); const after = auditPayload(afterRaw); const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(); return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).slice(0, 100).map((field) => ({ field, before: displayValue(before[field]), after: displayValue(after[field]) })); }
function auditPayload(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const object = value as Record<string, unknown>; return object.data && typeof object.data === "object" && !Array.isArray(object.data) ? object.data as Record<string, unknown> : object; }
function displayValue(value: unknown): string { if (value == null || value === "") return "—"; if (typeof value === "boolean") return value ? "Có" : "Không"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
function approvalKey(item?: ApprovalInboxItem): string | undefined { return item ? `${item.doctype}:${item.name}` : undefined; }

function ErrorBox({ message }: { message: string }) {
  return <div className="m-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><ShieldAlert className="size-4 shrink-0" /><span>{message}</span></div>;
}
