#!/usr/bin/env node
/**
 * Sinh kế hoạch RÚT GỌN mã hàng: bỏ dấu cách.
 *
 * ĐỌC-CHỈ. Không ghi gì vào D1 — chỉ đẻ ra một file kế hoạch để adapter đổi mã nạp vào.
 *
 * Vì sao dấu cách trong mã là vấn đề thật, không phải chuyện thẩm mỹ: `Bill of Materials`
 * DM-2026-0207/0208 trỏ vào `TP-CUADL1LY-XN-VK_TRONBO_3-4M` trong khi mã thật là
 * `TP-CUADL1LY XN-VK_TRONBO_3-4m²`. Ai đó gõ tay và thay dấu cách bằng gạch ngang. Mã có dấu
 * cách còn vỡ khi xuất Excel, khi ghép chuỗi, và khi in mã vạch.
 *
 * Phép biến đổi cố ý HẸP: chỉ thay khoảng trắng thành gạch ngang rồi gộp gạch lặp. Không đụng
 * hoa/thường, không bỏ dấu tiếng Việt, không rút gọn gì khác — mỗi thứ đó là một quyết định
 * riêng, và trộn chúng vào một lượt thì không ai soát được nữa.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const D1 = process.env.ALUMDOOR_D1_PATH
  || path.join(process.cwd(), 'apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite');
const TENANT = process.env.ALUMDOOR_TENANT || 'demo';
const outPath = process.argv[2] || path.join(process.cwd(), '..', 'docs', 'alumdoor-code-simplify-plan.json');
if (!fs.existsSync(D1)) throw new Error(`Khong thay D1: ${D1}`);

export function simplifyCode(code) {
  return String(code).replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

const db = new DatabaseSync(D1, { readOnly: true });
const names = db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype='Item'").all(TENANT).map((row) => row.name);
const existing = new Set(names);

const plan = [];
const collisions = [];
const claimed = new Map();
for (const name of names) {
  if (!/\s/.test(name)) continue;
  const to = simplifyCode(name);
  if (to === name) continue;
  // Mã đích đã có chủ thì DỪNG cả lượt: đổi tên đè lên một mặt hàng khác là trộn hai mặt hàng
  // làm một, và không có gì báo.
  if (existing.has(to)) { collisions.push({ from: name, to, reason: 'mã đích đã tồn tại' }); continue; }
  if (claimed.has(to)) { collisions.push({ from: name, to, reason: `đụng với ${claimed.get(to)}` }); continue; }
  claimed.set(to, name);
  plan.push({ from: name, to, why: 'bỏ dấu cách khỏi mã hàng' });
}

const report = {
  format: 'alumdoor-item-code-mapping/v1',
  generated_at: new Date().toISOString(),
  convention: 'chỉ bỏ dấu cách; không đổi hoa/thường, không bỏ dấu tiếng Việt',
  summary: {
    source_count: names.length,
    planned_rename_count: plan.length,
    collision_count: collisions.length,
  },
  needs_owner_decision: { unresolved_prefix: 0, too_long: [], still_invalid: 0 },
  merged_families: [],
  collisions,
  mapping: plan,
};

if (collisions.length > 0) {
  console.error(`ALUMDOOR_CODE_SIMPLIFY_COLLISION count=${collisions.length} ${JSON.stringify(collisions.slice(0, 5))}`);
  process.exit(2);
}

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`ALUMDOOR_CODE_SIMPLIFY_PLAN items=${names.length} planned=${plan.length} collisions=0 out=${outPath}`);
