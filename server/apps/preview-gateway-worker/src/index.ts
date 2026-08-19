interface Env {
  ASSETS: Fetcher;
  TENANT: Fetcher;
}

const PREVIEW_PASSWORD_SHA256 = "e15791cb18f4d4f74115b62b307dc0b3ef52e5e96e2d38ef7b1ea683dec69394";

function shouldProxy(pathname: string): boolean {
  return pathname.startsWith("/api/")
    || pathname.startsWith("/files/")
    || pathname.startsWith("/private/")
    || pathname.startsWith("/hooks/");
}

async function authorized(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const password = decoded.slice(separator + 1);
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const hex = [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
    return hex === PREVIEW_PASSWORD_SHA256;
  } catch {
    return false;
  }
}

function challenge(): Response {
  return new Response("Alumdoor Preview", {
    status: 401,
    headers: {
      "www-authenticate": "Basic realm=\"Alumdoor Preview\", charset=\"UTF-8\"",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__preview/health") {
      const backend = await env.TENANT.fetch(new Request(new URL("/api/method/metaforge.api.get_boot", request.url), request));
      return Response.json({
        ok: backend.ok || backend.status === 401 || backend.status === 403,
        service: "cloudforge-alumdoor-preview",
        backend_status: backend.status,
      });
    }

    if (!(await authorized(request))) return challenge();

    if (shouldProxy(url.pathname)) return env.TENANT.fetch(request);

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;

    const shellUrl = new URL("/index.html", request.url);
    const shellRequest = new Request(shellUrl, {
      method: "GET",
      headers: request.headers,
    });
    return env.ASSETS.fetch(shellRequest);
  },
};
