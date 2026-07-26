#!/usr/bin/env node
/**
 * create-metaforge-app — CLI scaffold app MỎNG (P2-CLI-01, review độc lập — hardening).
 * Dùng: create-metaforge-app <id> [--name "Tên"] [--home <Doctype>] [--domain <stock|selling|...>] [--dir <path>]
 *       [--force] [--source workspace|external] [--version <dải semver>]
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { validateManifest } from "@metaforge/core";
import { scaffold } from "./scaffold.js";
import { MF_PACKAGES } from "./templates.js";

const USAGE =
  'Dùng: create-metaforge-app <id> [--name "Tên"] [--home <Doctype>] [--domain <stock|selling|...>] [--dir <path>]\n' +
  "      [--force] [--source workspace|external|local] [--version <dải semver>] [--metaforge-root <path>]\n\n" +
  "  --force              Cho phép ghi đè thư mục đích KHÔNG rỗng (XOÁ nội dung cũ).\n" +
  "  --source workspace   @metaforge/* = workspace:* (mặc định khi phát hiện monorepo — có\n" +
  "                       pnpm-workspace.yaml ở thư mục cha). CHỈ dùng được trong monorepo.\n" +
  "  --source external    @metaforge/* = --version (bắt buộc kèm), TỪ REGISTRY THẬT — package\n" +
  "                       @metaforge/* hiện private:true, CHƯA publish (xem KNOWN_GAPS.md); dùng\n" +
  "                       khi/nếu registry riêng đã có sẵn, KHÔNG phải mặc định dùng được ngay.\n" +
  "  --source local       @metaforge/* = `file:` trỏ THẲNG `<--metaforge-root>/packages/<pkg>`\n" +
  "                       (đã build dist) — dùng khi sinh app NGOÀI monorepo mà KHÔNG có registry\n" +
  "                       (cách install được thật, verify live — xem BUILDER_ROUNDTRIP/KNOWN_GAPS).\n" +
  "  --version <range>    Dải semver cho @metaforge/* khi --source external.\n" +
  "  --metaforge-root <path>  Đường dẫn checkout MetaForge (chứa packages/*) khi --source local.\n";

const BOOLEAN_FLAGS = new Set(["force", "help"]);
const VALUE_FLAGS = new Set(["name", "home", "domain", "dir", "version", "source", "metaforge-root"]);

interface ParsedArgs {
  pos: string[];
  opt: Record<string, string | boolean>;
  errors: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const pos: string[] = [];
  const opt: Record<string, string | boolean> = {};
  const errors: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (BOOLEAN_FLAGS.has(key)) { opt[key] = true; continue; }
      if (!VALUE_FLAGS.has(key)) { errors.push(`cờ không nhận ra: --${key}`); continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) { errors.push(`--${key} cần giá trị (thiếu hoặc trỏ sang cờ khác)`); continue; }
      opt[key] = next;
      i++;
    } else {
      pos.push(a);
    }
  }
  return { pos, opt, errors };
}

/**
 * `--source local`: KHÔNG dùng `file:<thư mục package>` trực tiếp — mỗi package `@metaforge/*` trong
 * monorepo tự khai `"@metaforge/core": "workspace:*"` cho NHAU trong package.json CỦA CHÍNH NÓ; pnpm
 * cố resolve `workspace:*` đó khi cài package qua `file:` NGOÀI 1 workspace pnpm thật → lỗi
 * `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` (xác nhận LIVE khi thử — đây chính là lý do `--source external`
 * "scaffold được nhưng không install được" mà review độc lập bắt). `pnpm pack` GIẢI QUYẾT đúng vấn đề
 * này: đóng gói tarball THẬT, tự REWRITE `workspace:*` → version số thật tại thời điểm pack (hành vi
 * chuẩn của pnpm cho publish) → tarball install độc lập, không cần workspace pnpm nào cả.
 */
function packLocalDeps(root: string): Record<(typeof MF_PACKAGES)[number], string> {
  const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { packageManager?: string };
  const pm = rootPkg.packageManager ?? "pnpm@9.15.0";
  const cacheDir = mkdtempSync(join(tmpdir(), "mf-local-pack-"));
  const out = {} as Record<(typeof MF_PACKAGES)[number], string>;
  for (const p of MF_PACKAGES) {
    const pkgDir = join(root, "packages", p);
    // Windows: "corepack" là .cmd shim — spawn KHÔNG qua shell thì ENOENT (tên trần) hoặc EINVAL (tên
    // ".cmd" trực tiếp, xác nhận LIVE cả 2) — .cmd/.bat BẮT BUỘC qua shell trên Windows (giới hạn OS,
    // không phải Node). Dùng execSync (LUÔN qua shell, string tự quote) thay vì execFile+shell:true
    // (Node DEP0190 — array args + shell:true nối chuỗi thô KHÔNG tự quote, rủi ro injection thật nếu
    // path có ký tự đặc biệt). Input ở đây (`pm` từ package.json repo, `cacheDir` do mkdtempSync sinh)
    // không phải untrusted, nhưng vẫn tự quote đúng thay vì dựa vào hành vi ngầm của execFile.
    const q = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;
    execSync(`corepack ${q(pm)} pack --pack-destination ${q(cacheDir)}`, { cwd: pkgDir, stdio: "pipe" });
    const { name, version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { name: string; version: string };
    const tarball = `${name.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`;
    const tarballPath = join(cacheDir, tarball);
    if (!existsSync(tarballPath)) throw new Error(`pnpm pack không tạo ra tarball dự kiến: ${tarballPath}`);
    out[p] = `file:${tarballPath.replace(/\\/g, "/")}`;
  }
  return out;
}

/** Đi lên từ `startDir` tìm `pnpm-workspace.yaml` — có = đang chạy TRONG monorepo (workspace:* install
 * được). KHÔNG suy đoán theo cách khác (vd tên thư mục apps/) — chỉ tín hiệu THẬT của pnpm workspace. */
function findMonorepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function main() {
  const { pos, opt, errors } = parseArgs(process.argv.slice(2));
  if (opt.help === true) { console.log(USAGE); return; }
  if (errors.length) {
    console.error("Lỗi tham số:");
    for (const e of errors) console.error(`  - ${e}`);
    console.error("\n" + USAGE);
    process.exit(2);
  }

  const id = pos[0];
  if (!id) {
    console.error(USAGE);
    process.exit(2);
  }

  const name = (opt.name as string | undefined) ?? id;
  const homeDoctype = (opt.home as string | undefined) ?? "ToDo";
  const domain = (opt.domain as string | undefined) ?? "stock";
  const allowedDomains = new Set(["stock", "selling", "buying", "accounts", "manufacturing", "hr", "crm", "projects", "assets", "support", "quality"]);
  if (!allowedDomains.has(domain)) {
    console.error(`--domain không hợp lệ: "${domain}". Chọn: ${[...allowedDomains].join("|")}`);
    process.exit(2);
  }
  const dir = resolve((opt.dir as string | undefined) ?? id);
  const force = opt.force === true;
  const explicitSource = opt.source as string | undefined;
  const explicitVersion = opt.version as string | undefined;
  const explicitMetaforgeRoot = opt["metaforge-root"] as string | undefined;

  if (explicitSource !== undefined && !["workspace", "external", "local"].includes(explicitSource)) {
    console.error(`--source không hợp lệ: "${explicitSource}" (chỉ nhận workspace|external|local)`);
    process.exit(2);
  }

  // P2-CLI-01: KHÔNG âm thầm dùng workspace:* ngoài monorepo (app sinh ra sẽ không install được).
  const monorepoRoot = findMonorepoRoot(dirname(dir));
  const source = explicitSource ?? (monorepoRoot ? "workspace" : undefined);
  let metaforgeDeps: Partial<Record<(typeof MF_PACKAGES)[number], string>>;
  if (source === "workspace") {
    metaforgeDeps = Object.fromEntries(MF_PACKAGES.map((p) => [p, "workspace:*"]));
  } else if (source === "external") {
    if (!explicitVersion) {
      console.error('--source external cần --version "<dải semver>" (vd --version "^0.2.0").');
      process.exit(2);
    }
    metaforgeDeps = Object.fromEntries(MF_PACKAGES.map((p) => [p, explicitVersion]));
  } else if (source === "local") {
    // P2-CLI-01/external-package-strategy (review độc lập): @metaforge/* private:true, CHƯA publish
    // — `--source external` scaffold được nhưng KHÔNG install được (registry không có gói). `local`
    // trỏ THẲNG `file:` vào từng package đã build dist trong checkout MetaForge — install được THẬT
    // ngoài monorepo mà không cần registry (verify live, xem KNOWN_GAPS.md/BUILDER_ROUNDTRIP.md).
    if (!explicitMetaforgeRoot) {
      console.error('--source local cần --metaforge-root "<đường dẫn checkout MetaForge>" (chứa packages/*).');
      process.exit(2);
    }
    const root = resolve(explicitMetaforgeRoot);
    const missing = MF_PACKAGES.filter((p) => !existsSync(join(root, "packages", p, "package.json")));
    if (missing.length) {
      console.error(`--metaforge-root "${root}" thiếu package: ${missing.map((p) => `packages/${p}`).join(", ")}`);
      process.exit(2);
    }
    console.log("Đóng gói @metaforge/* thành tarball (pnpm pack, rewrite workspace:* → version thật)…");
    metaforgeDeps = packLocalDeps(root);
  } else {
    console.error(
      "Không phát hiện monorepo (không tìm thấy pnpm-workspace.yaml ở thư mục cha của --dir).\n" +
        "App sinh ra với workspace:* sẽ KHÔNG install được ở ngoài monorepo. Chọn 1 trong 3:\n" +
        '  --version "<dải semver>" (ngầm định --source external — CẦN registry thật có @metaforge/*)\n' +
        '  --source local --metaforge-root "<path checkout MetaForge>" (KHÔNG cần registry, verify live)\n' +
        "  --source workspace (nếu chắc chắn đang chạy trong 1 monorepo pnpm thiếu pnpm-workspace.yaml ở nhánh cha)",
    );
    process.exit(2);
  }

  // P2-CLI-01: thư mục đích KHÔNG rỗng mà không --force → từ chối, KHÔNG âm thầm ghi đè việc đang dở.
  if (existsSync(dir)) {
    const entries = await readdir(dir).catch(() => [] as string[]);
    if (entries.length > 0 && !force) {
      console.error(`Thư mục đích "${dir}" đã có ${entries.length} mục. Dùng --force để ghi đè (sẽ XOÁ nội dung cũ).`);
      process.exit(2);
    }
  }

  // validate bằng CHÍNH manifest schema engine (không sinh app cấu hình sai).
  const check = validateManifest({
    id, name, domain, catalogMode: "hybrid",
    home: { doctype: homeDoctype, route: `/overview/${domain}` },
    businessContext: { mode: "server-resolved", dimensions: ["company", "fiscal_year", "warehouse"] },
    nav: [{ key: domain, label: "Tổng quan", kind: "overview" }, { key: homeDoctype, label: homeDoctype }],
  });
  if (!check.ok) {
    console.error("Manifest không hợp lệ:");
    for (const i of check.issues) console.error(`  - [${i.severity}] ${i.code}: ${i.message}`);
    process.exit(1);
  }

  const written = await scaffold(dir, { id, name, homeDoctype, domain, metaforgeDeps });
  console.log(`✓ Đã tạo app "${name}" tại ${dir} (nguồn @metaforge/*: ${source}${source === "external" ? ` ${explicitVersion}` : source === "local" ? ` ${resolve(explicitMetaforgeRoot!)}` : ""})`);
  for (const f of written) console.log(`  + ${f}`);
  console.log("\nBước tiếp:\n  cd " + dir + "\n  pnpm install && pnpm build");
}

main().catch((e) => { console.error(e); process.exit(1); });
