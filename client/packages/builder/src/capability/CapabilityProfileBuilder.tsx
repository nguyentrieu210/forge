/** @jsxImportSource react */
import { AlertTriangle, CheckCircle2, LockKeyhole, RotateCcw, Save } from "lucide-react";
import { Button, Input } from "@metaforge/ui";
import { useEffect, useMemo, useState } from "react";
import {
  serializeCapabilityProfile,
  setCapabilityDesiredState,
  validateCapabilityProfile,
  type CapabilityProfileModel,
  type CapabilityProfilePayload,
} from "./capability-profile.js";

export interface CapabilityProfileBuilderProps {
  initial: CapabilityProfileModel;
  saving?: boolean;
  onChange?: (model: CapabilityProfileModel) => void;
  onPreview?: (payload: CapabilityProfilePayload) => void | Promise<void>;
  onApply?: (payload: CapabilityProfilePayload) => void | Promise<void>;
}

export function CapabilityProfileBuilder(props: CapabilityProfileBuilderProps) {
  const [model, setModel] = useState(props.initial);
  useEffect(() => setModel(props.initial), [props.initial]);
  useEffect(() => { props.onChange?.(model); }, [model, props]);

  const validation = useMemo(() => validateCapabilityProfile(model), [model]);
  const packages = useMemo(() => {
    const grouped = new Map<string, CapabilityProfileModel["capabilities"]>();
    for (const capability of model.capabilities) {
      const rows = grouped.get(capability.package_id) ?? [];
      rows.push(capability);
      grouped.set(capability.package_id, rows);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [model.capabilities]);

  const payload = () => serializeCapabilityProfile(model);

  return (
    <div className="mf-builder mf-capability-profile-builder space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <label className="min-w-52 flex-1 space-y-1 text-sm">
          <span className="font-medium">Capability profile</span>
          <Input value={model.profileId} onChange={(event) => setModel({ ...model, profileId: event.target.value })} />
        </label>
        <div className="text-xs text-muted-foreground">Version hiện tại: {model.expectedVersion}</div>
        <Button variant="outline" size="sm" onClick={() => setModel(props.initial)} disabled={props.saving}>
          <RotateCcw className="size-4" /> Hoàn tác
        </Button>
        <Button variant="outline" size="sm" onClick={() => props.onPreview?.(payload())} disabled={props.saving || !validation.ok}>
          Kiểm tra kế hoạch
        </Button>
        <Button size="sm" onClick={() => props.onApply?.(payload())} disabled={props.saving || !validation.ok}>
          <Save className="size-4" /> Áp dụng
        </Button>
      </div>

      {packages.map(([packageId, capabilities]) => (
        <section key={packageId} className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-semibold">{packageId}</div>
          <div className="divide-y">
            {capabilities.map((capability) => {
              const locked = capability.required || capability.state === "required";
              const blocked = capability.state === "blocked";
              const enabled = locked || capability.desired_state === "enabled";
              return (
                <div key={capability.capability_id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={locked || props.saving}
                    onClick={() => setModel(setCapabilityDesiredState(model, capability.capability_id, enabled ? "disabled" : "enabled"))}
                    className="inline-flex min-w-24 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-60"
                  >
                    {locked ? <LockKeyhole className="size-3.5" /> : enabled ? <CheckCircle2 className="size-3.5" /> : null}
                    {locked ? "Bắt buộc" : enabled ? "Bật" : "Tắt"}
                  </button>
                  <div className="min-w-56 flex-1">
                    <div className="text-sm font-medium">{capability.label}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{capability.capability_id}</div>
                    {capability.description ? <div className="mt-1 text-xs text-muted-foreground">{capability.description}</div> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{capability.source ?? "default"}</div>
                  {blocked ? (
                    <div className="basis-full rounded-md border p-2 text-xs text-destructive" role="alert">
                      <div className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="size-3.5" /> Bị chặn</div>
                      {(capability.blocked_reasons ?? []).map((reason) => <div key={reason}>{reason}</div>)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {!validation.ok ? (
        <div className="rounded-md border p-3 text-xs text-destructive" role="alert">
          {validation.errors.map((error) => <div key={error}>{error}</div>)}
        </div>
      ) : null}
    </div>
  );
}
