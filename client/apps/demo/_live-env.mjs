/**
 * Live-test env loader — KHÔNG hard-code credential. Bắt buộc MF_TOKEN (định dạng "key:secret").
 * Nguồn: `.env.live.local` (gitignored) — `set -a; source .env.live.local; set +a` trước khi chạy.
 * Thiếu env ⇒ ném ngay (fail-closed), không có fallback bí mật.
 */
export function requireLiveEnv() {
  const token = process.env.MF_TOKEN || process.env.VITE_FRAPPE_TOKEN;
  if (!token || !/^[^:\s]+:[^:\s]+$/.test(token)) {
    throw new Error(
      "Missing/invalid MF_TOKEN. Set it as 'key:secret' (e.g. `set -a; source .env.live.local; set +a`). " +
        "No hard-coded credentials are allowed in source.",
    );
  }
  const site = process.env.MF_SITE || "metaforge.localhost";
  const backend = process.env.MF_BACKEND || "http://127.0.0.1:8000";
  const base = `${backend.replace(/\/$/, "")}/api/method`;
  const headers = {
    Authorization: `token ${token}`,
    "X-Frappe-Site-Name": site,
    "Content-Type": "application/json",
  };
  return { token, site, backend, base, headers };
}
