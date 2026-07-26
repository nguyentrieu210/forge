/**
 * AuthBoundary — lớp auth CHUNG cho app runtime (P1-AUTH-01). Phát hiện Guest/401 từ getBoot,
 * cài CSRF token cho request ghi, và tự đưa UI về guest khi phiên hết hạn GIỮA lúc dùng (không
 * chỉ lúc tải trang) qua adapter.onSessionExpired. App sinh ra (create-metaforge-app) VÀ apps/demo
 * dùng CHUNG component này — không copy logic vào từng app.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { FrappeAdapter, MetaForgeBootDTO } from "@metaforge/adapter-frappe";

// dedupe theo TỪNG adapter instance — StrictMode double-invoke effect KHÔNG gọi getBoot 2 lần,
// và nhiều AuthBoundary (hiếm) dùng adapter khác nhau không đụng cache của nhau.
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
// Review độc lập (checkpoint 453d322) — bug thật: cache CHỈ bị xoá khi getBoot() lỗi. Boot THÀNH
// CÔNG thì promise nằm lại vĩnh viễn trong WeakMap theo adapter instance (1 instance sống suốt vòng
// đời app). User A đăng nhập → boot A cache → logout → User B đăng nhập CÙNG TAB → load() gọi lại
// getBootOnce() vẫn trả promise ĐÃ RESOLVE của A (không hề gọi mạng lại) → UI/roles/scopeKey/CSRF
// của B đều là của A cho tới khi F5. Phải xoá cache ở MỌI điểm rời khỏi "ready": logout() chủ động
// VÀ onSessionExpired() (hết phiên giữa lúc dùng) — không chỉ điểm gọi lại getBoot() lúc lỗi.
function invalidateBoot(adapter: FrappeAdapter): void {
  bootPromises.delete(adapter);
}

export type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "ready"; boot: MetaForgeBootDTO };

export interface AuthedContext {
  /** Đăng xuất: gọi adapter.logout() rồi đưa UI về guest ngay (không đợi 1 request khác fail). */
  logout: () => Promise<void>;
}

export interface AuthBoundaryProps {
  adapter: FrappeAdapter;
  /** Guest hoặc phiên hết hạn. Nhận `retry` để gọi lại sau khi user đăng nhập thành công
   * (vd `<LoginForm onSuccess={retry} />`), hoặc dùng để điều hướng route riêng (`<Navigate to="/login"/>`). */
  renderGuest: (retry: () => void) => ReactNode;
  renderError?: (message: string) => ReactNode;
  renderLoading?: () => ReactNode;
  children: (boot: MetaForgeBootDTO, ctx: AuthedContext) => ReactNode;
}

export function AuthBoundary({ adapter, renderGuest, renderError, renderLoading, children }: AuthBoundaryProps): ReactNode {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const aliveRef = useRef(true);

  const load = useCallback(() => {
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
        // getBoot tự nó fail vì permission (hiếm, vd role bị chặn whitelist) cũng coi là "chưa vào được" → guest.
        if (ae.kind === "auth" || ae.kind === "permission") setState({ status: "guest" });
        else setState({ status: "error", message: ae.message });
      });
  }, [adapter]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    // Hết phiên GIỮA lúc dùng (bất kỳ call nào sau boot ban đầu) → quay lại guest ngay, không cần reload.
    const unsubscribe = adapter.onSessionExpired(() => {
      if (!aliveRef.current) return;
      invalidateBoot(adapter);
      setState({ status: "guest" });
    });
    return () => {
      aliveRef.current = false;
      unsubscribe();
    };
  }, [adapter, load]);

  const logout = useCallback(async () => {
    try {
      await adapter.logout();
    } finally {
      // Xoá cache boot TRƯỚC (không đợi kết quả logout() — dù server logout lỗi, UI vẫn phải coi
      // phiên hiện tại là hết, và lần load() kế tiếp (login khác) PHẢI gọi getBoot() thật lại).
      invalidateBoot(adapter);
      setState({ status: "guest" });
    }
  }, [adapter]);

  if (state.status === "loading") return renderLoading ? renderLoading() : null;
  if (state.status === "guest") return renderGuest(load);
  if (state.status === "error") return renderError ? renderError(state.message) : renderGuest(load);
  return children(state.boot, { logout });
}
