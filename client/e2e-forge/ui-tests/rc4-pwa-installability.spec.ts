import { expect, test } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

async function mockGuestSession(page: import("@playwright/test").Page) {
  const guest = JSON.stringify({
    exc_type: "PermissionError",
    exception: "frappe.exceptions.PermissionError: Guest",
  });
  await page.route("**/api/method/metaforge.api.get_app_manifest**", (route) =>
    route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: null }) }),
  );
  await page.route("**/api/method/metaforge.api.get_boot**", (route) =>
    route.fulfill({ status: 403, headers: JSON_HEADERS, body: guest }),
  );
}

test.describe("RC4-A6 installable PWA source acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page);
  });

  test("runtime exposes a root-scoped standalone manifest in a real browser", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBeTruthy();

    const manifest = await page.evaluate(async (href) => {
      const response = await fetch(href!);
      if (!response.ok) throw new Error(`manifest request failed: ${response.status}`);
      return response.json() as Promise<Record<string, unknown>>;
    }, manifestHref);

    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect((manifest.icons as Array<{ sizes?: string }>).some((icon) => icon.sizes === "192x192")).toBe(true);
    expect((manifest.icons as Array<{ sizes?: string }>).some((icon) => icon.sizes === "512x512")).toBe(true);
  });

  test("installability evidence does not imply an offline service worker", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const registrations = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return [];
      return (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.scope);
    });
    expect(registrations).toEqual([]);
  });
});
