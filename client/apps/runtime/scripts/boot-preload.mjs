/**
 * Tải trước đúng chuỗi khởi động, phát ngay trong `<head>`.
 *
 * Vấn đề: bundle mở app theo kiểu nối đuôi. HTML → chunk entry → `main` → `main-base`
 * → chunk màn làm việc, mỗi mũi tên là một vòng mạng đầy đủ vì trình duyệt chỉ biết tên
 * file sau khi đã đọc xong file trước. Đo trên `alu.kairo.vn` (biên SIN): mỗi chặng ~65 ms
 * chưa kể thời gian tải, nên chuỗi này tiêu tốn ~0,3 giây trước khi có dòng chữ đầu tiên,
 * và trên 4G thì các file lớn tải NỐI ĐUÔI thay vì song song.
 *
 * Cách chữa: lúc build đã biết chính xác tên file băm của cả chuỗi, nên nhúng thẳng danh
 * sách đó vào HTML kèm một script nội tuyến phát `modulepreload`. Trình duyệt bắt đầu tải
 * mọi mắt xích ngay khi đọc `<head>`, song song với nhau và với chính chunk entry.
 *
 * Chỉ tải trước thứ làn đó THẬT SỰ cần: khách vào website công khai không phải gánh 108 kB
 * gzip của Desk, và ngược lại. Luật chia làn là `src/boot-route.ts` — biên dịch từ chính
 * file đó chứ không chép tay, xem chú thích trong đó.
 */

/** Nguồn (đuôi đường dẫn) của từng mắt xích cần biết tên file băm. */
export const BOOT_CHUNK_SOURCES = {
  main: "/apps/runtime/src/main.tsx",
  mainBase: "/apps/runtime/src/main-base.tsx",
  website: "/apps/runtime/src/website/WebsiteSite.tsx",
  workspace: "/packages/views/src/app/RuntimeDoctypeWorkspace.tsx",
  vertical: "/packages/vertical-alumdoor/src/index.ts",
};

const laneKeys = ["website", "desk", "desk-workspace"];

/**
 * Sinh script nội tuyến. Hàm thuần để `tests/boot-preload.test.mjs` chạy được nó trong `vm`
 * và so quyết định với chính module luật — cùng khuôn với `nav-path-contract.test.mjs`.
 */
export function renderPreloadScript({ bootRouteIife, lanes, base = "/" }) {
  for (const key of laneKeys) {
    if (!lanes[key]) throw new Error(`boot-preload: thiếu làn ${key}`);
  }
  const table = JSON.stringify(lanes);
  return `(function(){
${bootRouteIife}
var BASE=${JSON.stringify(base)},LANES=${table},seen={};
function preload(lane){
  var group=LANES[lane];if(!group)return;
  for(var i=0;i<group.files.length;i++)add(group.files[i],"modulepreload",null);
  for(var j=0;j<group.css.length;j++)add(group.css[j],"preload","style");
}
function add(file,rel,as){
  var href=BASE+file;if(seen[href])return;seen[href]=1;
  var link=document.createElement("link");link.rel=rel;link.href=href;link.crossOrigin="";
  if(as)link.as=as;
  document.head.appendChild(link);
}
var lane=__forgeBootRoute.resolvePreloadLane(window.location);
preload(lane);
if(lane==="website"){
  // Tenant không có website trả 404 — lúc đó mới biết chắc là Desk, và biết SỚM hơn nhiều
  // so với đợi chunk bootstrap tải xong rồi mới hỏi.
  __forgeBootRoute.startWebsiteProbe().then(function(response){
    if(response.status===404)preload("desk");
  }).catch(function(){});
}
})();`;
}

/**
 * Plugin Vite: đọc bundle đã sinh, dựng bảng file cho từng làn, nhúng script vào `<head>`.
 */
export function bootPreload({ transformWithEsbuild, bootRoutePath }) {
  let base = "/";
  return {
    name: "forge-boot-preload",
    apply: "build",
    configResolved(config) {
      base = config.base ?? "/";
    },
    transformIndexHtml: {
      order: "post",
      async handler(html, ctx) {
        if (!ctx.bundle) return html;
        const bundle = ctx.bundle;
        const chunks = Object.values(bundle).filter((item) => item.type === "chunk");

        /**
         * Không tìm thấy thì DỪNG BUILD. Bỏ qua im lặng nghĩa là chuỗi tải trước biến mất
         * đúng vào lúc ai đó đổi tên file, và không cổng nào đỏ — hiệu năng tụt lại mà
         * không ai biết vì sao.
         */
        /**
         * Tìm theo module CHỨA trong chunk, không theo `facadeModuleId`: Rollup bỏ trống
         * facade ngay khi nó gộp thêm module dùng chung vào cùng chunk, và `main.tsx` rơi
         * đúng vào trường hợp đó.
         */
        const chunkFor = (suffix) => {
          const match = chunks.find((chunk) => moduleIdsOf(chunk).some((id) => id.replace(/\\/g, "/").endsWith(suffix)));
          if (!match) {
            throw new Error(`forge-boot-preload: không tìm thấy chunk chứa ${suffix}. Chuỗi khởi động đã đổi — cập nhật BOOT_CHUNK_SOURCES trong scripts/boot-preload.mjs.`);
          }
          return match;
        };

        const closure = (...entries) => {
          const visited = new Set();
          const files = new Set();
          const css = new Set();
          const walk = (fileName) => {
            if (visited.has(fileName)) return;
            visited.add(fileName);
            const chunk = bundle[fileName];
            if (!chunk || chunk.type !== "chunk") return;
            // Chunk entry đã có thẻ <script> riêng trong HTML; tải trước nó là thừa.
            if (!chunk.isEntry) files.add(fileName);
            for (const asset of chunk.viteMetadata?.importedCss ?? []) css.add(asset);
            for (const next of chunk.imports) walk(next);
          };
          for (const entry of entries) walk(entry.fileName);
          return { files: [...files], css: [...css] };
        };

        const desk = closure(chunkFor(BOOT_CHUNK_SOURCES.main), chunkFor(BOOT_CHUNK_SOURCES.mainBase));
        const workspace = closure(chunkFor(BOOT_CHUNK_SOURCES.workspace), chunkFor(BOOT_CHUNK_SOURCES.vertical));
        const website = closure(chunkFor(BOOT_CHUNK_SOURCES.website));
        const merge = (left, right) => ({
          files: [...new Set([...left.files, ...right.files])],
          css: [...new Set([...left.css, ...right.css])],
        });

        const source = await readSource(bootRoutePath);
        const compiled = await transformWithEsbuild(source, bootRoutePath, {
          format: "iife",
          globalName: "__forgeBootRoute",
          target: "es2018",
          minify: true,
          loader: "ts",
        });

        return {
          html,
          tags: [{
            tag: "script",
            children: renderPreloadScript({
              bootRouteIife: compiled.code.trim(),
              lanes: { website, desk, "desk-workspace": merge(desk, workspace) },
              base,
            }),
            injectTo: "head",
          }],
        };
      },
    },
  };
}

function moduleIdsOf(chunk) {
  return chunk.moduleIds ?? Object.keys(chunk.modules ?? {});
}

async function readSource(file) {
  const { readFile } = await import("node:fs/promises");
  return readFile(file, "utf8");
}
