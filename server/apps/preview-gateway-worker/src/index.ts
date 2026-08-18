interface Env {
  ASSETS: Fetcher;
  TENANT: Fetcher;
}

function shouldProxy(pathname: string): boolean {
  return pathname.startsWith("/api/")
    || pathname.startsWith("/files/")
    || pathname.startsWith("/private/")
    || pathname.startsWith("/hooks/");
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
