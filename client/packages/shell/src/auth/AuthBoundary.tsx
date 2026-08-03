/**
 * AuthBoundary — authoritative session boundary shared by every runtime app.
 *
 * UI V3 changes presentation only: cookie-session, getBoot dedupe, CSRF installation,
 * logout invalidation and onSessionExpired behavior remain the same authority as before.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { FrappeAdapter, MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { AuthBootScreen, AuthErrorScreen, AuthNotice, HiddenAuthRender, type AuthNoticeKind } from "./AuthPresentation.js";

// Dedupe per adapter instance so StrictMode does not duplicate the initial boot request.
const bootPromises = new WeakMap<FrappeAdapter, Promise<MetaForgeBootDTO>>();
function getBootOnce(adapter: FrappeAdapter): Promise<MetaForgeBootDTO> {
  let p = bootPromises.get(adapter);
  if (!p) {
    p = adapter.getBoot().catch((e: unknown) => {
      bootPromises.delete(adapter);
      throw e;
    });
    bootPromises.set(adapter, p);
  }
  return p;
}

// A successful boot must also be invalidated whenever the current authenticated session ends.
function invalidateBoot(adapter: FrappeAdapter): void {
  bootPromises.delete(adapter);
}

export type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "ready"; boot: MetaForgeBootDTO };

export interface AuthedContext {
  /** Logs out through the adapter, then immediately returns presentation to guest. */
  logout: () => Promise<void>;
}

export interface AuthBoundaryProps {
  adapter: FrappeAdapter;
  /** Guest or expired-session content. `retry` performs a fresh authoritative boot after login. */
  renderGuest: (retry: () => void) => ReactNode;
  /** Kept for compatibility; V3 renders one canonical auth error chrome and mounts this result hidden. */
  renderError?: (message: string) => ReactNode;
  /** Kept for compatibility; V3 renders one canonical boot surface and mounts this result hidden. */
  renderLoading?: () => ReactNode;
  children: (boot: MetaForgeBootDTO, ctx: AuthedContext) => ReactNode;
}

export function AuthBoundary({ adapter, renderGuest, renderError, renderLoading, children }: AuthBoundaryProps): ReactNode {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [notice, setNotice] = useState<AuthNoticeKind | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(() => {
    setNotice(null);
    setState({ status: "loading" });
    getBootOnce(adapter)
      .then((boot) => {
        if (!aliveRef.current) return;
        adapter.setCsrfToken(boot.csrf_token);
        setState({ status: "ready", boot });
      })
      .catch((e: unknown) => {
        if (!aliveRef.current) return;
        const ae = adapter.mapError(e);
        // Authentication/permission failures still mean guest. No server/session semantics changed.
        if (ae.kind === "auth" || ae.kind === "permission") setState({ status: "guest" });
        else setState({ status: "error", message: ae.message });
      });
  }, [adapter]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    // Session expiry during use still invalidates the successful boot cache immediately.
    const unsubscribe = adapter.onSessionExpired(() => {
      if (!aliveRef.current) return;
      invalidateBoot(adapter);
      setNotice("session-expired");
      setState({ status: "guest" });
    });
    return () => {
      aliveRef.current = false;
      unsubscribe();
    };
  }, [adapter, load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const logout = useCallback(async () => {
    try {
      await adapter.logout();
    } finally {
      // Same authority as before: even a failed server logout clears the local boot cache and UI session.
      invalidateBoot(adapter);
      setNotice("signed-out");
      setState({ status: "guest" });
    }
  }, [adapter]);

  if (state.status === "loading") {
    return (
      <>
        <AuthBootScreen />
        <HiddenAuthRender>{renderLoading?.()}</HiddenAuthRender>
      </>
    );
  }

  if (state.status === "guest") {
    return (
      <>
        {notice ? <AuthNotice kind={notice} /> : null}
        {renderGuest(load)}
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <AuthErrorScreen message={state.message} onRetry={load} />
        <HiddenAuthRender>{renderError?.(state.message)}</HiddenAuthRender>
      </>
    );
  }

  return children(state.boot, { logout });
}
