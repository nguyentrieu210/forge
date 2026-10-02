/** Conditional browser revalidation for the bounded, published Website surface.
 * Resolve publication and tenant content on EVERY request before comparing validators.
 * Private caching avoids a shared cache confusing trusted tenant routing contexts.
 * This is not an HTML/template cache or Frappe Redis implementation.
 */
export async function websiteReadResponse(
  request: Request,
  tenantId: string,
  resolve: () => Promise<Response>,
): Promise<Response> {
  const response = await resolve();
  if (response.status !== 200 || request.method !== "GET") return response;
  const body = await response.text();
  const url = new URL(request.url);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    JSON.stringify([tenantId, url.pathname, body]),
  ));
  const etag = `"${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}"`;
  const headers = new Headers(response.headers);
  headers.set("etag", etag);
  headers.set("cache-control", "private, no-cache, must-revalidate");
  // GET uses weak comparison, including a list of validators and the wildcard.
  // Our validators have no embedded commas, so tokenizing quoted entity tags is safe.
  const condition = request.headers.get("if-none-match") ?? "";
  const matches = condition.trim() === "*"
    || (condition.match(/(?:W\/)?"[^"\r\n]*"/g) ?? []).some((tag) => tag.replace(/^W\//, "") === etag);
  if (matches) {
    headers.delete("content-type");
    headers.delete("content-length");
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: response.status, headers });
}
