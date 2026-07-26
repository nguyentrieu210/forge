import { useState } from "react";
import { Sun, Moon, Monitor, LogOut, User as UserIcon, Globe, Sparkles, Save, Bot } from "lucide-react";
import type { MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { useMetaForge } from "@metaforge/views";
import { useTheme, useLocale, useBrand, BRANDS, type ThemeMode, type Locale } from "@metaforge/shell";
import { cn, Button, Input, Label, Separator, Badge, toast } from "@metaforge/ui";
import { loadAIConfig, saveAIConfig, clearAIConfig, type AIConfigState } from "./ai-config.js";

type AIFormState = AIConfigState;

const THEMES: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: "light", label: "Sáng", icon: <Sun className="size-4" /> },
  { mode: "dark", label: "Tối", icon: <Moon className="size-4" /> },
  { mode: "system", label: "Theo hệ thống", icon: <Monitor className="size-4" /> },
];

export function SettingsContent({ boot }: { boot: MetaForgeBootDTO }) {
  const { adapter } = useMetaForge();
  const [theme, setTheme] = useTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Thiết lập</h2>

      <Section icon={<UserIcon className="size-4" />} title="Tài khoản">
        <Row label="Người dùng"><span className="font-medium">{boot.full_name}</span> <span className="text-muted-foreground">({boot.user})</span></Row>
        <Row label="Vai trò">
          <div className="flex flex-wrap gap-1.5">
            {(boot.roles ?? []).slice(0, 8).map((r) => <Badge key={r} variant="secondary" className="font-normal">{r}</Badge>)}
            {(boot.roles ?? []).length > 8 ? <Badge variant="outline">+{boot.roles.length - 8}</Badge> : null}
          </div>
        </Row>
      </Section>

      <Section icon={<Sun className="size-4" />} title="Giao diện">
        <Row label="Chủ đề">
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <Button key={t.mode} variant={theme === t.mode ? "default" : "outline"} size="sm" onClick={() => setTheme(t.mode)} className={cn("gap-1.5")}>
                {t.icon} {t.label}
              </Button>
            ))}
          </div>
        </Row>
        <Row label="Thương hiệu"><BrandSwitch /></Row>
      </Section>

      <Section icon={<Globe className="size-4" />} title="Vùng & Ngôn ngữ">
        <Row label="Ngôn ngữ"><LocaleSwitch /></Row>
        <Row label="Múi giờ"><span>{boot.sysdefaults?.time_zone ?? "—"}</span></Row>
        <Row label="Định dạng ngày"><span>{boot.sysdefaults?.date_format ?? "—"}</span></Row>
        <Row label="Tiền tệ"><span>{boot.sysdefaults?.currency ?? "—"}</span></Row>
      </Section>

      <AISection />

      <Separator />
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={async () => { try { await adapter.logout(); toast.success("Đã đăng xuất"); location.href = "/"; } catch (e) { toast.error(adapter.mapError(e).message); } }}
      >
        <LogOut /> Đăng xuất
      </Button>
    </div>
  );
}

function AISection() {
  const [form, setForm] = useState<AIFormState>(loadAIConfig);

  function save() {
    const cfg: AIFormState = { baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), model: form.model.trim() };
    saveAIConfig(cfg); // Gate 5: apiKey → sessionStorage, baseUrl/model → localStorage
    setForm(cfg);
    toast.success("Đã lưu cấu hình AI");
  }

  function useDemo() {
    clearAIConfig();
    setForm({ baseUrl: "", apiKey: "", model: "" });
    toast.success("Đã bật chế độ demo (echo)");
  }

  return (
    <Section icon={<Sparkles className="size-4" />} title="AI">
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="ai-base-url">Base URL</Label>
          <Input
            id="ai-base-url"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://api.openai.com/v1"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-api-key">API Key</Label>
          <Input
            id="ai-api-key"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="sk-…"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="gpt-4o-mini"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save}><Save className="size-4" /> Lưu</Button>
          <Button size="sm" variant="outline" onClick={useDemo}><Bot className="size-4" /> Dùng chế độ demo (echo)</Button>
        </div>
        <p className="text-xs text-muted-foreground">Hỗ trợ mọi endpoint OpenAI-compatible. <span className="text-foreground">API Key chỉ lưu trong phiên (sessionStorage)</span> — mất khi đóng tab, không tồn tại qua phiên trình duyệt. Chuẩn production nên proxy qua backend.</p>
      </div>
    </Section>
  );
}

function BrandSwitch() {
  const [brand, setBrand] = useBrand();
  const swatch: Record<string, string> = { zinc: "bg-[#18181b]", blue: "bg-[#1b4dff]", warm: "bg-[#b15b2e]" };
  return (
    <div className="flex flex-wrap gap-2">
      {BRANDS.map((b) => (
        <Button key={b.id} variant={brand === b.id ? "default" : "outline"} size="sm" onClick={() => setBrand(b.id)} className="gap-2">
          <span className={cn("size-3 rounded-full border", swatch[b.id])} />
          {b.label}
        </Button>
      ))}
    </div>
  );
}

function LocaleSwitch() {
  const [locale, setLocale] = useLocale();
  const opts: { v: Locale; label: string }[] = [{ v: "vi", label: "Tiếng Việt" }, { v: "en", label: "English" }];
  return (
    <div className="flex gap-2">
      {opts.map((o) => (
        <Button key={o.v} variant={locale === o.v ? "default" : "outline"} size="sm" onClick={() => setLocale(o.v)}>{o.label}</Button>
      ))}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium [&_svg]:text-muted-foreground">{icon}{title}</div>
      <div className="divide-y">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
