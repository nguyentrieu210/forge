/**
 * Chuỗi tải trước lúc mở app.
 *
 * Hai thứ được giữ ở đây, đều là chỗ đã từng hỏng lặng lẽ ở repo này:
 *
 * 1. **Luật chia làn chỉ có một bản.** Script nội tuyến trong `<head>` được BIÊN DỊCH từ
 *    `src/boot-route.ts`, không chép tay — giống bài học `resolveNavPath`. Test chạy chính
 *    bản nội tuyến trong `vm` và so quyết định với bản module.
 * 2. **Tải trước không được im lặng biến mất.** Nếu ai đó gỡ plugin khỏi `vite.config.ts`,
 *    hoặc `index.html` quay lại nạp bootstrap bằng import động, app vẫn chạy đúng và mọi
 *    cổng vẫn xanh — chỉ chậm lại. Ba assert cuối canh đúng chỗ đó.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { transformWithEsbuild } from "vite";
import { renderPreloadScript } from "../scripts/boot-preload.mjs";

const appRoot = new URL("../", import.meta.url);
const read = (relative) => readFileSync(fileURLToPath(new URL(relative, appRoot)), "utf8");

const LANES = {
  website: { files: ["assets/website.js"], css: ["assets/site.css"] },
  desk: { files: ["assets/main.js", "assets/main-base.js"], css: ["assets/desk.css"] },
  "desk-workspace": { files: ["assets/main.js", "assets/main-base.js", "assets/workspace.js"], css: ["assets/desk.css"] },
};

async function inlineScript() {
  const source = read("src/boot-route.ts");
  const compiled = await transformWithEsbuild(source, "boot-route.ts", {
    format: "iife",
    globalName: "__forgeBootRoute",
    target: "es2018",
    minify: true,
    loader: "ts",
  });
  return renderPreloadScript({ bootRouteIife: compiled.code.trim(), lanes: LANES, base: "/" });
}

function run(code, url, probeStatus = 200) {
  const location = new URL(url);
  const links = [];
  const fetched = [];
  const context = {
    window: { location: { hostname: location.hostname, pathname: location.pathname, search: location.search } },
    document: {
      createElement: () => ({}),
      head: { appendChild: (node) => links.push(node) },
    },
    URLSearchParams,
    Promise,
    fetch: (input) => { fetched.push(input); return Promise.resolve({ status: probeStatus }); },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { links, fetched, lane: () => links.map((link) => link.href) };
}

test("mỗi làn chỉ tải trước phần mình cần", async () => {
  const code = await inlineScript();

  const desk = run(code, "https://alu.kairo.vn/app/Item");
  assert.deepEqual(desk.lane(), [
    "/assets/main.js", "/assets/main-base.js", "/assets/workspace.js", "/assets/desk.css",
  ], "mở thẳng một DocType thì chunk màn làm việc phải nằm trong lượt tải đầu");

  const login = run(code, "https://alu.kairo.vn/login");
  assert.deepEqual(login.lane(), ["/assets/main.js", "/assets/main-base.js", "/assets/desk.css"]);

  const site = run(code, "https://phanbon.kairo.vn/gioi-thieu");
  assert.deepEqual(site.lane(), ["/assets/website.js", "/assets/site.css"],
    "khách vào trang công khai không phải tải bó Desk");
});

test("làn website hỏi server ngay trong <head>, và tenant không có website thì quay về Desk", async () => {
  const code = await inlineScript();

  const probed = run(code, "https://phanbon.kairo.vn/khuyen-mai");
  assert.deepEqual(probed.fetched, ["/api/method/forge.website.page?slug=khuyen-mai"],
    "lời gọi phải xuất phát từ script nội tuyến, không đợi chunk bootstrap");

  const noSite = run(code, "https://alu.kairo.vn/", 404);
  assert.deepEqual(noSite.lane(), ["/assets/website.js", "/assets/site.css"]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(noSite.lane(), [
    "/assets/website.js", "/assets/site.css", "/assets/main.js", "/assets/main-base.js", "/assets/desk.css",
  ], "404 nghĩa là tenant này không có website — tải Desk ngay, đừng đợi vòng sau");
});

test("bản nội tuyến và bản module quyết định giống hệt nhau", async () => {
  const code = await inlineScript();
  // Bản thứ hai: cùng nguồn, nhưng dựng dưới dạng ESM không rút gọn — tức đúng thứ
  // `bootstrap.ts` nạp lúc chạy thật.
  const esm = await transformWithEsbuild(read("src/boot-route.ts"), "boot-route.ts", { loader: "ts", format: "esm", target: "es2020" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(esm.code).toString("base64")}`);

  const cases = [
    "https://alu.kairo.vn/", "https://alu.kairo.vn/app/Sales%20Order", "https://alu.kairo.vn/shop",
    "https://phanbon.kairo.vn/", "https://phanbon.kairo.vn/bang-gia", "https://phanbon.kairo.vn/a/b",
    "https://chotdon.kairo.vn/", "https://alu.kairo.vn/?alumdoor=1", "https://alu.kairo.vn/x?app=hrm",
    "https://alu.kairo.vn/%E1%BA%A1", "https://alu.kairo.vn/%",
  ];

  for (const url of cases) {
    const inline = run(code, url);
    const expectedWebsite = inline.fetched.length > 0;
    assert.equal(module.resolveBootLane(new URL(url)) === "website", expectedWebsite,
      `${url}: hai bản chia làn khác nhau`);
    assert.ok(inline.lane().length > 0, `${url}: không tải trước gì cả`);
  }
});

test("dây nối vẫn còn: plugin được lắp, và entry nạp bootstrap bằng import tĩnh", () => {
  const config = read("vite.config.ts");
  assert.match(config, /bootPreload\(\{[^}]*bootRoutePath[^}]*\}\)/, "plugin tải trước phải nằm trong danh sách plugin");
  assert.match(config, /src\/boot-route\.ts/, "plugin phải nhúng ĐÚNG file luật, không phải bản chép");

  const html = read("index.html");
  assert.match(html, /import \{ boot \} from "\/src\/bootstrap\.ts"/,
    "import động ở đây là thêm một vòng mạng chỉ để đọc vài kB");

  const bootstrap = read("src/bootstrap.ts");
  assert.match(bootstrap, /from "\.\/boot-route\.js"/, "bootstrap phải dùng chung luật chia làn");
  assert.doesNotMatch(bootstrap, /^void boot\(\);/m, "bootstrap không được tự chạy khi bị import tĩnh");
});

test("bản build thật có mang chuỗi tải trước", { skip: !existsSync(fileURLToPath(new URL("dist/index.html", appRoot))) }, () => {
  const html = read("dist/index.html");
  assert.match(html, /__forgeBootRoute/, "index.html đã build phải chứa script tải trước");
  assert.match(html, /assets\/main-base-[^"]+\.js/, "danh sách tải trước phải là tên file băm thật");
  assert.doesNotMatch(html, /rel="modulepreload"/, "tải trước là do script phát theo làn, không phải thẻ tĩnh cho mọi khách");
});
