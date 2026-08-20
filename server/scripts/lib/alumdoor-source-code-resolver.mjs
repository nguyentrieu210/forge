/**
 * Dịch mã hàng từ BẢN TRÍCH NGUỒN sang mã đang dùng.
 *
 * Vì sao cần: `local-imports/alumdoor-item-source-records.json` là bản trích nguyên từ bảng tính
 * — mỗi dòng ghi rõ `source_sheet` và `source_row`. Nó là BẰNG CHỨNG, nên không được sửa: sửa mã
 * trong đó là làm sai điều bảng tính thật sự nói.
 *
 * Nhưng danh mục đã qua hai đợt đổi mã (quy ước + rút gọn dấu cách), nên 1.834/2.168 dòng nguồn
 * mang mã không còn tồn tại. Chạy lại chuỗi import mà không dịch là TẠO LẠI toàn bộ mã cũ bên
 * cạnh mã mới — xoá sổ cả hai đợt đổi mã, và không có gì báo.
 *
 * Cách dịch: thử theo đúng thứ tự các phép đã áp lên danh mục, và chỉ nhận khi ra một mã CÓ THẬT.
 * Không suy diễn thêm — mã nào không ra thì trả `null` để bên gọi tự quyết, vì đoán mã hàng là
 * đoán xem một dòng định mức nói về vật tư nào.
 */

/** Rút gọn: khoảng trắng thành gạch ngang, gộp gạch lặp. Đúng phép đã chạy trên danh mục. */
export function simplifyCode(code) {
  return String(code).replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * @param {object} options
 * @param {Map<string,string>} options.conventionMap  mã cũ → mã theo quy ước
 * @param {Set<string>} options.liveCodes             mã đang thật sự tồn tại
 */
export function createSourceCodeResolver({ conventionMap, liveCodes }) {
  const cache = new Map();
  return function resolveSourceCode(code) {
    const key = String(code ?? '').trim();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);

    // Thứ tự thử = thứ tự các đợt đã chạy. Mã chưa từng đổi thì trúng ngay bước đầu.
    const viaConvention = conventionMap.get(key);
    const candidates = [
      key,
      viaConvention,
      simplifyCode(key),
      viaConvention ? simplifyCode(viaConvention) : null,
    ];
    let resolved = null;
    for (const candidate of candidates) {
      if (candidate && liveCodes.has(candidate)) { resolved = candidate; break; }
    }
    cache.set(key, resolved);
    return resolved;
  };
}

/**
 * Dịch cả một mảng bản ghi nguồn, trả về bản đã dịch kèm thống kê.
 *
 * Giữ nguyên mọi trường khác — chỉ `item_code` đổi, và luôn kèm `source_item_code_original` để
 * truy ngược được về dòng bảng tính gốc. Mất đường truy ngược là mất lý do tin vào con số.
 */
export function translateSourceRecords(records, resolveSourceCode) {
  const translated = [];
  const unresolved = new Map();
  let changed = 0;
  for (const record of records) {
    const original = String(record?.item_code ?? '').trim();
    if (!original) { translated.push(record); continue; }
    const resolved = resolveSourceCode(original);
    if (!resolved) {
      unresolved.set(original, (unresolved.get(original) ?? 0) + 1);
      translated.push(record);
      continue;
    }
    if (resolved === original) { translated.push(record); continue; }
    translated.push({ ...record, item_code: resolved, source_item_code_original: original });
    changed += 1;
  }
  return { records: translated, changed, unresolved };
}

/**
 * Dựng sẵn bộ dịch từ D1 + bảng quy ước, để mỗi bộ dựng payload chỉ cần hai dòng.
 *
 * Neo đường dẫn theo VỊ TRÍ FILE NÀY, không theo thư mục làm việc: các adapter gọi những bộ dựng
 * này từ nhiều thư mục khác nhau, và neo theo `cwd` thì có chỗ lặng lẽ bỏ qua việc dịch rồi vẫn
 * báo thành công — kiểu hỏng tệ nhất, vì không ai biết để đi tìm.
 *
 * Trả `null` khi không có D1 hoặc chưa có bảng quy ước: lúc đó nguồn chính là sự thật.
 */
export async function loadCanonicalCodeResolver() {
  const { existsSync } = await import('node:fs');
  const { readFile } = await import('node:fs/promises');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { DatabaseSync } = await import('node:sqlite');

  const here = dirname(fileURLToPath(import.meta.url));
  const serverRoot = resolve(here, '..', '..');
  const repoRoot = resolve(serverRoot, '..');
  const d1Path = process.env.ALUMDOOR_D1_PATH
    || resolve(serverRoot, 'apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite');
  const conventionPath = resolve(repoRoot, 'docs/alumdoor-item-code-mapping.json');
  if (!existsSync(d1Path) || !existsSync(conventionPath)) return null;

  const tenant = process.env.ALUMDOOR_TENANT || 'demo';
  const db = new DatabaseSync(d1Path, { readOnly: true });
  const liveCodes = new Set(
    db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype='Item'").all(tenant).map((row) => row.name),
  );
  const conventionMap = new Map(
    JSON.parse(await readFile(conventionPath, 'utf8')).mapping.map((row) => [row.from, row.to]),
  );
  return { resolve: createSourceCodeResolver({ conventionMap, liveCodes }), liveCodes };
}
