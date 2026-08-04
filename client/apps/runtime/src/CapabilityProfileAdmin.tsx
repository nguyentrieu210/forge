import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CapabilityProfileBuilder,
} from "../../../packages/builder/src/capability/CapabilityProfileBuilder.js";
import {
  capabilityProfileFromResolution,
  type CapabilityCatalogItem,
  type CapabilityProfileModel,
  type CapabilityProfilePayload,
} from "../../../packages/builder/src/capability/capability-profile.js";
import { FrappeAdapterImpl, type MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { AuthBoundary, I18nProvider, LoginForm } from "@metaforge/shell";
import { Button, Toaster } from "@metaforge/ui";

const adapter = new FrappeAdapterImpl({});

interface Resolution {
  profile_id: string;
  valid: boolean;
  capabilities: CapabilityCatalogItem[];
  errors: string[];
  implicit_enables: string[];
  package_requirements: Array<{
    capability_id: string;
    package_id: string;
    min_version: string;
    installed_version: string;
  }>;
  diff: Array<{ capability_id: string; from: string; to: string }>;
}

interface Snapshot {
  profile_id: string;
  version: number;
  resolution: Resolution | null;
}

interface Preview {
  current: { profile_id: string; version: number } | null;
  proposal: CapabilityProfilePayload;
  resolution: Resolution;
}

interface ApplyResult {
  profile_id: string;
  version: number;
  resolution: Resolution;
  outcome: "applied" | "unchanged";
}

function modelFromSnapshot(snapshot: Snapshot): CapabilityProfileModel {
  return capabilityProfileFromResolution({
    profile_id: snapshot.profile_id,
    version: snapshot.version,
    capabilities: (snapshot.resolution?.capabilities ?? []).map((entry) => ({
      ...entry,
      required: entry.state === "required",
    })),
  });
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { message?: T; exc?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? body.exc ?? `HTTP ${response.status}`);
  return body.message as T;
}

function Admin({ boot, logout }: { boot: MetaForgeBootDTO; logout: () => Promise<void> }) {
  const [model, setModel] = useState<CapabilityProfileModel>();
  const [preview, setPreview] = useState<Preview>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const isManager = boot.user === "Administrator"
    || boot.roles.includes("Administrator")
    || boot.roles.includes("System Manager");

  useEffect(() => adapter.setCsrfToken(boot.csrf_token), [boot.csrf_token]);

  const request = useCallback(async <T,>(path: string, payload?: CapabilityProfilePayload): Promise<T> => {
    const response = await fetch(path, {
      method: payload ? "POST" : "GET",
      credentials: "include",
      headers: payload
        ? { "content-type": "application/json", "x-frappe-csrf-token": boot.csrf_token }
        : undefined,
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return readEnvelope<T>(response);
  }, [boot.csrf_token]);

  const reload = useCallback(async () => {
    setError(undefined);
    try {
      const snapshot = await request<Snapshot>("/api/method/metaforge.api.get_capability_profile");
      setModel(modelFromSnapshot(snapshot));
      setPreview(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [request]);

  useEffect(() => { if (isManager) void reload(); }, [isManager, reload]);

  const doPreview = useCallback(async (payload: CapabilityProfilePayload) => {
    setSaving(true);
    setError(undefined);
    try {
      const next = await request<Preview>("/api/method/metaforge.api.preview_capability_profile", payload);
      setPreview(next);
      setModel(capabilityProfileFromResolution({
        profile_id: next.proposal.profile_id,
        version: next.current?.version ?? 0,
        capabilities: next.resolution.capabilities.map((entry) => ({ ...entry, required: entry.state === "required" })),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [request]);

  const doApply = useCallback(async (payload: CapabilityProfilePayload) => {
    setSaving(true);
    setError(undefined);
    try {
      const applied = await request<ApplyResult>("/api/method/metaforge.api.apply_capability_profile", payload);
      setModel(capabilityProfileFromResolution({
        profile_id: applied.profile_id,
        version: applied.version,
        capabilities: applied.resolution.capabilities.map((entry) => ({ ...entry, required: entry.state === "required" })),
      }));
      setPreview({ current: { profile_id: applied.profile_id, version: applied.version }, proposal: payload, resolution: applied.resolution });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [request]);

  const diff = useMemo(() => preview?.resolution.diff ?? [], [preview]);

  if (!isManager) {
    return <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="max-w-md rounded-xl border bg-card p-6 text-center">
        <h1 className="font-semibold">Không có quyền quản trị capability</h1>
        <p className="mt-2 text-sm text-muted-foreground">Màn hình này chỉ dành cho System Manager.</p>
        <Button className="mt-4" variant="outline" onClick={() => { window.location.href = "/"; }}>Quay lại Forge</Button>
      </div>
    </div>;
  }

  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b bg-card px-4 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">App Factory / Dependencies & Capabilities</div>
          <h1 className="font-semibold">Capability Profile</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()}>Tải lại</Button>
        <Button variant="outline" size="sm" onClick={() => { window.location.href = "/"; }}>Forge</Button>
        <Button variant="ghost" size="sm" onClick={() => void logout()}>Đăng xuất</Button>
      </div>
    </header>
    <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      {error ? <div role="alert" className="rounded-md border p-3 text-sm text-destructive">{error}</div> : null}
      {!model ? <div className="rounded-md border p-4 text-sm text-muted-foreground">Đang tải capability profile…</div> : null}
      {model ? <CapabilityProfileBuilder initial={model} saving={saving} onChange={setModel} onPreview={doPreview} onApply={doApply} /> : null}
      {preview ? <section className="rounded-md border bg-card p-4">
        <h2 className="font-medium">Preview thay đổi</h2>
        <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
          <div>Valid: <strong>{preview.resolution.valid ? "PASS" : "BLOCKED"}</strong></div>
          <div>Implicit enable: <strong>{preview.resolution.implicit_enables.length}</strong></div>
          <div>Diff: <strong>{diff.length}</strong></div>
        </div>
        {preview.resolution.errors.length ? <div role="alert" className="mt-3 rounded-md border p-3 text-sm text-destructive">{preview.resolution.errors.join(" · ")}</div> : null}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th className="py-2">Capability</th><th>Từ</th><th>Sang</th></tr></thead>
            <tbody>{diff.map((entry) => <tr key={entry.capability_id} className="border-b last:border-0"><td className="py-2 font-mono text-xs">{entry.capability_id}</td><td>{entry.from}</td><td>{entry.to}</td></tr>)}</tbody>
          </table>
        </div>
      </section> : null}
    </main>
  </div>;
}

export function CapabilityProfileAdmin() {
  return <I18nProvider>
    <AuthBoundary
      adapter={adapter}
      renderLoading={() => <div className="grid min-h-screen place-items-center">Đang kết nối…</div>}
      renderError={(message) => <div className="grid min-h-screen place-items-center p-6 text-destructive">{message}</div>}
      renderGuest={(retry) => <LoginForm adapter={adapter} onSuccess={retry} title="Đăng nhập App Factory" />}
    >{(boot, auth) => <Admin boot={boot} logout={auth.logout} />}</AuthBoundary>
    <Toaster />
  </I18nProvider>;
}
