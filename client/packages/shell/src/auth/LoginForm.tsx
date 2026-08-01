import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Factory,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Smartphone,
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
  image: string;
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
    id: "cua-duc",
    eyebrow: "Cửa cuốn Đức khe thoáng",
    title: "Cửa cuốn nan nhôm công nghệ Đức",
    description: "Nhóm nan nhôm khe thoáng đang được Alumdoor giới thiệu với nhiều cấp độ dày, màu sắc và cấu hình sử dụng.",
    href: "https://alumdoor.vn/product-category/cua-cuon-duc-khe-thoang/",
    products: [
      { name: "VIP-ST700", price: "₫3,750,000", href: "https://alumdoor.vn/san-pham/vip-st700/", image: "/alumdoor/vip-st700.jpg" },
      { name: "VIP-ST500", price: "₫3,550,000", href: "https://alumdoor.vn/san-pham/vip-st500/", image: "/alumdoor/vip-st500.jpg" },
      { name: "ALVIP50", price: "₫3,150,000", href: "https://alumdoor.vn/san-pham/alvip50/", image: "/alumdoor/al-vip50.jpg" },
      { name: "AL50", price: "₫2,950,000", href: "https://alumdoor.vn/san-pham/al50/", image: "/alumdoor/al50.jpg" },
    ],
  },
  {
    id: "cua-uc",
    eyebrow: "Cửa cuốn Úc tấm liền",
    title: "Cửa cuốn tấm liền công nghệ Úc",
    description: "Dòng tấm liền vận hành gọn, bề mặt đồng nhất và nhiều lựa chọn màu cho nhà phố, cửa hàng và nhà xưởng.",
    href: "https://alumdoor.vn/product-category/cua-cuon-tam-lien/",
    products: [
      { name: "ALUMROLL-TR", price: "₫1,050,000", href: "https://alumdoor.vn/san-pham/tam-lien-trang/", image: "/alumdoor/alumroll-tr.jpg" },
      { name: "ALUMROLL-XLC", price: "₫1,050,000", href: "https://alumdoor.vn/san-pham/tam-lien-xam-long-chuot/", image: "/alumdoor/alumroll-xlc.jpg" },
    ],
  },
  {
    id: "cua-luoi",
    eyebrow: "Cửa cuốn lưới",
    title: "Cửa cuốn lưới mắt võng và song ngang",
    description: "Các cấu hình lưới, mắt võng và song ngang cho không gian cần thông thoáng và quan sát.",
    href: "https://alumdoor.vn/product-category/cua-cuon-luoi/",
    products: [
      { name: "Song ngang STĐ (13×26)", price: "Liên hệ", href: "https://alumdoor.vn/san-pham/cua-cuon-luoi-song-ngang/", image: "/alumdoor/category-service.png" },
      { name: "Mắt võng STĐ", price: "Liên hệ", href: "https://alumdoor.vn/san-pham/cua-cuon-mat-vong-son-tinh-dien/", image: "/alumdoor/category-service.png" },
    ],
  },
  {
    id: "phu-kien",
    eyebrow: "Phụ kiện cửa cuốn",
    title: "Motor, UPS và phụ kiện an toàn",
    description: "Các thiết bị vận hành, lưu điện và an toàn dành cho bộ cửa cuốn hoàn chỉnh.",
    href: "https://alumdoor.vn/product-category/phu-kien-cua-cuon/",
    products: [
      { name: "Còi báo động", price: "₫550,000", href: "https://alumdoor.vn/san-pham/coi-bao-dong/", image: "/alumdoor/category-accessories.png" },
      { name: "Hệ thống tự dừng", price: "₫1,000,000", href: "https://alumdoor.vn/san-pham/he-thong-tu-dung/", image: "/alumdoor/category-accessories.png" },
      { name: "Alumax UPS E-800i", price: "₫4,500,000", href: "https://alumdoor.vn/san-pham/alumax-ups-e800i/", image: "/alumdoor/category-accessories.png" },
      { name: "Motor Alumax 400KG", price: "₫4,800,000", href: "https://alumdoor.vn/san-pham/motor-alumax-400kg/", image: "/alumdoor/category-accessories.png" },
    ],
  },
];

const ALUMDOOR_CATEGORIES = [
  { title: "Sản phẩm cửa cuốn", href: "#san-pham", image: "/alumdoor/vip-st700.jpg" },
  { title: "Phụ kiện cửa cuốn", href: "#phu-kien", image: "/alumdoor/al-vip50.jpg" },
  { title: "Lắp đặt và sửa chữa", href: "#dich-vu", image: "/alumdoor/alumroll-tr.jpg" },
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
    document.title = alumdoor ? "Alumdoor — Chất lượng từ tâm · Tiên phong sáng tạo" : `${resolvedBrand} — Đăng nhập`;
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

  const warehouseApp = typeof window !== "undefined" && window.location.pathname.startsWith("/mobile/warehouse/");
  const mark = alumdoor && !brandMark
      ? <ForgeBrandLogo size={44} className="mf-brand-mark" />
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
          {warehouseApp ? (
            <img src="/mobile/warehouse/alumdoor-logo.png" alt="Alumdoor" className="h-12 w-auto max-w-full object-contain" />
          ) : (
            <>
              {mark}
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-[-0.035em]">{resolvedBrand}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                  {alumdoor ? "Hệ thống quản trị nội bộ" : "Không gian vận hành doanh nghiệp"}
                </p>
              </div>
            </>
          )}
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
              autoFocus={!embedded && !alumdoor}
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
    <div data-alumdoor-landing className="min-h-dvh overflow-x-hidden bg-[#f7f7f7] text-[#202020]">
      <div className="bg-[#f45b24] text-white">
        <div className="mx-auto flex min-h-9 max-w-[1180px] items-center justify-center gap-4 px-4 text-[10px] font-semibold uppercase tracking-[0.06em] sm:justify-end sm:text-xs">
          <a href="https://alumdoor.vn/cau-hoi-thuong-gap/" target="_blank" rel="noreferrer" className="hidden hover:text-white/75 sm:inline">Câu hỏi thường gặp (FAQs)</a>
          <span className="hidden h-4 w-px bg-white/35 sm:block" />
          <a href="https://alumdoor.vn/" target="_blank" rel="noreferrer" className="hover:text-white/75">Trang chủ</a>
          <span className="h-4 w-px bg-white/35" />
          <a href="https://alumdoor.vn/lien-he/" target="_blank" rel="noreferrer" className="hover:text-white/75">Liên hệ</a>
        </div>
      </div>

      <header className="bg-white">
        <div className="mx-auto flex min-h-28 max-w-[1180px] items-center justify-between gap-6 px-4 py-5 sm:px-6 lg:px-8">
          <a href="#top" className="block min-w-0" aria-label="Alumdoor trang chủ">
            <img src="/alumdoor/logo.png" alt="Alumdoor — Chất lượng từ tâm, tiên phong sáng tạo" className="h-auto w-[230px] max-w-full sm:w-[350px]" />
          </a>
          <div className="hidden text-right lg:block">
            <p className="text-xl font-bold uppercase tracking-[0.02em] text-[#111] xl:text-2xl">Tuyển đại lý toàn quốc / <span className="text-[#f45b24]">Chiết khấu cao</span></p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/45">Chất lượng từ tâm · Tiên phong sáng tạo</p>
          </div>
        </div>

        <div className="sticky top-0 z-40 bg-[#2e2e2e] text-white shadow-lg">
          <div className="mx-auto flex min-h-12 max-w-[1180px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <nav className="flex min-w-0 items-center gap-4 overflow-x-auto py-3 text-[11px] font-bold uppercase tracking-[0.03em] sm:gap-6 sm:text-xs" aria-label="Điều hướng Alumdoor">
              <a className="shrink-0 border-b-2 border-[#f45b24] pb-1" href="#top">Trang chủ</a>
              <a className="shrink-0 hover:text-[#f45b24]" href="#gioi-thieu">Về Alumdoor</a>
              <a className="shrink-0 hover:text-[#f45b24]" href="#san-pham">Sản phẩm cửa cuốn</a>
              <a className="hidden shrink-0 hover:text-[#f45b24] md:block" href="#dich-vu">Dịch vụ</a>
              <a className="hidden shrink-0 hover:text-[#f45b24] lg:block" href="#lien-he">Liên hệ</a>
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              <a href="/mobile/warehouse/" className="hidden rounded-md border border-white/20 px-3 py-2 text-[10px] font-bold uppercase hover:border-[#f45b24] hover:text-[#f45b24] sm:inline-flex">App kho</a>
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 rounded-md bg-[#f45b24] px-3 text-[11px] font-bold uppercase text-white hover:bg-[#d94816]"
                onClick={() => document.getElementById("dang-nhap")?.scrollIntoView({ block: "center", behavior: "smooth" })}
              >
                Đăng nhập
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="alumdoor-hero relative isolate flex min-h-[520px] items-center justify-center overflow-hidden bg-[#242424] bg-[url('/alumdoor/vip-st500.jpg')] bg-cover bg-center text-white sm:min-h-[620px]">
          <video className="absolute inset-0 -z-20 size-full object-cover" autoPlay muted loop playsInline poster="/alumdoor/vip-st500.jpg" aria-hidden="true">
            <source src="https://alumdoor.vn/wp-content/uploads/2021/08/video-banner.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(15,15,15,0.38),rgba(15,15,15,0.68))]" />
          <div className="mx-auto max-w-[1180px] px-4 py-20 text-center sm:px-6 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#ff8a5d] sm:text-sm">Chất lượng từ tâm · Tiên phong sáng tạo</p>
            <h1 className="mt-5 text-5xl font-bold uppercase tracking-[0.01em] text-shadow-lg sm:text-7xl lg:text-[5.6rem]">Cửa cuốn <span className="text-[#f45b24]">Alumdoor</span></h1>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">Giải pháp cửa cuốn, phụ kiện, đo đạc, lắp đặt và bảo hành đồng bộ cho nhà ở, cửa hàng và công trình.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <a href="#san-pham" className="inline-flex h-11 items-center gap-2 rounded-md bg-[#f45b24] px-6 text-sm font-bold uppercase text-white transition hover:bg-[#d94816]">Xem sản phẩm <ArrowRight className="size-4" /></a>
              <a href="#dang-nhap" className="inline-flex h-11 items-center rounded-md border border-white/50 bg-black/15 px-6 text-sm font-bold uppercase text-white backdrop-blur transition hover:bg-white/10">Cổng quản trị</a>
            </div>
          </div>
        </section>

        <section className="-mt-14 relative z-10 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[1180px] overflow-hidden rounded-lg bg-white shadow-2xl md:grid-cols-3">
            {ALUMDOOR_CATEGORIES.map((category) => (
              <a key={category.title} href={category.href} className="group relative isolate min-h-56 overflow-hidden border-b border-white/20 md:border-b-0 md:border-r last:border-0">
                <img src={category.image} alt="" className="absolute inset-0 -z-20 size-full object-cover transition duration-500 group-hover:scale-105" />
                <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
                <span className="flex h-full flex-col justify-end p-6 text-white">
                  <strong className="text-xl font-bold uppercase">{category.title}</strong>
                  <span className="mt-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#ff8a5d]">Xem thêm <ArrowRight className="size-4" /></span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="bg-[#f7f7f7] pb-16 pt-20 sm:pb-20 sm:pt-24">
          <div className="mx-auto grid max-w-[1180px] gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {ALUMDOOR_SERVICES.map(({ icon: Icon, title, summary }) => (
              <article key={title} className="border border-black/10 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto grid size-12 place-items-center rounded-full border-2 border-[#f45b24] text-[#f45b24]"><Icon className="size-5" /></div>
                <h2 className="mt-5 text-sm font-bold uppercase">{title}</h2>
                <p className="mt-2 text-xs leading-5 text-black/55">{summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="gioi-thieu" className="bg-white py-16 sm:py-20">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-4 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f45b24]">Về Alumdoor</p>
              <h2 className="mt-3 text-4xl font-bold uppercase tracking-[-0.03em] sm:text-5xl">Từ tư vấn đến lắp đặt và bảo hành</h2>
              <div className="mt-5 h-1 w-20 bg-[#f45b24]" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoCard icon={<ClipboardList />} title="Tư vấn đặt hàng" text="Tư vấn sản phẩm, giải pháp lắp đặt và mức ngân sách phù hợp với nhu cầu sử dụng." />
              <InfoCard icon={<ScanLine />} title="Đo đạc kích thước" text="Khảo sát thực tế giúp chốt thông số chính xác trước báo giá và thi công." />
              <InfoCard icon={<Truck />} title="Lắp đặt tận nơi" text="Đội ngũ triển khai phục vụ TP.HCM và các khu vực lân cận theo lịch hẹn." />
              <InfoCard icon={<ShieldCheck />} title="Chế độ bảo hành" text="Chính sách bảo hành cho cửa cuốn, phụ kiện và bề mặt sơn theo từng dòng sản phẩm." />
            </div>
          </div>
        </section>

        <section id="san-pham" className="border-y border-black/10 bg-[#f3f3f3] py-16 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f45b24]">Sản phẩm cửa cuốn</p>
                <h2 className="mt-3 text-4xl font-bold uppercase tracking-[-0.03em] sm:text-5xl">Sản phẩm nổi bật</h2>
              </div>
              <a href="https://alumdoor.vn/san-pham-cua-cuon/" target="_blank" rel="noreferrer" className="text-sm font-bold text-[#f45b24] hover:underline">
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

        <section id="dich-vu" className="bg-[#2e2e2e] py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff8a5d]">Dịch vụ khách hàng</p>
                <h2 className="mt-3 text-4xl font-bold uppercase tracking-[-0.03em] sm:text-5xl">Hỗ trợ xuyên suốt vòng đời bộ cửa</h2>
                <p className="mt-5 max-w-xl text-sm leading-7 text-white/65">
                  Alumdoor công bố các nội dung hướng dẫn đặt hàng, đo đạc, sử dụng, vận chuyển, bảo hành và câu hỏi thường gặp trên website chính thức.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {["Quy trình đặt hàng", "Hướng dẫn đo đạc", "Hướng dẫn sử dụng", "Vận chuyển", "Bảo hành", "Câu hỏi thường gặp"].map((item) => (
                  <a key={item} href="https://alumdoor.vn/" target="_blank" rel="noreferrer" className="rounded-md border border-white/10 bg-white/5 p-5 text-sm font-bold transition hover:border-[#f45b24]/60 hover:bg-white/10">
                    {item}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="dang-nhap" className="scroll-mt-16 bg-white py-16 sm:py-20">
          <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.82fr] lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f45b24]">Cổng quản trị Alumdoor</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-bold uppercase tracking-[-0.03em] sm:text-5xl">Quản lý vận hành từ văn phòng đến kho</h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-black/60">Đăng nhập để tiếp tục vào hệ thống nội bộ. Nhân sự kho có thể mở ứng dụng điện thoại cùng tài khoản và quyền đã được cấp.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="/mobile/warehouse/" className="inline-flex h-11 items-center gap-2 rounded-md bg-[#2e2e2e] px-5 text-sm font-bold text-white hover:bg-[#1d1d1d]"><Smartphone className="size-4" /> App kho điện thoại</a>
                <a href="https://alumdoor.vn/" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-md border border-black/15 px-5 text-sm font-bold hover:border-[#f45b24] hover:text-[#f45b24]">Website Alumdoor</a>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end [&_.mf-login-card]:rounded-lg [&_.mf-login-card]:border-black/10 [&_.mf-login-card]:bg-white [&_.mf-login-card]:text-[#202020]">
              {form}
            </div>
          </div>
        </section>

        <section id="lien-he" className="bg-[#f3f3f3] py-16 sm:py-20">
          <div className="mx-auto grid max-w-[1180px] gap-8 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
            <div className="rounded-lg bg-[#f45b24] p-7 text-white sm:p-9">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Liên hệ Alumdoor</p>
              <h2 className="mt-3 text-3xl font-bold uppercase tracking-[-0.03em] sm:text-4xl">Công ty TNHH International Aluminum Application (IAA)</h2>
              <div className="mt-7 grid gap-3 text-sm leading-6 sm:grid-cols-2">
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Mã số thuế</strong>0317172142</div>
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Email</strong>cskh.alumdoor@gmail.com</div>
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Nhà máy 01</strong>12B Đường số 2, P. Bình Hưng Hòa, Q. Bình Tân, TP.HCM</div>
                <div className="rounded-2xl bg-black/10 p-4"><strong className="block">Nhà máy 02</strong>36 Đường số 7, P. Bình Hưng Hòa, Q. Bình Tân, TP.HCM</div>
              </div>
              <a href="https://alumdoor.vn/lien-he/" target="_blank" rel="noreferrer" className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-bold text-[#d94816] transition hover:bg-white/90">
                Mở trang liên hệ <ArrowRight className="size-4" />
              </a>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-7 sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f45b24]">Khu vực hỗ trợ</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {["Miền Nam", "Miền Tây", "Miền Trung", "Miền Bắc"].map((region) => (
                  <div key={region} className="rounded-md border border-black/10 p-4 text-sm font-bold">{region}</div>
                ))}
              </div>
              <div className="mt-7 rounded-md bg-[#f7f7f7] p-5">
                <div className="flex items-start gap-3">
                  <Factory className="mt-0.5 size-5 shrink-0 text-[#f45b24]" />
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

      <footer className="border-t-4 border-[#f45b24] bg-[#2e2e2e] text-white">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-9 text-xs text-white/60 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <img src="/alumdoor/logo.png" alt="Alumdoor" className="h-auto w-48 rounded bg-white px-3 py-2" />
            <p className="mt-4">© Alumdoor · Chất lượng từ tâm · Tiên phong sáng tạo.</p>
          </div>
          <div className="flex flex-wrap gap-5 font-bold uppercase text-white">
            <a href="https://alumdoor.vn/" target="_blank" rel="noreferrer" className="hover:text-[#ff8a5d]">alumdoor.vn</a>
            <a href="https://zalo.me/0965159595" target="_blank" rel="noreferrer" className="hover:text-[#ff8a5d]">Zalo</a>
            <a href="tel:0965159595" className="hover:text-[#ff8a5d]">0965 159 595</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-md border border-black/10 bg-white p-5 shadow-sm">
      <div className="text-[#f45b24] [&_svg]:size-5">{icon}</div>
      <h3 className="mt-4 text-base font-bold uppercase tracking-[-0.01em]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-black/60">{text}</p>
    </article>
  );
}

function ProductGroupSection({ group }: { group: AlumdoorProductGroup }) {
  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#f45b24]">{group.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-bold uppercase tracking-[-0.02em] sm:text-3xl">{group.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">{group.description}</p>
        </div>
        <a href={group.href} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-bold text-[#f45b24] hover:underline">Xem nhóm sản phẩm</a>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {group.products.map((product) => (
          <a
            key={product.name}
            href={product.href}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-md border border-black/10 bg-white transition hover:-translate-y-0.5 hover:border-[#f45b24]/50 hover:shadow-xl"
          >
            <div className="relative aspect-[247/296] overflow-hidden bg-white">
              <img src={product.image} alt={product.name} className="size-full object-cover transition duration-500 group-hover:scale-105" />
              <div className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-[#f45b24] text-white shadow-lg transition group-hover:translate-x-0.5"><ArrowRight className="size-4" /></div>
            </div>
            <div className="border-t border-black/10 p-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">{group.eyebrow}</span>
              <h4 className="mt-1 text-base font-bold uppercase">{product.name}</h4>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-[#f45b24]">{product.price}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-black/40">Chi tiết</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
