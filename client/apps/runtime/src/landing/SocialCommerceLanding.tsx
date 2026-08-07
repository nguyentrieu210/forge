import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { LoginForm } from "@metaforge/shell";

/**
 * Compatibility type for the legacy public-route seam in main-base.
 *
 * The branded Social Commerce landing/workbench has been removed from the generic runtime.
 * Public marketing/product pages must move to a separately deployed site or a future
 * manifest-driven public-page contract; they must not ship as tenant-runtime React hard-code.
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
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Đăng nhập</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Trang giới thiệu hard-code đã được gỡ khỏi runtime. Giao diện công khai phải được khai báo hoặc triển khai độc lập.
        </p>
        <LoginForm adapter={adapter} />
      </section>
    </main>
  );
}
