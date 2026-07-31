/**
 * LoginForm — form đăng nhập MẶC ĐỊNH dùng chung (P1-AUTH-01). adapter.login() đổi session
 * cookie (Frappe set-cookie khi thành công) — KHÔNG có bí mật API phía trình duyệt. App sinh ra
 * dùng thẳng component này; app tự branding có thể truyền `brand`, `title`, `subtitle` và
 * `brandMark` mà không thay đổi auth flow.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Factory,
  LockKeyhole,
  PackageCheck,
  Ruler,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { cn, Button, Input, Label, toast } from "@metaforge/ui";
import { useT } from "../i18n/index.js";

export interface LoginFormProps {
  adapter: FrappeAdapter;
  /** Gọi sau khi login THÀNH CÔNG — thường là `retry` của AuthBoundary để tải lại boot ngay. */
  onSuccess: () => void;
  title?: string;
  subtitle?: string;
  brand?: string;
  brandMark?: ReactNode;
  onForgotPassword?: () => void;
  /** Render only the form card so a product landing page can place it inside a Dialog. */
  embedded?: boolean;
}

const alumdoorFeatures = [
  {
    icon: ClipboardList,
    title: "Báo giá và đơn hàng",
    detail: "Theo dõi báo giá, đơn bán và tiến độ xử lý trong cùng một luồng nghiệp vụ.",
  },
  {
    icon: PackageCheck,
    title: "Mua hàng và kho",
    detail: "Kiểm soát vật tư nhôm, kính, phụ kiện, nhập kho và tồn theo quy cách thực tế.",
  },
  {
    icon: Factory,
    title: "Sản xuất tại xưởng",
    detail: "Nắm công việc cần cắt, gia công và hoàn thiện trước khi chuyển sang lắp đặt.",
  },
  {
    icon: Truck,
    title: "Giao hàng và lắp đặt",
    detail: "Kết nối tiến độ xưởng với lịch giao, lắp đặt và trạng thái hoàn thành công trình.",
  },
];

const alumdoorHighlights = [
  "Một luồng từ báo giá đến nghiệm thu",
  "Vật tư theo chiều dài, barem và quy cách",
  "Phân quyền theo vai trò, kiểm tra phía máy chủ",
];

function isAlumdoorExperience(embedded: boolean) {
  if (embedded || typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  const preview = new URLSearchParams(window.location.search).get("alumdoor") === "1";
  return host === "alu.kairo.vn" || preview;
}

export function LoginForm({
  adapter,
  onSuccess,
  title,
  subtitle,
  brand,
  brandMark,
  onForgotPassword,
  embedded = false,
}: LoginFormProps) {
  const t = useT();
  const alumdoor = isAlumdoorExperience(embedded);
  const resolvedBrand = brand ?? (alumdoor ? "Alumdoor" : "MetaForge");
  const resolvedTitle = alumdoor ? "Đăng nhập Alumdoor" : title ?? t("auth.title");
  const resolvedSubtitle = alumdoor ? "Tiếp tục vào hệ thống quản lý xưởng nhôm kính" : subtitle ?? t("auth.subtitle");
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brandInitial = resolvedBrand.trim().charAt(0).toUpperCase() || "A";

  useEffect(() => {
    if (!alumdoor) return;
    const previous = document.title;
    document.title = "Alumdoor — Quản trị nhôm kính";
    return () => {
      document.title = previous;
    };
  }, [alumdoor]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!usr || !pwd || busy) return;
    setError(null);
    setBusy(true);
    try {
      await adapter.login(usr, pwd);
      onSuccess();
    } catch (caught) {
      const message = adapter.mapError(caught).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const brandIdentity = (
    <div className="flex items-center gap-3">
      {brandMark ? (
        <div className="grid size-10 place-items-center overflow-hidden rounded-xl border bg-card shadow-sm">
          {brandMark}
        </div>
      ) : (
        <div className="mf-brand-mark size-10 rounded-xl text-base shadow-sm">{brandInitial}</div>
      )}
      <div className="min-w-0">
        <p className="truncate text-[17px] font-bold tracking-[-0.02em]">{resolvedBrand}</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {alumdoor ? "Quản trị nhôm kính" : "Business workspace"}
        </p>
      </div>
    </div>
  );

  const form = (
    <form
      onSubmit={submit}
      className={cn(
        "w-full overflow-hidden",
        embedded ? "mx-auto max-w-[400px] bg-card" : "mf-login-card max-w-[440px]",
      )}
    >
      <div className="space-y-6 px-6 py-7 sm:px-8 sm:py-9">
        {brandIdentity}

        <div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-secondary/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-primary">
            <ShieldCheck className="size-3" /> Không gian làm việc bảo mật
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-[1.7rem]">
            {resolvedTitle}
          </h1>
          <p className="mf-login-site mt-2 max-w-sm leading-5">{resolvedSubtitle}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mf-login-usr" className="text-xs font-semibold text-foreground">
              {t("auth.username")}
            </Label>
            <Input
              id="mf-login-usr"
              value={usr}
              onChange={(event) => setUsr(event.target.value)}
              placeholder={t("auth.username_placeholder")}
              autoComplete="username"
              autoFocus={!embedded}
              className="h-11 rounded-xl bg-background/65 px-3.5 shadow-sm transition focus-visible:bg-card"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="mf-login-pwd" className="text-xs font-semibold text-foreground">
                {t("auth.password")}
              </Label>
              {onForgotPassword ? (
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onForgotPassword}>
                  Quên mật khẩu?
                </Button>
              ) : null}
            </div>
            <div className="relative">
              <Input
                id="mf-login-pwd"
                type={showPassword ? "text" : "password"}
                value={pwd}
                onChange={(event) => setPwd(event.target.value)}
                autoComplete="current-password"
                className="h-11 rounded-xl bg-background/65 px-3.5 pr-11 shadow-sm transition focus-visible:bg-card"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "mf-login-error" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <div
            id="mf-login-error"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-5 text-destructive"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" className="h-11 w-full rounded-xl text-[13.5px] font-semibold shadow-sm" disabled={busy || !usr || !pwd}>
          {busy ? t("auth.submitting") : t("auth.submit")}
          {!busy ? <ArrowRight className="size-4" /> : null}
        </Button>

        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole className="size-3.5 text-primary" /> Cookie phiên bảo mật
          </span>
          <span className="inline-flex items-center gap-1.5 sm:justify-end">
            <ShieldCheck className="size-3.5 text-primary" /> Quyền kiểm tra phía server
          </span>
        </div>
      </div>
    </form>
  );

  if (embedded) return form;

  if (!alumdoor) {
    return (
      <div className="mf-login-page grid min-h-dvh place-items-center bg-background p-4 text-foreground sm:p-8">
        <div className="w-full max-w-[440px]">
          {form}
          <p className="mt-5 text-center text-[11px] leading-5 text-muted-foreground">
            Chỉ đăng nhập trên tên miền chính thức của tổ chức. Không gửi mật khẩu hoặc mã phiên qua chat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-alumdoor-landing className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="border-b bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="mf-brand-mark size-10 rounded-xl text-base shadow-sm">A</div>
            <div>
              <p className="text-base font-bold tracking-[-0.025em]">Alumdoor</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quản trị nhôm kính</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Điều hướng Alumdoor">
            <a className="hover:text-foreground" href="#giai-phap">Giải pháp</a>
            <a className="hover:text-foreground" href="#quy-trinh">Quy trình</a>
            <a className="hover:text-foreground" href="#dang-nhap">Đăng nhập</a>
          </nav>
          <Button
            type="button"
            size="sm"
            onClick={() => document.getElementById("dang-nhap")?.scrollIntoView({ block: "start" })}
          >
            Vào hệ thống <ArrowRight />
          </Button>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_15%,color-mix(in_srgb,var(--primary)_20%,transparent),transparent_30rem),radial-gradient(circle_at_85%_70%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_26rem)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-24">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                <Sparkles className="size-3.5" /> Một hệ thống cho toàn bộ xưởng nhôm kính
              </div>
              <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.05em] text-balance sm:text-5xl lg:text-[3.75rem] lg:leading-[1.04]">
                Điều hành xưởng nhôm kính từ <span className="text-primary">báo giá đến lắp đặt.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Alumdoor kết nối bán hàng, mua hàng, kho, sản xuất, giao lắp và công nợ trong một luồng dữ liệu rõ ràng để đội ngũ biết việc gì đang chờ và vật tư đang ở đâu.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {alumdoorHighlights.map((highlight) => (
                  <div key={highlight} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="leading-5">{highlight}</span>
                  </div>
                ))}
              </div>

              <div className="mt-9 rounded-3xl border bg-card p-4 shadow-[var(--mf-card-shadow)] sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Tổng quan vận hành hôm nay</p>
                    <p className="mt-1 text-xs text-muted-foreground">Dữ liệu minh họa giao diện Alumdoor</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Đang đồng bộ</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric icon={<ClipboardList />} value="18" label="Đơn đang xử lý" />
                  <Metric icon={<Ruler />} value="42" label="Hạng mục cần cắt" />
                  <Metric icon={<PackageCheck />} value="7" label="Vật tư sắp thiếu" />
                  <Metric icon={<Truck />} value="5" label="Lịch giao lắp" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border bg-background/65 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">Tiến độ công trình</span>
                      <span className="text-muted-foreground">72%</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[72%] rounded-full bg-primary" /></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
                      <span className="rounded-lg bg-secondary/70 px-2 py-2">Đã duyệt</span>
                      <span className="rounded-lg bg-secondary/70 px-2 py-2">Đang sản xuất</span>
                      <span className="rounded-lg bg-secondary/70 px-2 py-2">Chờ lắp</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-background/65 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold"><BarChart3 className="size-4 text-primary" /> Tình trạng vật tư</div>
                    <div className="mt-4 space-y-3 text-xs">
                      <StockRow label="Nhôm hệ" value="Đủ cho 6 đơn" />
                      <StockRow label="Kính" value="Chờ nhập 2 lô" />
                      <StockRow label="Phụ kiện" value="Cần bổ sung" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div id="dang-nhap" className="scroll-mt-8 lg:sticky lg:top-8">
              {form}
              <p className="mt-4 text-center text-[11px] leading-5 text-muted-foreground">
                Chỉ đăng nhập tại tên miền chính thức của Alumdoor. Không gửi mật khẩu hoặc mã phiên qua chat.
              </p>
            </div>
          </div>
        </section>

        <section id="giai-phap" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Giải pháp Alumdoor</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Dữ liệu nối liền từ văn phòng đến xưởng</h2>
              <p className="mt-4 leading-7 text-muted-foreground">Không phải thêm một bảng tính khác. Mỗi bộ phận dùng cùng chứng từ, cùng trạng thái và cùng số liệu tồn kho.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {alumdoorFeatures.map(({ icon: Icon, title: featureTitle, detail }, index) => (
                <article key={featureTitle} className="rounded-2xl border bg-card p-5 shadow-[var(--mf-soft-shadow)]">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>
                    <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="font-semibold">{featureTitle}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="quy-trinh" className="scroll-mt-20 border-y bg-card py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Quy trình thống nhất</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Một hồ sơ đi xuyên suốt vòng đời công trình</h2>
                <p className="mt-4 leading-7 text-muted-foreground">Giảm nhập lại, giảm sai lệch và giúp quản lý nhìn thấy điểm nghẽn trước khi nó trở thành cuộc gọi giục tiến độ.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <WorkflowStep number="01" title="Báo giá và chốt đơn" detail="Ghi nhận nhu cầu, quy cách, giá bán và điều kiện thanh toán." />
                <WorkflowStep number="02" title="Chuẩn bị vật tư" detail="Đối chiếu tồn, lập mua hàng và nhận vật tư theo đúng quy cách." />
                <WorkflowStep number="03" title="Sản xuất tại xưởng" detail="Theo dõi công việc cần cắt, gia công và hoàn thiện theo đơn." />
                <WorkflowStep number="04" title="Giao lắp và công nợ" detail="Chốt lịch lắp, nghiệm thu và theo dõi số tiền còn phải thu." />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Alumdoor · Hệ thống quản trị nhôm kính</span>
          <span>Phiên đăng nhập được bảo vệ bằng cookie cùng nguồn và phân quyền phía máy chủ.</span>
        </div>
      </footer>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border bg-background/65 p-3">
      <div className="text-primary [&>svg]:size-4">{icon}</div>
      <p className="mt-3 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{label}</p>
    </div>
  );
}

function StockRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function WorkflowStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <article className="rounded-2xl border bg-background p-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span>
        <Boxes className="size-5 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </article>
  );
}
