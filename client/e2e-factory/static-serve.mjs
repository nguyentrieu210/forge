/** static-serve — phục vụ file tĩnh từ 1 thư mục dist, chặn path-traversal (dùng chung bởi các
 * serve-proxy* TEST-ONLY script). Tách riêng để không lặp lại logic containment-check ở 2 nơi. */
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

export const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".map": "application/json", ".ico": "image/x-icon",
};

/** rel PHẢI bắt đầu bằng "/". Trả path file thật trong appDist, hoặc index.html (SPA fallback /
 * containment fail — path thoát khỏi appDist bị coi như not-found, KHÔNG đọc ngoài thư mục). */
export async function resolveStaticFile(appDist, rel) {
  const candidate = resolve(appDist, "." + rel);
  if (candidate !== appDist && !candidate.startsWith(appDist + sep)) {
    return join(appDist, "index.html");
  }
  try {
    const s = await stat(candidate);
    if (s.isFile()) return candidate;
  } catch {
    // rơi xuống SPA fallback
  }
  return join(appDist, "index.html");
}

export async function serveStatic(res, appDist, rel) {
  const file = await resolveStaticFile(appDist, rel);
  const data = await readFile(file);
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(data);
}
