/**
 * Đọc file dữ liệu của một tầng.
 *
 * File dữ liệu là NGUỒN của tầng: nó nói tầng đó phải có gì, không phải "ảnh chụp lần chạy
 * trước". Nhờ vậy nhập lại trên máy trắng cho ra đúng kết quả cũ mà không cần D1 nào còn sống.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOC_REPO } from "./d1.mjs";

export function docNguon(tenFile, doctypeMongDoi) {
  const duong = resolve(GOC_REPO, "nhap/du-lieu", `${tenFile}.json`);
  const d = JSON.parse(readFileSync(duong, "utf8"));

  if (d.doctype !== doctypeMongDoi) {
    throw new Error(`${tenFile}.json khai doctype="${d.doctype}", tầng này cần "${doctypeMongDoi}"`);
  }
  if (!Array.isArray(d.ban_ghi) || d.ban_ghi.length === 0) {
    throw new Error(`${tenFile}.json không có bản ghi nào`);
  }
  // `so_ban_ghi` là chốt chặn đọc được bằng mắt: file bị cắt cụt lúc chép/merge vẫn là JSON hợp
  // lệ, và nhập thiếu một nửa danh mục thì không có gì kêu cho tới khi người dùng mở ô chọn.
  if (d.so_ban_ghi !== d.ban_ghi.length) {
    throw new Error(`${tenFile}.json khai ${d.so_ban_ghi} bản ghi nhưng đếm được ${d.ban_ghi.length}`);
  }

  const trung = d.ban_ghi.map((r) => r.name).filter((v, i, a) => a.indexOf(v) !== i);
  if (trung.length) throw new Error(`${tenFile}.json có tên trùng: ${[...new Set(trung)].join(", ")}`);

  return d;
}

/** Gom mọi giá trị của một trường trong payload — để kiểm tham chiếu. */
export const truong = (banGhi, ten) => banGhi.map((r) => r.payload?.[ten]).filter(Boolean);
