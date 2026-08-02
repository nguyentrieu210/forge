interface MethodEnvelope<T> {
  message?: T;
}

const RESERVED_ROOTS = new Set([
  "api", "app", "x", "overview", "process", "reports", "master-data", "catalog", "permissions",
  "security", "organization", "companies", "branches", "departments", "workspace", "print", "report",
  "import", "page", "dashboard", "login", "signup", "features", "pricing", "faq", "privacy", "terms",
  "facebook", "shop", "files",
]);

async function boot(): Promise<void> {
  if (!shouldTryWebsite()) {
    await import("./main.tsx");
    return;
  }

  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const slug = path ? decodeURIComponent(path) : "";
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : "";

  try {
    const response = await fetch(`/api/method/forge.website.page${query}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (response.status === 404) {
      await import("./main.tsx");
      return;
    }
    if (!response.ok) {
      renderPublicFailure();
      return;
    }
    const payload = await response.json() as MethodEnvelope<Parameters<(typeof import("./website/WebsiteSite.js"))["mountWebsite"]>[0]>;
    if (!payload.message) {
      renderPublicFailure();
      return;
    }
    const { mountWebsite } = await import("./website/WebsiteSite.js");
    mountWebsite(payload.message);
  } catch {
    renderPublicFailure();
  }
}

function shouldTryWebsite(): boolean {
  const host = window.location.hostname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  // Preserve the dedicated Social Commerce marketing surface and its local visual fixture.
  if (host === "chotdon.kairo.vn" || (["localhost", "127.0.0.1"].includes(host) && params.get("landing") === "1")) return false;

  const trimmed = window.location.pathname.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return true;
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  const root = decodeURIComponent(segments[0]!).toLowerCase();
  if (RESERVED_ROOTS.has(root)) return false;
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(root);
}

function renderPublicFailure(): void {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a">
      <section style="max-width:520px;border:1px solid #e2e8f0;border-radius:16px;background:white;padding:28px;text-align:center">
        <h1 style="font-size:20px;margin:0">Website tạm thời không khả dụng</h1>
        <p style="color:#64748b;line-height:1.6">Không thể tải nội dung public lúc này. Khu vực quản trị Forge vẫn có thể đăng nhập riêng.</p>
        <a href="/login" style="display:inline-block;margin-top:12px;color:#1d4ed8;font-weight:600">Đăng nhập Forge</a>
      </section>
    </main>`;
}

void boot();
