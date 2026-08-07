import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { LoginForm } from "@metaforge/shell";

/**
 * Compatibility type for the legacy public-route seam in main-base.
 * The branded Social Commerce landing/workbench has been removed from the generic runtime.
 */
export type PublicSocialPage =
  | "/"
  | "/login"
  | "/signup"
  | "/features"
  | "/pricing"
  | "/faq"
  | "/privacy"
  | "/terms"
  | "/facebook/data-deletion"
  | "/security";

export function SocialCommerceLanding({ adapter }: { page?: PublicSocialPage; adapter: FrappeAdapter }) {
  return <LoginForm adapter={adapter} onSuccess={() => window.location.assign("/")} title="Đăng nhập" />;
}
