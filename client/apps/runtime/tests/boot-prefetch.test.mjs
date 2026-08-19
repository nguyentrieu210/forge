/**
 * Bên NHẬN của lời hỏi trước phiên/manifest.
 *
 * Module nằm ở `@metaforge/adapter-frappe` (nơi duy nhất chạm HTTP Frappe) nhưng test đặt
 * cạnh `boot-preload.test.mjs` vì hai vế là một chuỗi: script nội tuyến gọi, adapter nhận.
 * Ở đây cũng là chỗ có sẵn `vite` để dịch TypeScript ra chạy thẳng.
 *
 * Tính chất phải giữ: dùng ĐÚNG MỘT LẦN, và hỏng thì im lặng nhường cho đường gọi thật —
 * vì mọi thất bại ở đây (401 lúc chưa đăng nhập, mạng chập) đều phải kết thúc bằng một
 * lời gọi bình thường chứ không phải một màn hình lỗi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

const source = readFileSync(
  fileURLToPath(new URL("../../../packages/adapter-frappe/src/boot-prefetch.ts", import.meta.url)),
  "utf8",
);
const compiled = await transformWithEsbuild(source, "boot-prefetch.ts", { loader: "ts", format: "esm", target: "es2020" });
const { startBootPrefetch, consumeBootPrefetch, methodUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`
);

function stubFetch(responder) {
  const calls = [];
  globalThis.fetch = (url) => {
    calls.push(url);
    return Promise.resolve(responder(url));
  };
  return calls;
}

function reset() {
  delete globalThis.__forgeBootPrefetch;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("URL dựng giống hệt frappe-js-sdk: bỏ tham số rỗng", () => {
  assert.equal(methodUrl("metaforge.api.get_boot"), "/api/method/metaforge.api.get_boot");
  assert.equal(methodUrl("m", { app: undefined }), "/api/method/m");
  assert.equal(methodUrl("m", { app: "hrm" }), "/api/method/m?app=hrm");
  assert.equal(methodUrl("m", { app: "kho vn" }), "/api/method/m?app=kho+vn");
});

test("kết quả hỏi trước chỉ dùng được một lần", async () => {
  reset();
  const calls = stubFetch(() => json({ message: { user: "admin" } }));
  startBootPrefetch("");
  startBootPrefetch("");
  assert.equal(calls.length, 2, "gọi lại không được bắn thêm lượt nào");

  assert.deepEqual(await consumeBootPrefetch("boot"), { message: { user: "admin" } });
  assert.equal(await consumeBootPrefetch("boot"), undefined, "lần thứ hai luôn nghĩa là trạng thái đã đổi");
});

test("401 hay lỗi mạng thì nhường cho đường gọi thật", async () => {
  reset();
  stubFetch(() => json({ exc_type: "AuthenticationError" }, 401));
  startBootPrefetch("");
  assert.equal(await consumeBootPrefetch("boot"), undefined);

  reset();
  globalThis.fetch = () => Promise.reject(new Error("mạng chập"));
  startBootPrefetch("");
  assert.equal(await consumeBootPrefetch("manifest"), undefined);
});

test("manifest của app khác thì không dùng lại", async () => {
  reset();
  stubFetch(() => json({ message: { id: "hrm" } }));
  startBootPrefetch("?app=hrm");
  assert.equal(await consumeBootPrefetch("manifest", "alumdoor"), undefined,
    "hỏi trước cho hrm mà lấy ra dùng cho alumdoor là trả nhầm app");

  reset();
  stubFetch(() => json({ message: { id: "hrm" } }));
  startBootPrefetch("?app=hrm");
  assert.deepEqual(await consumeBootPrefetch("manifest", "hrm"), { message: { id: "hrm" } });
});

test("không hỏi trước thì không có gì để lấy", async () => {
  reset();
  assert.equal(await consumeBootPrefetch("boot"), undefined);
  assert.equal(await consumeBootPrefetch("manifest", "alumdoor"), undefined);
});
