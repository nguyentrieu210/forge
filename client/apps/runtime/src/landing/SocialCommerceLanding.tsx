import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Facebook,
  Inbox,
  LockKeyhole,
  Menu,
  MessageCircleMore,
  PackageCheck,
  Play,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button, buttonVariants, cn } from "@metaforge/ui";

export type PublicSocialPage =
  | "/"
  | "/features"
  | "/pricing"
  | "/faq"
  | "/privacy"
  | "/terms"
  | "/facebook/data-deletion"
  | "/security";

const features = [
  {
    icon: MessageCircleMore,
    title: "Gom bình luận về một nơi",
    detail: "Theo dõi luồng bình luận bán hàng theo Page, trạng thái và người xử lý mà không phải đổi tab liên tục.",
  },
  {
    icon: Zap,
    title: "Từ khóa tự tạo giỏ",
    detail: "Nhận diện mã sản phẩm trong bình luận, gom số lượng theo khách và giữ một giỏ đang mở để tránh tạo trùng.",
  },
  {
    icon: PackageCheck,
    title: "Chốt đơn liền mạch",
    detail: "Chuyển giỏ thành đơn, theo dõi trạng thái xử lý và giữ dữ liệu bán hàng trong đúng không gian của shop.",
  },
  {
    icon: Truck,
    title: "Giao hàng và COD",
    detail: "Tạo vận đơn thủ công trong lát cắt đầu tiên, theo dõi tiền thu hộ và đối soát theo từng lần bàn giao.",
  },
  {
    icon: BarChart3,
    title: "Số liệu vận hành tức thời",
    detail: "Nắm số bình luận mới, giỏ đang mở, đơn đang xử lý và COD chờ đối soát ngay trên một màn hình.",
  },
  {
    icon: ShieldCheck,
    title: "Tách biệt từng khách hàng",
    detail: "Mỗi tenant có cơ sở dữ liệu và khóa mã hóa riêng; kết nối Facebook dùng OAuth chính thức của Meta.",
  },
];

const faqs = [
  ["Tôi có phải đưa access token hoặc App Secret cho nhân viên không?", "Không. Chủ Page thực hiện đăng nhập và cấp quyền qua luồng OAuth chính thức của Meta. App Secret là cấu hình cấp nền tảng, không yêu cầu từng khách hàng nhập thủ công."],
  ["Một tài khoản có thể quản lý nhiều Facebook Page không?", "Có. Sau khi chủ tài khoản cấp quyền, hệ thống cho phép chọn các Page hợp lệ và quản lý chúng trong cùng không gian bán hàng."],
  ["Dữ liệu của các shop có dùng chung với nhau không?", "Không. Forge định tuyến theo tenant và dùng cơ sở dữ liệu vật lý riêng cho từng khách hàng; token kết nối còn được mã hóa bằng khóa riêng của tenant."],
  ["Hiện tại hệ thống đã làm được những gì?", "Lát cắt đang chạy gồm kết nối Facebook theo OAuth, nhận webhook, Inbox sự kiện, rule từ khóa tạo giỏ, chuyển giỏ thành đơn, vận đơn thủ công và đối soát COD."],
  ["Có dùng được trên điện thoại không?", "Có. Landing page và màn vận hành đều được thiết kế responsive, với thao tác chính được ưu tiên cho màn hình nhỏ."],
];

export function SocialCommerceLanding({ page = "/" }: { page?: PublicSocialPage }) {
  useEffect(() => {
    document.documentElement.dataset.brand = "blue";
    document.title = page === "/" ? "Kairo Social Commerce — Chốt đơn đa kênh" : `${pageTitle(page)} — Kairo Social Commerce`;
    setMeta("description", "Nền tảng SaaS quản lý bình luận, giỏ hàng, đơn giao và COD cho đội ngũ bán hàng đa kênh.");
  }, [page]);

  if (page === "/privacy" || page === "/terms" || page === "/facebook/data-deletion" || page === "/security") {
    return <TrustPage page={page} />;
  }

  return <LandingPage initialSection={page} />;
}

function LandingPage({ initialSection }: { initialSection: PublicSocialPage }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (initialSection !== "/") requestAnimationFrame(() => document.querySelector(sectionId(initialSection))?.scrollIntoView());
  }, [initialSection]);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <a className="mf-skip-link" href="#main">Đi đến nội dung chính</a>
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Brand />
          <nav aria-label="Điều hướng chính" className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <NavLink href="#features">Tính năng</NavLink>
            <NavLink href="#workflow">Cách hoạt động</NavLink>
            <NavLink href="#pricing">Bảng giá</NavLink>
            <NavLink href="#faq">Câu hỏi</NavLink>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <ButtonLink href="/login" variant="ghost">Đăng nhập</ButtonLink>
            <ButtonLink href="/login">Bắt đầu dùng thử <ArrowRight /></ButtonLink>
          </div>
          <Button className="md:hidden" variant="ghost" size="icon" aria-label={menuOpen ? "Đóng menu" : "Mở menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
        {menuOpen ? <div className="border-t bg-card px-4 py-4 md:hidden">
          <nav className="grid gap-1 text-sm" aria-label="Điều hướng di động">
            {[['#features', 'Tính năng'], ['#workflow', 'Cách hoạt động'], ['#pricing', 'Bảng giá'], ['#faq', 'Câu hỏi']].map(([href, label]) => <a key={href} className="rounded-lg px-3 py-3 hover:bg-secondary" href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-4"><ButtonLink href="/login" variant="outline">Đăng nhập</ButtonLink><ButtonLink href="/login">Dùng thử</ButtonLink></div>
          </nav>
        </div> : null}
      </header>

      <main id="main">
        <section className="relative isolate border-b bg-card">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_15%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_34rem),linear-gradient(to_bottom,transparent,var(--background))]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-28">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                <Sparkles className="size-3.5" /> Một màn hình cho toàn bộ ca bán hàng
              </div>
              <h1 className="max-w-2xl text-4xl font-bold tracking-[-0.045em] text-balance sm:text-5xl lg:text-[3.65rem] lg:leading-[1.04]">
                Đừng để bình luận bán hàng <span className="text-primary">trôi thành đơn bỏ lỡ.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Kairo Social Commerce gom bình luận, giỏ hàng, đơn giao và COD vào một quy trình rõ ràng để đội ngũ chốt nhanh hơn mà vẫn kiểm soát được dữ liệu.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/login" size="lg" className="h-12 px-6 text-sm">Bắt đầu dùng thử 14 ngày <ArrowRight /></ButtonLink>
                <ButtonLink href="#workflow" size="lg" variant="outline" className="h-12 px-6 text-sm"><Play /> Xem cách hoạt động</ButtonLink>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <TrustChip>Không nhập token thủ công</TrustChip>
                <TrustChip>Không cần thẻ để xem demo</TrustChip>
                <TrustChip>Dùng tốt trên di động</TrustChip>
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="border-b bg-background py-8">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-5 px-4 text-center sm:px-6 md:grid-cols-4 lg:px-8">
            <MiniProof icon={<Inbox />} value="1 Inbox" label="cho mọi Page" />
            <MiniProof icon={<ShoppingCart />} value="1 luồng" label="từ comment đến đơn" />
            <MiniProof icon={<LockKeyhole />} value="Riêng biệt" label="dữ liệu từng tenant" />
            <MiniProof icon={<Facebook />} value="OAuth" label="chính thức từ Meta" />
          </div>
        </section>

        <section id="features" className="scroll-mt-20 bg-background py-20 sm:py-24">
          <SectionIntro eyebrow="Tính năng cốt lõi" title="Mọi thứ đội chốt đơn cần, nối thành một dòng chảy" detail="Không chỉ hiển thị bình luận. Hệ thống biến tín hiệu bán hàng thành giỏ, đơn và số liệu vận hành có thể theo dõi." />
          <div className="mx-auto mt-12 grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
            {features.map(({ icon: Icon, title, detail }, index) => <article key={title} className="group rounded-2xl border bg-card p-6 shadow-[var(--mf-soft-shadow)] transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--mf-card-shadow)]">
              <div className="mb-5 grid size-11 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-5" /></div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">0{index + 1}</p>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
            </article>)}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 border-y bg-card py-20 sm:py-24">
          <SectionIntro eyebrow="Cách hoạt động" title="Từ một bình luận đến một đơn đã đối soát" detail="Bốn bước dễ hiểu, đủ kiểm soát cho quản lý và đủ nhanh cho nhân viên trực live." />
          <div className="mx-auto mt-14 grid max-w-7xl gap-4 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            <WorkflowStep number="01" icon={<Facebook />} title="Kết nối Page" detail="Chủ Page cấp quyền qua OAuth chính thức. Không gửi token dài hạn qua chat hay biểu mẫu." />
            <WorkflowStep number="02" icon={<MessageCircleMore />} title="Nhận bình luận" detail="Webhook đưa sự kiện về đúng tenant, chống nhận trùng và ghi lại để nhân viên xử lý." />
            <WorkflowStep number="03" icon={<ShoppingBag />} title="Gom giỏ, chốt đơn" detail="Rule từ khóa nhận sản phẩm; nhân viên kiểm tra thông tin trước khi chuyển thành đơn." />
            <WorkflowStep number="04" icon={<Truck />} title="Giao và đối soát" detail="Theo dõi vận đơn, tiền COD còn chờ và xác nhận từng khoản đã nhận." />
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 bg-background py-20 sm:py-24">
          <SectionIntro eyebrow="Bắt đầu gọn nhẹ" title="Dùng thử đủ lâu để chạy một ca bán thật" detail="Bảng giá thương mại sẽ chỉ hiển thị khi gói được Platform Admin công bố. Hiện có thể bắt đầu bằng tenant dùng thử 14 ngày." />
          <div className="mx-auto mt-12 max-w-3xl px-4 sm:px-6">
            <article className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 shadow-[var(--mf-overlay-shadow)] sm:p-9">
              <div className="absolute right-0 top-0 rounded-bl-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Khởi động</div>
              <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
                <div><p className="text-sm font-semibold text-primary">TRIAL 14 NGÀY</p><h3 className="mt-2 text-3xl font-bold tracking-tight">Chạy thử trên không gian riêng</h3><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Trải nghiệm luồng quản lý Page, Inbox, giỏ hàng, đơn giao và COD. Sau giai đoạn dùng thử, đội triển khai sẽ tư vấn gói theo số Page, người dùng và sản lượng đơn thực tế.</p></div>
                <ButtonLink href="/login" size="lg" className="h-12">Mở không gian dùng thử <ArrowRight /></ButtonLink>
              </div>
              <div className="mt-8 grid gap-3 border-t pt-6 sm:grid-cols-2">
                {['Kết nối Facebook bằng OAuth', 'Dữ liệu tenant tách biệt', 'Giao diện desktop và mobile', 'Không hiển thị giá khi chưa công bố'].map((item) => <TrustChip key={item}>{item}</TrustChip>)}
              </div>
            </article>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t bg-card py-20 sm:py-24">
          <SectionIntro eyebrow="Câu hỏi thường gặp" title="Rõ trước khi bạn kết nối Page" detail="Những điểm quan trọng về quyền truy cập, dữ liệu và phạm vi phiên bản hiện tại." />
          <div className="mx-auto mt-10 max-w-3xl divide-y rounded-2xl border bg-background px-5 sm:px-7">
            {faqs.map(([question, answer]) => <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold"><span>{question}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" /></summary>
              <p className="max-w-2xl pt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
            </details>)}
          </div>
        </section>

        <section className="bg-primary px-4 py-16 text-primary-foreground sm:px-6 sm:py-20">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-80">Sẵn sàng cho ca bán tiếp theo?</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">Tập trung vào khách hàng, để hệ thống giữ nhịp đơn hàng.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 opacity-80 sm:text-base">Bắt đầu với tenant dùng thử, sau đó kết nối Page bằng tài khoản Facebook của chính bạn.</p>
            <ButtonLink href="/login" size="lg" variant="secondary" className="mt-7 h-12 px-6 text-sm">Đăng nhập và bắt đầu <ArrowRight /></ButtonLink>
          </div>
        </section>
      </main>

      <Footer />
      <div className="fixed inset-x-3 bottom-3 z-40 rounded-xl border bg-card/95 p-2 shadow-[var(--mf-overlay-shadow)] backdrop-blur md:hidden">
        <ButtonLink href="/login" className="h-11 w-full">Bắt đầu dùng thử <ArrowRight /></ButtonLink>
      </div>
    </div>
  );
}

function ProductPreview() {
  return <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
    <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-3xl" />
    <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--mf-overlay-shadow)]">
      <div className="flex h-11 items-center justify-between border-b bg-secondary px-4">
        <div className="flex gap-1.5" aria-hidden="true"><span className="size-2.5 rounded-full bg-destructive/70" /><span className="size-2.5 rounded-full bg-warning/70" /><span className="size-2.5 rounded-full bg-success/70" /></div>
        <span className="text-[11px] font-medium text-muted-foreground">Tổng quan bán hàng</span><span className="w-10" />
      </div>
      <div className="grid min-h-[420px] grid-cols-[3.6rem_1fr] sm:grid-cols-[9.5rem_1fr]">
        <aside className="border-r bg-sidebar p-2 sm:p-3">
          <div className="mb-5 flex items-center gap-2 px-1"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">KS</span><span className="hidden text-xs font-semibold sm:block">Kairo Social</span></div>
          {[['Tổng quan', BarChart3], ['Inbox', Inbox], ['Giỏ hàng', ShoppingCart], ['Đơn hàng', PackageCheck], ['Vận chuyển', Truck]].map(([label, Icon], index) => {
            const PreviewIcon = Icon as typeof BarChart3;
            return <div key={String(label)} className={`mb-1 flex h-9 items-center gap-2 rounded-lg px-2 text-xs ${index === 0 ? 'bg-accent font-semibold text-primary' : 'text-muted-foreground'}`}><PreviewIcon className="size-4 shrink-0" /><span className="hidden sm:block">{String(label)}</span></div>;
          })}
        </aside>
        <div className="min-w-0 bg-background p-3 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-2"><div><p className="text-[10px] font-medium text-muted-foreground">Hôm nay</p><p className="text-sm font-semibold sm:text-base">Chào buổi sáng, Linh</p></div><span className="rounded-full bg-success/10 px-2 py-1 text-[10px] font-medium text-success-text">2 Page online</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Bình luận mới', '128', '+18%'], ['Giỏ đang mở', '36', '+9'], ['Đơn hôm nay', '84', '+12%'], ['COD chờ', '8,4tr', '12 đơn']].map(([label, value, delta]) => <div key={label} className="rounded-xl border bg-card p-2.5 sm:p-3"><p className="truncate text-[9px] text-muted-foreground sm:text-[10px]">{label}</p><p className="mt-2 text-lg font-bold tracking-tight sm:text-xl">{value}</p><p className="mt-1 text-[9px] font-medium text-success-text">{delta}</p></div>)}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border bg-card p-3"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold">Inbox mới nhất</p><span className="text-[9px] text-primary">Xem tất cả</span></div><div className="space-y-2.5">
              <PreviewMessage initials="HN" name="Hà Nguyễn" text="Chốt M02 màu đen nhé shop" time="1 phút" tone="bg-blue-100 text-blue-700" />
              <PreviewMessage initials="LT" name="Linh Trần" text="Mình lấy 2 cái mã A14" time="3 phút" tone="bg-violet-100 text-violet-700" />
              <PreviewMessage initials="PT" name="Phương Thảo" text="Shop còn size L không ạ?" time="5 phút" tone="bg-amber-100 text-amber-700" />
            </div></div>
            <div className="rounded-xl border bg-card p-3"><p className="text-xs font-semibold">Đơn theo trạng thái</p><div className="mt-5 flex h-24 items-end gap-2" aria-label="Biểu đồ minh họa">
              {[45, 72, 58, 88, 64, 78, 52].map((height, index) => <span key={index} className="flex-1 rounded-t bg-primary/20" style={{ height: `${height}%` }}><span className="block h-2 rounded-t bg-primary" /></span>)}
            </div><div className="mt-3 flex justify-between text-[9px] text-muted-foreground"><span>T2</span><span>T4</span><span>T6</span><span>CN</span></div></div>
          </div>
        </div>
      </div>
    </div>
    <div className="absolute -bottom-5 -right-2 hidden items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-[var(--mf-card-shadow)] sm:flex"><span className="grid size-9 place-items-center rounded-full bg-success/10 text-success-text"><Check className="size-4" /></span><div><p className="text-xs font-semibold">Đã tạo đơn #SO-0842</p><p className="text-[10px] text-muted-foreground">Từ bình luận trong 12 giây</p></div></div>
  </div>;
}

function PreviewMessage({ initials, name, text, time, tone }: { initials: string; name: string; text: string; time: string; tone: string }) {
  return <div className="flex min-w-0 items-center gap-2"><span className={`grid size-7 shrink-0 place-items-center rounded-full text-[9px] font-bold ${tone}`}>{initials}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-[10px] font-semibold">{name}</p><span className="shrink-0 text-[8px] text-muted-foreground">{time}</span></div><p className="truncate text-[9px] text-muted-foreground">{text}</p></div></div>;
}

function TrustPage({ page }: { page: Exclude<PublicSocialPage, "/" | "/features" | "/pricing" | "/faq"> }) {
  const content = trustContent(page);
  return <div className="min-h-dvh bg-background text-foreground"><header className="border-b bg-card"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6"><Brand /><ButtonLink href="/" variant="outline">Về trang chủ</ButtonLink></div></header><main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20"><p className="text-sm font-semibold text-primary">TRUST CENTER</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{content.title}</h1><p className="mt-4 text-sm text-muted-foreground">Cập nhật: 27/07/2026</p><div className="mt-10 space-y-8">{content.sections.map((section) => <section key={section.title}><h2 className="text-lg font-semibold">{section.title}</h2><div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">{section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}</div></main><Footer /></div>;
}

function Brand() { return <a href="/" className="flex items-center gap-2.5" aria-label="Kairo Social Commerce — Trang chủ"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><ShoppingBag className="size-4.5" /></span><span><strong className="block text-sm leading-4">Kairo Social</strong><span className="text-[10px] text-muted-foreground">Commerce OS</span></span></a>; }
function ButtonLink({ href, children, variant = "default", size = "default", className }: { href: string; children: ReactNode; variant?: "default" | "outline" | "secondary" | "ghost"; size?: "default" | "lg"; className?: string }) { return <a href={href} className={cn(buttonVariants({ variant, size }), className)}>{children}</a>; }
function NavLink({ href, children }: { href: string; children: ReactNode }) { return <a className="transition-colors hover:text-foreground" href={href}>{children}</a>; }
function TrustChip({ children }: { children: ReactNode }) { return <span className="inline-flex items-center gap-2"><span className="grid size-4 place-items-center rounded-full bg-success/12 text-success-text"><Check className="size-3" /></span>{children}</span>; }
function MiniProof({ icon, value, label }: { icon: ReactNode; value: string; label: string }) { return <div className="flex flex-col items-center"><span className="mb-2 text-primary [&>svg]:size-5">{icon}</span><strong className="text-sm sm:text-base">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>; }
function SectionIntro({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) { return <div className="mx-auto max-w-3xl px-4 text-center sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-balance sm:text-4xl">{title}</h2><p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">{detail}</p></div>; }
function WorkflowStep({ number, icon, title, detail }: { number: string; icon: ReactNode; title: string; detail: string }) { return <article className="relative rounded-2xl border bg-background p-5"><span className="absolute right-4 top-4 text-3xl font-bold text-primary/10">{number}</span><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground [&>svg]:size-4.5">{icon}</span><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></article>; }

function Footer() { return <footer className="border-t bg-card pb-24 pt-10 md:pb-10"><div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8"><div><Brand /><p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">Nền tảng quản lý bán hàng đa kênh được xây trên kiến trúc Forge, ưu tiên tách biệt dữ liệu và tích hợp OAuth chính thức.</p></div><nav className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-muted-foreground sm:grid-cols-4" aria-label="Pháp lý"><a className="hover:text-foreground" href="/privacy">Quyền riêng tư</a><a className="hover:text-foreground" href="/terms">Điều khoản</a><a className="hover:text-foreground" href="/security">Bảo mật</a><a className="hover:text-foreground" href="/facebook/data-deletion">Xóa dữ liệu Facebook</a></nav></div><div className="mx-auto mt-8 max-w-7xl border-t px-4 pt-6 text-xs text-muted-foreground sm:px-6 lg:px-8">© 2026 Kairo Social Commerce. Không phải sản phẩm do Meta bảo trợ.</div></footer>; }

function sectionId(page: PublicSocialPage) { return page === "/features" ? "#features" : page === "/pricing" ? "#pricing" : page === "/faq" ? "#faq" : "#main"; }
function pageTitle(page: PublicSocialPage) { return page === "/features" ? "Tính năng" : page === "/pricing" ? "Bảng giá" : page === "/faq" ? "Câu hỏi thường gặp" : trustContent(page as Exclude<PublicSocialPage, "/" | "/features" | "/pricing" | "/faq">).title; }
function setMeta(name: string, content: string) { let element = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`); if (!element) { element = document.createElement("meta"); element.name = name; document.head.appendChild(element); } element.content = content; }

function trustContent(page: Exclude<PublicSocialPage, "/" | "/features" | "/pricing" | "/faq">) {
  if (page === "/terms") return { title: "Điều khoản sử dụng", sections: [
    { title: "Phạm vi dịch vụ", body: ["Kairo Social Commerce cung cấp công cụ hỗ trợ quản lý tương tác, giỏ hàng, đơn giao và đối soát. Khách hàng chịu trách nhiệm về nội dung bán hàng, quyền quản trị Page và dữ liệu họ nhập vào hệ thống."] },
    { title: "Tài khoản và quyền truy cập", body: ["Chủ tenant quản lý thành viên của mình và phải bảo vệ thông tin đăng nhập. Không chia sẻ tài khoản quản trị hoặc sử dụng dịch vụ để truy cập dữ liệu không thuộc quyền quản lý."] },
    { title: "Tích hợp bên thứ ba", body: ["Kết nối Facebook phụ thuộc vào quyền và chính sách của Meta. Người dùng có thể thu hồi quyền từ Facebook hoặc ngắt kết nối Page trong hệ thống."] },
    { title: "Giai đoạn dùng thử", body: ["Tenant dùng thử có thời hạn 14 ngày theo đặc tả sản phẩm. Giá và điều kiện thương mại chính thức chỉ có hiệu lực khi được công bố hoặc xác nhận trong thỏa thuận triển khai."] },
  ] };
  if (page === "/facebook/data-deletion") return { title: "Yêu cầu xóa dữ liệu Facebook", sections: [
    { title: "Ngắt kết nối", body: ["Chủ Page có thể thu hồi quyền của ứng dụng trong phần cài đặt Facebook. Việc này dừng quyền truy cập mới nhưng không tự động thay thế yêu cầu xóa dữ liệu đã lưu phục vụ đơn hàng."] },
    { title: "Gửi yêu cầu", body: ["Chủ tenant gửi yêu cầu qua kênh hỗ trợ đã được cung cấp khi triển khai, nêu rõ tenant và Page cần xử lý. Đội vận hành xác minh quyền sở hữu trước khi xóa hoặc ẩn danh dữ liệu theo nghĩa vụ lưu giữ áp dụng."] },
    { title: "Dữ liệu được xử lý", body: ["Yêu cầu có thể bao gồm thông tin kết nối Page, sự kiện bình luận và dữ liệu khách phát sinh từ Page. Chứng từ giao dịch phải lưu theo quy định có thể được hạn chế truy cập hoặc ẩn danh thay vì xóa ngay."] },
    { title: "Theo dõi", body: ["Sau khi xác minh, chủ tenant nhận mã theo dõi qua cùng kênh hỗ trợ. Callback tự động và trang tra cứu công khai nằm trong giai đoạn thương mại tiếp theo."] },
  ] };
  if (page === "/security") return { title: "Bảo mật nền tảng", sections: [
    { title: "Tách biệt tenant", body: ["Mỗi khách hàng dùng cơ sở dữ liệu vật lý riêng. Gateway xác định tenant theo hostname và chuyển yêu cầu đến đúng Worker trong Dispatch Namespace."] },
    { title: "Bảo vệ thông tin kết nối", body: ["Page token được mã hóa AES-256-GCM bằng khóa riêng của tenant. App Secret của Meta chỉ thuộc Social Ingress và không được yêu cầu khách hàng nhập vào giao diện."] },
    { title: "Toàn vẹn sự kiện", body: ["Webhook kiểm tra chữ ký trên raw body, ghi sự kiện theo khóa idempotency và xử lý qua hàng đợi có DLQ để hạn chế mất hoặc nhân đôi sự kiện."] },
    { title: "Quyền tối thiểu", body: ["Hệ thống chỉ nên yêu cầu các quyền Meta cần cho chức năng đã bật. Các quyền bổ sung phải qua App Review và có lý do nghiệp vụ rõ ràng."] },
  ] };
  return { title: "Chính sách quyền riêng tư", sections: [
    { title: "Dữ liệu chúng tôi xử lý", body: ["Khi chủ Page kết nối, hệ thống xử lý định danh Page, quyền truy cập được Meta cấp, sự kiện bình luận liên quan và dữ liệu đơn hàng do người dùng tạo. Control Plane không lưu nội dung bình luận, số điện thoại, đơn hàng hoặc credential của tenant."] },
    { title: "Mục đích sử dụng", body: ["Dữ liệu được dùng để đưa tương tác về Inbox, tạo giỏ theo rule, xử lý đơn, giao hàng, đối soát và cung cấp báo cáo vận hành cho chính tenant đó."] },
    { title: "Lưu trữ và chia sẻ", body: ["Dữ liệu nghiệp vụ nằm trong cơ sở dữ liệu riêng của tenant. Chúng tôi không bán dữ liệu khách hàng. Dữ liệu chỉ đi qua nhà cung cấp hạ tầng và tích hợp được bật để vận hành chức năng đã yêu cầu."] },
    { title: "Quyền của chủ dữ liệu", body: ["Chủ tenant có thể yêu cầu xuất, sửa, hạn chế hoặc xóa dữ liệu qua kênh hỗ trợ triển khai. Một số chứng từ có thể phải giữ theo nghĩa vụ pháp lý và sẽ được hạn chế truy cập hoặc ẩn danh khi phù hợp."] },
  ] };
}
