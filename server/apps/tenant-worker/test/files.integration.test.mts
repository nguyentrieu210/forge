/**
 * Uploading a product photograph, and getting it back.
 *
 * The Desk has called `upload_file` since the attach control was written; nothing
 * answered it. These tests run the whole chain on real workerd — multipart in, R2 out,
 * a `file_url` a browser can put in `src`, and the URL served back — because every part
 * of it existed separately before and the gap was exactly where they met.
 *
 * Uploads go through a REAL cookie session, because that is the only way the Desk can
 * reach them: an upload that only works for a bearer token would pass here and fail for
 * every actual user.
 */
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../../packages/frappe-api/src/index.js";

const NOW = "2026-07-27T00:00:00.000Z";
const PASSWORD = "phan-bon-mat-khau-rat-dai";
const USER = "kho@phanbon.test";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

let sid = "";
let csrf = "";

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT INTO roles(tenant_id,role,modified_at) VALUES('demo','System Manager',?1)
     ON CONFLICT(tenant_id,role) DO NOTHING`,
  ).bind(NOW).run();
  await env.DB.prepare(
    `INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,language,time_zone,created_at,modified_at)
     VALUES('demo',?1,'Thu kho',?1,?2,'vi','Asia/Ho_Chi_Minh',?3,?3)
     ON CONFLICT(tenant_id,user_id) DO UPDATE SET password_hash=excluded.password_hash`,
  ).bind(USER, await hashPassword(PASSWORD, 1_000), NOW).run();
  await env.DB.prepare(
    `INSERT INTO user_roles(tenant_id,user_id,role) VALUES('demo',?1,'System Manager') ON CONFLICT DO NOTHING`,
  ).bind(USER).run();

  const response = await exports.default.fetch(new Request("https://tenant.test/api/method/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usr: USER, pwd: PASSWORD }),
  }));
  const cookie = response.headers.get("set-cookie") ?? "";
  sid = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1).split(";")[0]!);
  csrf = response.headers.get("x-frappe-csrf-token") ?? "";
});

function upload(
  parts: Record<string, string>,
  file?: { name: string; type: string; bytes?: Uint8Array },
  options: { auth?: boolean } = {},
): Promise<Response> {
  const form = new FormData();
  for (const [key, value] of Object.entries(parts)) form.append(key, value);
  if (file) {
    form.append("file", new File([(file.bytes ?? PNG) as unknown as BlobPart], file.name, { type: file.type }));
  }
  const headers = new Headers();
  if (options.auth !== false) {
    headers.set("cookie", `sid=${sid}`);
    headers.set("x-frappe-csrf-token", csrf);
  }
  return exports.default.fetch(new Request("https://tenant.test/api/method/upload_file", { method: "POST", headers, body: form }));
}

async function uploadedUrl(isPrivate: "0" | "1" = "0", name = "phan-npk.png"): Promise<string> {
  const response = await upload({ is_private: isPrivate }, { name, type: "image/png" });
  expect(response.status).toBe(200);
  const body = await response.json() as { message: { file_url: string } };
  return body.message.file_url;
}

describe("upload_file", () => {
  it("stores a photograph and returns a URL a browser can use", async () => {
    const response = await upload({ is_private: "0" }, { name: "phan-npk-16-16-8.png", type: "image/png" });
    expect(response.status).toBe(200);

    const body = await response.json() as { message: { file_url: string; file_name: string; is_private: number; file_size: number } };
    expect(body.message.file_url).toMatch(/^\/files\/file[-_A-Za-z0-9]+\//);
    expect(body.message.is_private).toBe(0);
    expect(body.message.file_size).toBe(PNG.byteLength);
  });

  it("refuses SVG — an image everywhere else, and a script here", async () => {
    const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
    const response = await upload({ is_private: "0" }, { name: "logo.svg", type: "image/svg+xml", bytes: svg });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses an upload with no file part rather than storing an empty row", async () => {
    const response = await upload({ is_private: "0" });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses a body that is not multipart", async () => {
    const response = await exports.default.fetch(new Request("https://tenant.test/api/method/upload_file", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sid=${sid}`, "x-frappe-csrf-token": csrf },
      body: JSON.stringify({ file: "not-a-file" }),
    }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses an upload from a visitor with no session", async () => {
    const response = await upload({ is_private: "0" }, { name: "ke-gian.png", type: "image/png" }, { auth: false });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("serving a file", () => {
  it("serves a public file to a visitor with NO session, cached immutably", async () => {
    const url = await uploadedUrl("0");
    // No cookie: this is the storefront's browser, and the whole point of a public file.
    const response = await exports.default.fetch(new Request(`https://tenant.test${url}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it("hides a private file from a visitor with no session", async () => {
    const url = await uploadedUrl("1", "hop-dong.png");
    const response = await exports.default.fetch(new Request(`https://tenant.test${url}`));
    // 404, not 403: "a file you may not see" is itself information.
    expect(response.status).toBe(404);
  });

  it("serves a private file to its owner, and never lets it into a shared cache", async () => {
    const url = await uploadedUrl("1", "bang-gia-dai-ly.png");
    const response = await exports.default.fetch(new Request(`https://tenant.test${url}`, {
      headers: { cookie: `sid=${sid}` },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers 404 for a file id that does not exist", async () => {
    const response = await exports.default.fetch(new Request("https://tenant.test/files/filedoesnotexist"));
    expect(response.status).toBe(404);
  });
});

describe("the bucket binding", () => {
  it("is actually bound — without it every upload is a 404 nobody explains", () => {
    expect(env.FILES).toBeDefined();
  });
});
