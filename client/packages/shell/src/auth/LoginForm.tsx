import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Factory,
  LockKeyhole,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Warehouse,
} from "lucide-react";
import type { FrappeAdapter } from "@metaforge/adapter-frappe";
import { cn, Button, Input, Label, toast } from "@metaforge/ui";
import { ForgeBrandLogo } from "../BrandLogo.js";
import { useT } from "../i18n/index.js";

export interface LoginFormProps {
  adapter: FrappeAdapter;
  onSuccess: () => void;
  title?: string;
  subtitle?: string;
  brand?: string;
  brandMark?: ReactNode;
  onForgotPassword?: () => void;
  /** Chỉ render thẻ đăng nhập để landing riêng có thể nhúng. */
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
    detail: "Kiểm soát nhôm, kính, phụ kiện, nhập kho và tồn theo quy cách thực tế.",
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
  const resolvedBrand = brand ?? (alumdoor ? "Alumdoor" : "Forge");
  const resolvedTitle = alumdoor ? "Đăng nhập Alumdoor" : title ?? t("auth.title");
  const resolvedSubtitle = alumdoor
    ? "Tiếp tục vào hệ thống quản lý xưởng nhôm kính"
    : subtitle ?? t("auth.subtitle");
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (embedded) return;
    const previous = document.title;
    document.title = alumdoor ? "Alumdoor — Quản trị nhôm kính" : `${resolvedBrand} — Đăng nhập`;
    return () => { document.title = previous; };
  }, [alumdoor, embedded, resolvedBrand]);

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

  const mark = alumdoor && !brandMark
    ? <span className="mf-brand-mark grid size-11 shrink-0 place-items-center text-lg">A</span>
    : <span className="grid size-11 shrink-0 place-items-center overflow-hidden">{brandMark ?? <ForgeBrandLogo size={42} />}</span>;

  const form = (
    <form
      onSubmit={submit}
      className={cn(
        "w-full overflow-hidden rounded-3xl border bg-card shadow-[0_28px_80px_-36px_color-mix(in_srgb,var(--primary)_38%,transparent)]",
        embedded ? "mx-auto max-w-[430px]" : "mf-login-card max-w-[430px]",
      )}
    >
      <div className="space-y-6 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          {mark}
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-[-0.035em]">{resolvedBrand}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
              {alumdoor ? "Quản trị nhôm kính" : "Không gian vận hành doanh nghiệp"}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-primary/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            <ShieldCheck className="size-3" /> Phiên đăng nhập bảo mật
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[1.75rem]">{resolvedTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{resolvedSubtitle}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mf-login-usr" className="text-xs font-semibold">{t("auth.username")}</Label>
            <Input
              id="mf-login-usr"
              value={usr}
              onChange={(event) => setUsr(event.target.value)}
              placeholder={t("auth.username_placeholder")}
              autoComplete="username"
              autoFocus={!embedded}
              className="h-11 rounded-xl bg-background px-3.5"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="mf-login-pwd" className="text-xs font-semibold">{t("auth.password")}</Label>
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
                className="h-11 rounded-xl bg-background px-3.5 pr-11"
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
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={busy || !usr || !pwd}>
          {busy ? t("auth.submitting") : t("auth.submit")}
          {!busy ? <ArrowRight className="size-4" /> : null}
        </Button>

        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
          <span className="inline-flex items-center gap-1.5"><LockKeyhole className="size-3.5 text-primary" /> Cookie cùng nguồn</span>
          <span className="inline-flex items-center gap-1.5 sm:justify-end"><ShieldCheck className="size-3.5 text-primary" /> Phân quyền phía server</span>
        </div>
      </div>
    </form>
  );

  if (embedded) return form;
  if (alumdoor) return <AlumdoorLanding form={form} />;

  const capabilities = [
    [<Warehouse key="workspace" />, "Không gian thống nhất", "Một nguồn dữ liệu cho các phân hệ nghiệp vụ."],
    [<ShieldCheck key="permission" />, "Quyền rõ ràng", "Mỗi vai trò chỉ thấy và làm đúng phần được giao."],
    [<Smartphone key="mobile" />, "Sẵn sàng trên điện thoại", "PWA riêng cho nghiệp vụ cần thao tác nhanh."],
  ];

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="border-b bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <ForgeBrandLogo size={40} wordmark name={resolvedBrand} subtitle="Business operating system" />
          <Button type="button" variant="outline" size="sm" onClick={() => window.location.assign("/mobile/warehouse/")}>
            <Smartphone className="size-4" /> App kho điện thoại
          </Button>
        </div>
      </header>

      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_18%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_30rem),radial-gradient(circle_at_84%_72%,color-mix(in_srgb,#ec4899_14%,transparent),transparent_28rem)]" />
        <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)] lg:gap-14 lg:px-8 lg:py-16">
          <section className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
              <CheckCircle2 className="size-3.5" /> Nền tảng vận hành từ văn phòng đến hiện trường
            </div>
            <h2 className="mt-5 max-w-3xl text-4xl font-bold tracking-[-0.055em] text-balance sm:text-5xl lg:text-[3.65rem] lg:leading-[1.04]">
              Làm việc rõ ràng hơn, <span className="text-primary">không phải mở thêm bảng tính.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Forge gom chứng từ, quy trình, báo cáo và thao tác hiện trường vào một hệ thống có phân quyền, lịch sử và dữ liệu dùng chung.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {capabilities.map(([icon, label, detail]) => (
                <article key={String(label)} className="rounded-2xl border bg-card/85 p-4 shadow-sm backdrop-blur">
                  <div className="text-primary [&_svg]:size-5">{icon}</div>
                  <h3 className="mt-4 text-sm font-semibold">{label}</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> Desktop cho quản trị</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> PWA riêng cho kho</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> Dữ liệu cùng backend</span>
            </div>
          </section>

          <section className="order-1 flex justify-center lg:order-2 lg:justify-end">
            {form}
          </section>
        </div>
      </main>
    </div>
  );
}

function AlumdoorLanding({ form }: { form: ReactNode }) {
  return (
    <div data-alumdoor-landing className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="border-b bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="mf-brand-mark grid size-10 shrink-0 place-items-center text-base">A</div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-[-0.025em]">Alumdoor</p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quản trị nhôm kính</p>
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
            className="shrink-0"
            onClick={() => document.getElementById("dang-nhap")?.scrollIntoView({ block: "start", behavior: "smooth" })}
          >
            Vào hệ thống <ArrowRight className="size-4" />
          </Button>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_15%,color-mix(in_srgb,var(--primary)_20%,transparent),transparent_30rem),radial-gradient(circle_at_85%_70%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_26rem)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-9 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12 lg:px-8 lg:py-20">
            <div className="order-2 lg:order-1">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                <Sparkles className="size-3.5" /> Một hệ thống cho toàn bộ xưởng nhôm kính
              </div>
              <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.05em] text-balance sm:text-5xl lg:text-[3.55rem] lg:leading-[1.04]">
                Điều hành xưởng nhôm kính từ <span className="text-primary">báo giá đến lắp đặt.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Alumdoor kết nối bán hàng, mua hàng, kho, sản xuất, giao lắp và công nợ trong một luồng dữ liệu rõ ràng.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {alumdoorHighlights.map((highlight) => (
                  <div key={highlight} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="leading-5">{highlight}</span>
                  </div>
                ))}
              </div>
            </div>

            <div id="dang-nhap" className="order-1 flex scroll-mt-8 justify-center lg:order-2 lg:justify-end">
              {form}
            </div>
          </div>
        </section>

        <section id="giai-phap" className="scroll-mt-20 py-14 sm:py-18">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Giải pháp Alumdoor</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Dữ liệu nối liền từ văn phòng đến xưởng</h2>
              <p className="mt-4 leading-7 text-muted-foreground">Mỗi bộ phận dùng cùng chứng từ, cùng trạng thái và cùng số liệu tồn kho.</p>
            </div>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {alumdoorFeatures.map(({ icon: Icon, title, detail }, index) => (
                <article key={title} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>
                    <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="quy-trinh" className="scroll-mt-20 border-y bg-card py-14 sm:py-18">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Quy trình thống nhất</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Một hồ sơ đi xuyên suốt vòng đời công trình</h2>
              <p className="mt-4 leading-7 text-muted-foreground">Giảm nhập lại, giảm sai lệch và nhìn thấy điểm nghẽn trước khi trễ tiến độ.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WorkflowStep number="01" title="Báo giá và chốt đơn" />
              <WorkflowStep number="02" title="Chuẩn bị vật tư" />
              <WorkflowStep number="03" title="Sản xuất tại xưởng" />
              <WorkflowStep number="04" title="Giao lắp và công nợ" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Alumdoor · Hệ thống quản trị nhôm kính</span>
          <span>Cookie cùng nguồn và phân quyền phía máy chủ.</span>
        </div>
      </footer>
    </div>
  );
}

function WorkflowStep({ number, title }: { number: string; title: string }) {
  return (
    <article className="rounded-2xl border bg-background p-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span>
        <Boxes className="size-5 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Trạng thái và dữ liệu được nối tiếp sang công đoạn sau.</p>
    </article>
  );
}
