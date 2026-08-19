import { resolveBootLane, startWebsiteProbe } from "./boot-route.js";

interface MethodEnvelope<T> {
  message?: T;
}

/**
 * Điểm vào chung của bundle.
 *
 * Được gọi từ thẻ module trong `index.html` bằng import TĨNH, nên module này nằm cùng chunk
 * với entry: trước đây nó là một `import()` động, tức thêm nguyên một chặng mạng chỉ để đọc
 * 2,6 kB rồi mới bắt đầu tải thứ thật sự cần.
 */
export async function boot(): Promise<void> {
  if (resolveBootLane(window.location) === "desk") {
    await import("./main.js");
    return;
  }

  try {
    // Script nội tuyến trong <head> đã bắn lời gọi này từ lúc HTML còn đang đọc; ở đây
    // thường chỉ là nhận lại promise đó.
    const response = await startWebsiteProbe();
    if (response.status === 404) {
      await import("./main.js");
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
