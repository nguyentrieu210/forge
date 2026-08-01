import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
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

type AlumdoorProduct = {
  name: string;
  price: string;
  href: string;
};

type AlumdoorProductGroup = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  products: AlumdoorProduct[];
};

const ALUMDOOR_PRODUCTS: AlumdoorProductGroup[] = [
  {
    id: "cua-uc",
    eyebrow: "Cửa cuốn Úc",
    title: "Cửa cuốn tấm liền công nghệ Úc",
    description: "Dòng tấm liền cho nhu cầu vận hành gọn, nhiều lựa chọn độ dày và màu bề mặt.",
    href: "https://alumdoor.vn/product-category/cua-cuon-uc/",
    products: [
      { name: "Alumroll 4.6D", price: "₫950,000", href: "https://alumdoor.vn/san-pham/cua-tam-lien-cong-nghe-uc/" },
      { name: "Alumroll 4.8D", price: "₫1,000,000", href: "https://alumdoor.vn/san-pham/cua-tam-lien-cong-nghe-uc-3/" },
      { name: "Alumroll 5.0D", price: "₫1,150,000", href: "https://alumdoor.vn/product-category/cua-cuon-uc/" },
      { name: "Alumroll 5.2D", price: "₫1,210,000", href: "https://alumdoor.vn/san-pham/cua-tam-lien-cong-nghe-uc-4/" },
      { name: "Alumax Sơn Tĩnh Điện", price: "₫1,380,000", href: "https://alumdoor.vn/san-pham/cua-tam-lien-alumaxstd/" },
    ],
  },
  {
    id: "cua-duc",
    eyebrow: "Cửa cuốn Đức",
    title: "Cửa cuốn nan nhôm công nghệ Đức",
    description: "Nhóm nan nhôm khe thoáng với nhiều cấp độ dày, kích thước và cấu hình sử dụng.",
    href: "https://alumdoor.vn/product-category/cua-cuon-duc/",
    products: [
      { name: "AL-70", price: "₫1,520,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al70/" },
      { name: "AL-71", price: "₫1,600,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al71/" },
      { name: "AL-503", price: "₫1,950,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al503/" },
      { name: "AL-548", price: "₫2,080,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al548/" },
      { name: "AL-652", price: "₫2,250,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al652/" },
      { name: "AL-752", price: "₫2,620,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al752/" },
      { name: "AL-48", price: "₫2,570,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al48/" },
      { name: "AL-50", price: "₫2,750,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-al50/" },
      { name: "AL-VIP50", price: "₫2,890,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-alvip50/" },
      { name: "VIP-ST500", price: "₫3,350,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-vipst500/" },
      { name: "VIP-ST700", price: "₫3,550,000", href: "https://alumdoor.vn/san-pham/cua-cuon-duc-vipst700/" },
    ],
  },
  {
    id: "cua-luoi",
    eyebrow: "Cửa cuốn lưới",
    title: "Cửa cuốn lưới mắt võng và song ngang",
    description: "Các cấu hình lưới, mắt võng và song ngang cho không gian cần thông thoáng và quan sát.",
    href: "https://alumdoor.vn/product-category/cua-cuon-luoi/",
    products: [
      { name: "Song ngang STĐ (13×26)", price: "Liên hệ", href: "https://alumdoor.vn/san-pham/cua-cuon-luoi-song-ngang/" },
      { name: "Song ngang Inox (13×26)", price: "Liên hệ", href: "https://alumdoor.vn/product-category/cua-cuon-luoi/" },
      { name: "Mắt võng STĐ", price: "Liên hệ", href: "https://alumdoor.vn/san-pham/cua-cuon-mat-vong-son-tinh-dien/" },
      { name: "Mắt võng Inox", price: "Liên hệ", href: "https://alumdoor.vn/san-pham/cua-cuon-mat-vong-inox/" },
      { name: "Song ngang STĐ Phi 19", price: "Liên hệ", href: "https://alumdoor.vn/product-category/cua-cuon-luoi/" },
      { name: "Song ngang Inox Phi 19", price: "Liên hệ", href: "https://alumdoor.vn/product-category/cua-cuon-luoi/" },
    ],
  },
  {
    id: "phu-kien",
    eyebrow: "Phụ kiện cửa cuốn",
    title: "Motor, UPS và phụ kiện an toàn",
    description: "Các thiết bị vận hành, lưu điện và an toàn dành cho bộ cửa cuốn hoàn chỉnh.",
    href: "https://alumdoor.vn/san-pham-cua-cuon/phu-kien-cua-cuon/",
    products: [
      { name: "Còi báo động", price: "₫550,000", href: "https://alumdoor.vn/san-pham-cua-cuon/phu-kien-cua-cuon/" },
      { name: "Hệ thống tự dừng", price: "₫1,000,000", href: "https://alumdoor.vn/san-pham-cua-cuon/phu-kien-cua-cuon/" },
      { name: "Alumax UPS E-800i", price: "₫4,500,000", href: "https://alumdoor.vn/san-pham/alumax-ups-e800i/" },
      { name: "Alumax UPS E-1000i", price: "₫6,500,000", href: "https://alumdoor.vn/san-pham-cua-cuon/phu-kien-cua-cuon/" },
      { name: "Motor Alumax 400KG", price: "₫4,800,000", href: "https://alumdoor.vn/san-pham/motor-alumax-400kg/" },
      { name: "Motor Alumax 600KG", price: "₫5,600,000", href: "https://alumdoor.vn/san-pham-cua-cuon/phu-kien-cua-cuon/" },
    ],
  },
];

const ALUMDOOR_SERVICES = [
  {
    icon: ClipboardList,
    title: "Miễn phí tư vấn",
    summary: "Tư vấn cấu hình và ngân sách phù hợp trước khi chốt phương án.",
  },
  {
    icon: ScanLine,
    title: "Đo đạc kích thước",
    summary: "Khảo sát và chốt thông số để báo giá, sản xuất và lắp đặt chính xác hơn.",
  },
  {
    icon: Truck,
    title: "Lắp đặt tận nơi",
    summary: "Tổ chức vận chuyển, lắp đặt và sửa chữa tại TP.HCM cùng khu vực lân cận.",
  },
  {
    icon: ShieldCheck,
    title: "Chế độ bảo hành",
    summary: "Sản phẩm và phụ kiện bảo hành 12 tháng; bề mặt sơn có chính sách dài hơn tùy dòng.",
  },
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
    ? "Tiếp tục vào hệ thống quản lý xưởng và vận hành nội bộ"
    : subtitle ?? t("auth.subtitle");
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (embedded) return;
    const previous = document.title;
    document.title = alumdoor ? "Alumdoor — Nâng tầm cửa Việt" : `${resolvedBrand} — Đăng nhập`;
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
              {alumdoor ? "Hệ thống quản trị nội bộ" : "Không gian vận hành doanh nghiệp"}
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
    <div data-alumdoor-landing className="min-h-dvh overflow-x-hidden bg-[#f7f6f2] text-[#232323]">
      <div className="bg-[#2f302f] px-4 py-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white sm:text-xs">
        Tuyển đại lý toàn quốc · chính sách chiết khấu theo chương trình
      </div>

      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#f7f6f2]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex min-w-0 items-center gap-3" aria-label="Alumdoor trang chủ">
            <span className="mf-brand-mark grid size-10 shrink-0 place-items-center text-base">A</span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black uppercase tracking-[-0.035em]">Alumdoor</span>
              <span className="block truncate text-[9px] font-bold uppercase tracking-[0.2em] text-[#ef6b2e]">Nâng tầm cửa Việt</span>
            </span>
          </a>

          <nav className="hidden items-center gap-5 text-xs font-bold uppercase tracking-[0.08em] lg:flex" aria-label="Điều hướng Alumdoor">
            <a className="hover:text-[#ef6b2e]" href="#gioi-thieu">Về Alumdoor</a>
            <a className="hover:text-[#ef6b2e]" href="#san-pham">Sản phẩm cửa cuốn</a>
            <a className="hover:text-[#ef6b2e]" href="#dich-vu">Dịch vụ</a>
            <a className="hover:text-[#ef6b2e]" href="#lien-he">Liên hệ</a>
          </nav>

          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-[#ef6b2e] text-white hover:bg-[#d95920]"
            onClick={() => document.getElementById("dang-nhap")?.scrollIntoView({ block: "center", behavior: "smooth" })}
          >
            Đăng nhập <ArrowRight className="size-4" />
          </Button>
        </div>
      </header>

      <main id="top">
        <section className="relative isolate overflow-hidden border-b border-black/10 bg-[#333433] text-white">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_20%,rgba(239,107,46,0.35),transparent_28rem),linear-gradient(120deg,transparent_0_55%,rgba(255,255,255,0.04)_55%_100%)]" />
          <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-20">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#ff9a69]">
                <Sparkles className="size-3.5" /> Cửa cuốn Alumdoor
              </div>
              <h1 className="mt-5 max-w-4xl text-5xl font-black uppercase tracking-[-0.06em] text-balance sm:text-6xl lg:text-[5.1rem] lg:leading-[0.92]">
                Nâng tầm <span className="text-[#ef6b2e]">cửa Việt</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/72 sm:text-lg sm:leading-8">
                Cửa cuốn, phụ kiện, tư vấn, đo đạc, lắp đặt và bảo hành trong một hệ sinh thái dịch vụ thống nhất của Alumdoor.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#san-pham" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#ef6b2e] px-5 text-sm font-bold text-white transition hover:bg-[#d95920]">
                  Xem sản phẩm <ArrowRight className="size-4" />
                </a>
                <a href="https://alumdoor.vn/lien-he/" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-bold text-white transition hover:bg-white/10">
                  Liên hệ tư vấn
                </a>
              </div>
            </div>

            <div id="dang-nhap" className="order-1 flex scroll-mt-24 justify-center lg:order-2 lg:justify-end [&_.mf-login-card]:border-white/10 [&_.mf-login-card]:bg-white [&_.mf-login-card]:text-[#232323]">
              {form}
            </div>
          </div>
        </section>

        <section className="border-b border-black/10 bg-white">
          <div className="mx-auto grid max-w-[1440px] gap-px bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
            {ALUMDOOR_SERVICES.map(({ icon: Icon, title, summary }) => (
              <article key={title} className="bg-white p-6 sm:p-7">
                <div className="grid size-11 place-items-center rounded-xl bg-[#fff1e9] text-[#ef6b2e]"><Icon className="size-5" /></div>
                <h2 className="mt-5 text-base font-black uppercase tracking-[-0.02em]">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-black/60">{summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="gioi-thieu" className="py-14 sm:py-20">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ef6b2e]">Về Alumdoor</p>
              <h2 className="mt-3 text-4xl font-black uppercase tracking-[-0.05em] sm:text-5xl">Từ tư vấn đến lắp đặt và bảo hành</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoCard icon={<ClipboardList />} title="Tư vấn đặt hàng" text="Tư vấn sản phẩm, giải pháp lắp đặt và mức ngân sách phù hợp với nhu cầu sử dụng." />
              <InfoCard icon={<ScanLine />} title="Đo đạc kích thước" text="Khảo sát thực tế giúp chốt thông số chính xác trước báo giá và thi công." />
              <InfoCard icon={<Truck />} title="Lắp đặt tận nơi" text="Đội ngũ triển khai phục vụ TP.HCM và các khu vực lân cận theo lịch hẹn." />
              <InfoCard icon={<ShieldCheck />} title="Chế độ bảo hành" text="Chính sách bảo hành cho cửa cuốn, phụ kiện và bề mặt sơn theo từng dòng sản phẩm." />
            </div>
          </div>
        </section>

        <section id="san-pham" className="border-y border-black/10 bg-white py-14 sm:py-20">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ef6b2e]">Sản phẩm cửa cuốn</p>
                <h2 className="mt-3 text-4xl font-black uppercase tracking-[-0.05em] sm:text-5xl">Danh mục đang niêm yết</h2>
              </div>
              <a href="https://alumdoor.vn/san-pham-cua-cuon/" target="_blank" rel="noreferrer" className="text-sm font-bold text-[#ef6b2e] hover:underline">
                Xem toàn bộ trên alumdoor.vn
              </a>
            </div>

            <div className="mt-10 space-y-12">
              {ALUMDOOR_PRODUCTS.map((group) => (
                <ProductGroupSection key={group.id} group={group} />
              ))}
            </div>
          </div>
        </section>

        <section id="dich-vu" className="bg-[#333433] py-14 text-white sm:py-20">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff9a69]">Dịch vụ khách hàng</p>
                <h2 className="mt-3 text-4xl font-black uppercase tracking-[-0.05em] sm:text-5xl">Hỗ trợ xuyên suốt vòng đời bộ cửa</h2>
                <p className="mt-5 max-w-xl text-sm leading-7 text-white/65">
                  Alumdoor công bố các nội dung hướng dẫn đặt hàng, đo đạc, sử dụng, vận chuyển, bảo hành và câu hỏi thường gặp trên website chính thức.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {["Quy trình đặt hàng", "Hướng dẫn đo đạc", "Hướng dẫn sử dụng", "Vận chuyển", "Bảo hành", "Câu hỏi thường gặp"].map((item) => (
                  <a key={item} href="https://alumdoor.vn/" target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm font-bold transition hover:border-[#ef6b2e]/60 hover:bg-white/10">
                    {item}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="lien-he" className="py-14 sm:py-20">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
            <div className="rounded-3xl bg-[#ef6b2e] p-7 text-white sm:p-9">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Liên hệ Alumdoor</p>
              <h2 className="mt-3 text-3xl font-black uppercase tracking-[-0.04em] sm:text-4xl">Công ty TNHH International Aluminum Application (IAA)</h2>
              <div className="mt-7 grid gap-3 text-sm leading-6 sm:grid-cols-2">
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Mã số thuế</strong>0317172142</div>
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Email</strong>cskh.alumdoor@gmail.com</div>
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Nhà máy 01</strong>12B Đường số 2, P. Bình Hưng Hòa, Q. Bình Tân, TP.HCM</div>
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Nhà máy 02</strong>36 Đường số 7, P. Bình Hưng Hòa, Q. Bình Tân, TP.HCM</div>
              </div>
              <a href="https://alumdoor.vn/lien-he/" target="_blank" rel="noreferrer" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-[#d95920] transition hover:bg-white/90">
                Mở trang liên hệ <ArrowRight className="size-4" />
              </a>
            </div>

            <div className="rounded-3xl border border-black/10 bg-white p-7 sm:p-9">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ef6b2e]">Khu vực hỗ trợ</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {["Miền Nam", "Miền Tây", "Miền Trung", "Miền Bắc"].map((region) => (
                  <div key={region} className="rounded-2xl border border-black/10 p-4 text-sm font-bold">{region}</div>
                ))}
              </div>
              <div className="mt-7 rounded-2xl bg-[#f7f6f2] p-5">
                <div className="flex items-start gap-3">
                  <Factory className="mt-0.5 size-5 shrink-0 text-[#ef6b2e]" />
                  <div>
                    <p className="font-black uppercase">Giờ hoạt động</p>
                    <p className="mt-1 text-sm leading-6 text-black/60">Thứ 2 – Thứ 7: 08:00 – 17:00. Chủ nhật nghỉ.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-8 text-xs text-black/55 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="font-black uppercase text-[#232323]">Alumdoor · Nâng tầm cửa Việt</p>
            <p className="mt-1">Landing hệ thống nội bộ dùng thông tin sản phẩm và liên kết tham chiếu từ website Alumdoor.</p>
          </div>
          <a href="https://alumdoor.vn/" target="_blank" rel="noreferrer" className="font-bold text-[#ef6b2e] hover:underline">alumdoor.vn</a>
        </div>
      </footer>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="text-[#ef6b2e] [&_svg]:size-5">{icon}</div>
      <h3 className="mt-4 text-base font-black uppercase tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-black/60">{text}</p>
    </article>
  );
}

function ProductGroupSection({ group }: { group: AlumdoorProductGroup }) {
  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ef6b2e]">{group.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.035em] sm:text-3xl">{group.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">{group.description}</p>
        </div>
        <a href={group.href} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-bold text-[#ef6b2e] hover:underline">Xem nhóm sản phẩm</a>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {group.products.map((product) => (
          <a
            key={product.name}
            href={product.href}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-2xl border border-black/10 bg-[#f7f6f2] transition hover:-translate-y-0.5 hover:border-[#ef6b2e]/50 hover:shadow-lg"
          >
            <div className="relative h-32 overflow-hidden bg-[#333433] p-5 text-white">
              <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_12px,rgba(255,255,255,0.08)_12px_13px)]" />
              <div className="relative flex h-full items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">{group.eyebrow}</p>
                  <p className="mt-1 text-xl font-black tracking-[-0.04em]">{product.name}</p>
                </div>
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#ef6b2e] text-white transition group-hover:translate-x-0.5"><ArrowRight className="size-4" /></div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <span className="text-sm font-black text-[#ef6b2e]">{product.price}</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-black/45">Chi tiết sản phẩm</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
