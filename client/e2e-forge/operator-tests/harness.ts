import { expect, test, type Page, type TestInfo } from "@playwright/test";

export const USER = process.env.FORGE_AUTH_USER ?? "";
export const PASSWORD = process.env.FORGE_AUTH_PASSWORD ?? "";
export const MODE = process.env.FORGE_E2E_MODE ?? "local";
export const BACKEND = process.env.FORGE_OPERATOR_BACKEND ?? "http://127.0.0.1:8801";

if (!USER || !PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required for operator E2E");

type HttpAllowance = { status: number; path: RegExp; remaining: number };

type BrowserResponse = {
  status: number;
  ok: boolean;
  body: unknown;
  text: string;
};

export type ReadinessResult = {
  ready: boolean;
  missing: string[];
};

function loopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export function requireLocalMutation(): void {
  const target = new URL(BACKEND);
  if (MODE !== "local" || !loopback(target.hostname)) {
    throw new Error(`PRODUCTION_MUTATION_REFUSED operator E2E writes require local loopback mode; mode=${MODE} host=${target.hostname}`);
  }
}

export function annotate(testInfo: TestInfo, flow: string, persona: string): void {
  testInfo.annotations.push({ type: "flow", description: flow });
  testInfo.annotations.push({ type: "persona", description: persona });
  testInfo.annotations.push({ type: "environment", description: MODE });
}

export async function browserRequest(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown; csrf?: string } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, requestOptions }) => {
    const headers: Record<string, string> = {};
    if (requestOptions.body !== undefined) headers["content-type"] = "application/json";
    if (requestOptions.csrf) headers["x-frappe-csrf-token"] = requestOptions.csrf;
    const response = await fetch(requestPath, {
      method: requestOptions.method ?? "GET",
      credentials: "same-origin",
      headers,
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
    });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, ok: response.ok, body, text };
  }, { requestPath: path, requestOptions: options });
}

export function unwrap(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;
  if ("data" in record) return record.data;
  if ("message" in record) return record.message;
  return body;
}

export class OperatorAudit {
  private authenticated = false;
  private readonly pageErrors: string[] = [];
  private readonly consoleErrors: string[] = [];
  private readonly requestFailures: string[] = [];
  private readonly httpErrors: string[] = [];
  private readonly allowances: HttpAllowance[] = [];

  constructor(private readonly page: Page) {
    page.on("pageerror", (error) => this.pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") this.consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      this.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "failed"}`);
    });
    page.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      const url = new URL(response.url());
      const matched = this.allowances.find((allowance) => allowance.remaining > 0 && allowance.status === status && allowance.path.test(url.pathname + url.search));
      if (matched) {
        matched.remaining -= 1;
        return;
      }
      // Before login, boot/manifest may fail closed as guest. Once authenticated every 4xx/5xx is evidence unless explicitly allowed.
      if (!this.authenticated && status < 500) return;
      this.httpErrors.push(`${status} ${response.request().method()} ${url.pathname}${url.search}`);
    });
  }

  allowHttp(status: number, path: RegExp, count = 1): void {
    this.allowances.push({ status, path, remaining: count });
  }

  markAuthenticated(): void {
    this.authenticated = true;
  }

  async visibleErrors(): Promise<string[]> {
    const texts = await this.page.locator('[role="alert"]:visible, [aria-invalid="true"]:visible').allInnerTexts().catch(() => [] as string[]);
    return texts.map((value) => value.trim()).filter((value) => value && value !== "*");
  }

  async checkpoint(label: string): Promise<void> {
    const visible = await this.visibleErrors();
    expect(visible, `${label}: unexpected visible error state`).toEqual([]);
  }

  async finish(testInfo: TestInfo): Promise<void> {
    const evidence = {
      sourceSha: process.env.FORGE_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "unknown",
      deployedSha: process.env.FORGE_DEPLOYED_SHA ?? null,
      packageVersion: process.env.FORGE_ALUMDOOR_VERSION ?? null,
      environmentClass: MODE === "local" ? "LOCAL" : MODE === "pilot-readonly" ? "PILOT_TARGET_OBSERVED" : "DISPOSABLE_REMOTE",
      mutationClass: MODE === "local" ? "DISPOSABLE_ONLY" : "NONE",
      project: testInfo.project.name,
      title: testInfo.title,
      pageErrors: this.pageErrors,
      consoleErrors: this.consoleErrors,
      requestFailures: this.requestFailures,
      unexpectedHttpErrors: this.httpErrors,
    };
    await testInfo.attach("operator-browser-evidence", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
    expect(this.pageErrors, "uncaught page errors").toEqual([]);
    expect(this.consoleErrors, "console.error entries").toEqual([]);
    expect(this.requestFailures, "failed browser requests").toEqual([]);
    expect(this.httpErrors, "unexpected HTTP 4xx/5xx after authentication").toEqual([]);
  }
}

export async function login(page: Page, audit: OperatorAudit): Promise<{ csrf: string; roles: string[] }> {
  await page.goto("/?alumdoor=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mf-login-usr")).toBeVisible();
  await page.locator("#mf-login-usr").fill(USER);
  await page.locator("#mf-login-pwd").fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: /^Đăng nhập$/ }).click();
  await expect(page.locator("#mf-login-usr")).toBeHidden();
  const boot = await browserRequest(page, "/api/method/metaforge.api.get_boot");
  expect(boot.status, boot.text).toBe(200);
  const message = unwrap(boot.body) as { user?: string; csrf_token?: string; roles?: string[] };
  expect(message.user).toBe(USER);
  expect(message.csrf_token).toBeTruthy();
  audit.markAuthenticated();
  return { csrf: message.csrf_token ?? "", roles: message.roles ?? [] };
}

export async function chooseLink(page: Page, label: string, value: string): Promise<void> {
  const trigger = page.getByRole("button", { name: label, exact: true }).first();
  await expect(trigger, `Link ${label} must be a real canonical control`).toBeVisible();
  await trigger.click();
  const input = page.locator('[cmdk-input=""]').last();
  await expect(input).toBeVisible();
  await input.fill(value);
  const exact = page.locator('[cmdk-item=""]').filter({ hasText: value }).filter({ hasNotText: "Tạo mới" }).first();
  await expect(exact, `${label}: expected option ${value}`).toBeVisible();
  await exact.click();
  await expect(trigger).toContainText(value);
}

async function visibleButton(page: Page, name: string) {
  const matches = page.getByRole("button", { name, exact: true });
  for (let i = 0; i < await matches.count(); i += 1) {
    const candidate = matches.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

export async function openModule(page: Page, moduleLabel: string): Promise<void> {
  const button = await visibleButton(page, moduleLabel);
  if (button) {
    await button.click();
    return;
  }
  const text = page.getByText(moduleLabel, { exact: true }).first();
  await expect(text, `module ${moduleLabel} must be reachable from the shell`).toBeVisible();
  await text.click();
}

export async function openTask(page: Page, moduleLabel: string, taskLabel: string): Promise<void> {
  await openModule(page, moduleLabel);
  const task = await visibleButton(page, taskLabel);
  if (!task) throw new Error(`UI_NAVIGATION task ${taskLabel} not visible in module ${moduleLabel}`);
  await task.click();
}

export async function resourceExists(page: Page, doctype: string, name: string): Promise<boolean> {
  const result = await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return result.status === 200;
}

export async function readiness(page: Page, requirements: Array<[string, string]>): Promise<ReadinessResult> {
  const missing: string[] = [];
  for (const [doctype, name] of requirements) {
    if (!(await resourceExists(page, doctype, name))) missing.push(`${doctype}:${name}`);
  }
  return { ready: missing.length === 0, missing };
}

export function blockIfNotReady(result: ReadinessResult): void {
  test.skip(!result.ready, `BLOCKED_DATA missing ${result.missing.join(", ")}`);
}

export async function readDoc(page: Page, doctype: string, name: string): Promise<Record<string, unknown>> {
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  expect(response.status, response.text).toBe(200);
  return unwrap(response.body) as Record<string, unknown>;
}

export async function bodyTextContainsNoFatal(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/chưa được triển khai|unexpected error|application error|internal server error/i);
}
