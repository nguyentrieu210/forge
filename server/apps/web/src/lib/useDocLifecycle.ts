import { useRef, useState } from "react";
import { api, newId } from "./api";
import { CloudForgeApiError, type MutationAction } from "./cloudforge";
import { rememberDoc } from "./recentDocs";

export type Banner = { kind: "success" | "error" | "conflict"; message: string; code?: string; traceId?: string };

/** Extra fields recorded in the recent-docs list for a friendlier listing. */
export interface DocSummary {
  status?: string;
  customer?: string;
  amount?: string;
}

export interface RunConfig {
  doctype: string;
  name: string;
  buildDocument: () => Record<string, unknown>;
  summary?: DocSummary;
}

export interface LoadResult {
  doctype: string;
  name: string;
  version: number;
  docstatus: number;
  summary?: DocSummary;
}

/**
 * The command lifecycle state machine shared by every O2C screen. Centralising
 * it keeps the subtle bits identical everywhere: a command_id is reused across
 * retries so replays are idempotent, and deterministic failures (409/422/403)
 * are surfaced rather than silently retried.
 */
export function useDocLifecycle() {
  const [version, setVersion] = useState<number | null>(null);
  const [docstatus, setDocstatus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [pending, setPending] = useState<{ action: MutationAction; config: RunConfig; commandId: string } | null>(null);
  const versionRef = useRef<number | null>(null);
  versionRef.current = version;

  async function run(action: MutationAction, config: RunConfig, commandId = newId("cmd")): Promise<void> {
    setBusy(true);
    setBanner(null);
    try {
      const receipt = await api.mutate({
        doctype: config.doctype,
        name: config.name,
        action,
        expectedVersion: action === "create" ? null : versionRef.current,
        document: config.buildDocument(),
        commandId,
      });
      const nextDocstatus = action === "submit" ? 1 : action === "cancel" ? 2 : 0;
      setVersion(receipt.aggregate_version);
      setDocstatus(nextDocstatus);
      setPending(null);
      rememberDoc({
        doctype: config.doctype,
        name: config.name,
        docstatus: nextDocstatus,
        version: receipt.aggregate_version,
        ...config.summary,
      });
      setBanner({ kind: "success", message: `${action} committed — version ${receipt.aggregate_version}` });
    } catch (error) {
      if (error instanceof CloudForgeApiError) {
        // 409 conflict / 422 business / 403 permission are deterministic: do NOT
        // silently retry the same command; surface and let the user fix or reload.
        const retryable = error.status !== 409 && error.status !== 422 && error.status !== 403;
        setPending(retryable ? { action, config, commandId } : null);
        setBanner({
          kind: error.status === 409 ? "conflict" : "error",
          message: error.message,
          code: error.code,
          traceId: error.traceId,
        });
      } else {
        // Network failure: keep the SAME command_id so a retry replays idempotently.
        setPending({ action, config, commandId });
        setBanner({ kind: "error", message: error instanceof Error ? error.message : "Network error" });
      }
    } finally {
      setBusy(false);
    }
  }

  /** Wrap a screen-specific loader (fetch + populate its form) with busy/banner/remember. */
  async function load(loader: () => Promise<LoadResult>): Promise<void> {
    setBusy(true);
    setBanner(null);
    try {
      const result = await loader();
      setVersion(result.version);
      setDocstatus(result.docstatus);
      setPending(null);
      rememberDoc({
        doctype: result.doctype,
        name: result.name,
        docstatus: result.docstatus,
        version: result.version,
        ...result.summary,
      });
      setBanner({ kind: "success", message: `Reloaded version ${result.version}` });
    } catch (error) {
      setBanner({
        kind: "error",
        message: error instanceof CloudForgeApiError ? `${error.code}: ${error.message}` : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  function retry(): void {
    if (pending) void run(pending.action, pending.config, pending.commandId);
  }

  /** Reset to a brand-new draft (called when the screen starts a fresh document). */
  function reset(): void {
    setVersion(null);
    setDocstatus(null);
    setPending(null);
    setBanner(null);
  }

  const act = (action: MutationAction, config: RunConfig) => run(action, config);

  return {
    version,
    docstatus,
    busy,
    banner,
    pending,
    created: version !== null,
    isDraft: docstatus === 0,
    isSubmitted: docstatus === 1,
    act,
    retry,
    load,
    reset,
    setBanner,
  };
}
