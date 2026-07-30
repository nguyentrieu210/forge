import { Buffer } from "node:buffer";
import { launch } from "@cloudflare/playwright";

type Env = {
  BROWSER: unknown;
  QA_TOKEN: string;
};

type RunRequest = {
  url: string;
  paths?: string[];
};

type Viewport = {
  name: string;
  width: number;
  height: number;
  isMobile?: boolean;
};

const VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function safeTarget(base: string, path: string): string {
  const url = new URL(path, base);
  if (url.protocol !== "https:") {
    throw new Error("Preview URL must use HTTPS");
  }
  return url.toString();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "cloudforge-preview-qa" });
    }

    if (url.pathname !== "/run" || request.method !== "POST") {
      return json({ error: "POST /run required" }, 404);
    }

    const expected = `Bearer ${env.QA_TOKEN}`;
    if (!env.QA_TOKEN || request.headers.get("authorization") !== expected) {
      return json({ error: "unauthorized" }, 401);
    }

    let input: RunRequest;
    try {
      input = (await request.json()) as RunRequest;
      new URL(input.url);
    } catch {
      return json({ error: "body must contain a valid url" }, 400);
    }

    const paths = input.paths?.length ? input.paths : ["/"];
    const startedAt = new Date().toISOString();
    const browser = await launch(env.BROWSER as never);
    const results: Array<Record<string, unknown>> = [];

    try {
      for (const viewport of VIEWPORTS) {
        for (const path of paths) {
          const consoleErrors: string[] = [];
          const pageErrors: string[] = [];
          const requestFailures: string[] = [];
          const target = safeTarget(input.url, path);
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            isMobile: viewport.isMobile ?? false,
          });
          const page = await context.newPage();

          page.on("console", (message: any) => {
            if (message.type() === "error") consoleErrors.push(message.text());
          });
          page.on("pageerror", (error: any) => pageErrors.push(String(error)));
          page.on("requestfailed", (failed: any) => {
            requestFailures.push(`${failed.method()} ${failed.url()} :: ${failed.failure()?.errorText ?? "failed"}`);
          });

          let status = 0;
          let title = "";
          let failure: string | null = null;
          let screenshotBase64 = "";

          try {
            const response = await page.goto(target, {
              waitUntil: "domcontentloaded",
              timeout: 60_000,
            });
            status = response?.status() ?? 0;
            await page.waitForTimeout(1_500);
            title = await page.title();
            const screenshot = await page.screenshot({ fullPage: true, type: "png" });
            screenshotBase64 = Buffer.from(screenshot).toString("base64");
          } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
            try {
              const screenshot = await page.screenshot({ fullPage: true, type: "png" });
              screenshotBase64 = Buffer.from(screenshot).toString("base64");
            } catch {
              // Keep the original browser failure as the useful error.
            }
          } finally {
            await context.close();
          }

          const passed =
            !failure &&
            status >= 200 &&
            status < 400 &&
            pageErrors.length === 0 &&
            consoleErrors.length === 0;

          results.push({
            name: `${viewport.name}-${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}`,
            viewport,
            target,
            passed,
            httpStatus: status,
            title,
            failure,
            consoleErrors,
            pageErrors,
            requestFailures,
            screenshotBase64,
          });
        }
      }
    } finally {
      await browser.close();
    }

    const passed = results.every((result) => result.passed === true);
    return json({
      passed,
      startedAt,
      finishedAt: new Date().toISOString(),
      previewUrl: input.url,
      results,
    });
  },
};
