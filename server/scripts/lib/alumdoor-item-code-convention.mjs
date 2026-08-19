/**
 * Quy ước mã hàng Alumdoor — `docs/ALUMDOOR-QUY-UOC-MA.md`, chốt 2026-07-29.
 *
 * Dạng mã: `<LOẠI>-<HỌ>[-<ĐẶC TRƯNG>]`. Bốn luật cứng của §2:
 *
 *   1. Chỉ `A–Z`, `0–9`, `-`, và `.` trong số đo. Không khoảng trắng, dấu tiếng Việt,
 *      chữ thường, `_ ( ) ,`
 *   2. **Màu không bao giờ nằm trong mã.**
 *   3. Tối đa 24 ký tự.
 *   4. Tiền tố nói món đó LÀ GÌ, không nói nó đến từ đâu hay ai bán.
 *
 * ═══ BA THỨ BỊ BỎ, MỘT THỨ ĐƯỢC GIỮ ═══
 *
 *   TP-CUADL1LY XN-VK_TRONBO_4-5m²   ->   CUA-DL-1LY
 *      └────┬───┘ └─┬─┘ └──┬──┘ └─┬─┘
 *     cửa + độ dày  màu  cách bán  bậc
 *         GIỮ       BỎ     BỎ      BỎ
 *
 * - **Số đo GIỮ** (`4.6D`, `U76`, `2.4LY`): tài liệu ghi "giữ cách xưởng đọc — đổi `4.6D`
 *   thành `46D` là bắt người ta dịch lại trong đầu mỗi lần". Và số đo đổi giá.
 * - **Màu BỎ**: xưởng mua nhôm THÔ rồi tự sơn, nên màu sinh ra ở công đoạn sơn. Nhét màu vào
 *   mã là ghi một sự thật ở sai thời điểm. Đo trên D1 19/08: trong 50 gia đình mã có đủ đơn
 *   giá ở mọi màu, **0 gia đình có giá khác nhau theo màu** — màu trong mã không mua được gì,
 *   nó chỉ chẻ tồn kho.
 * - **Cách bán BỎ**: `TRONBO` trong mã chính là dựng lại `Sales Option` qua cửa sau, thứ đã
 *   xoá ở `46cff213` và bị audit 16/08 cấm đưa lại. Nằm ở khoá bản ghi là hình thức khó gỡ nhất.
 * - **Bậc diện tích BỎ**: đó là chiều tra giá phụ thuộc kích thước khách đặt, không phải một
 *   mặt hàng khác.
 *
 * ═══ MODULE NÀY KHÔNG TỰ ĐOÁN ═══
 *
 * Mã hàng là KHOÁ BẢN GHI: nó đi vào Item Price, BOM, BOM Rule applicability, lô tồn và mọi
 * chứng từ. Đoán sai một tiền tố là gán sai danh tính vĩnh viễn. Nên khi không suy được tiền
 * tố từ dữ liệu, hàm trả `prefix: null` kèm lý do để người duyệt xử, chứ không chọn bừa `VT`.
 */

/** Mười tiền tố hợp lệ, §2. */
export const ALUMDOOR_CODE_PREFIXES = Object.freeze([
  'NHOM', 'CUA', 'RAY', 'TRUC', 'MOTO', 'PIN', 'LUOI', 'PK', 'VT', 'DV',
]);

export const ALUMDOOR_CODE_MAX_LENGTH = 24;

/**
 * Nhóm hàng → tiền tố mặc định.
 *
 * Suy từ NHÓM chứ không từ tên, vì nhóm là phân loại đã được chủ xưởng chốt còn tên thì tự do.
 * Ba nhóm cần nhìn thêm vào tên mới quyết được — xem `NAME_OVERRIDES`.
 */
/**
 * Nhóm DÒNG SẢN PHẨM — thắng mọi gợi ý vật liệu trong tên.
 *
 * `TP-TOLEKEM124_6D` thuộc nhóm `Cửa Đài Loan`: nó là CỬA THÀNH PHẨM bán theo m², chỉ tình cờ
 * làm bằng tôn. Để luật tên bắt chữ `TOLE` rồi đẩy nó sang `VT` là gán sai danh tính cho 29
 * mặt hàng. Nhóm đã được chủ xưởng chốt; vật liệu trong tên chỉ là mô tả.
 */
const PRODUCT_LINE_GROUP_PREFIX = new Map([
  ['Cửa CN Đức', 'CUA'],
  ['Cửa tấm liền Úc', 'CUA'],
  ['Cửa Đài Loan', 'CUA'],
  ['Cửa Đài Loan Inox', 'CUA'],
  ['Cửa kéo Đài Loan', 'CUA'],
  ['Cửa Siêu Trường', 'CUA'],
  ['Cửa Lưới', 'LUOI'],
  ['Motor', 'MOTO'],
  ['Bình lưu điện', 'PIN'],
]);

/**
 * Nhóm CẤU KIỆN — tên cụ thể hơn nhóm, nên luật tên được hỏi trước.
 *
 * `Nan/lá cửa` chứa cả nhôm cây/lá (`NHOM`) lẫn tôn và bọ vis (`VT`); `Ray và trục` chứa cả
 * ray (`RAY`) lẫn trục (`TRUC`) nên KHÔNG có mặc định — một nhóm, hai tiền tố.
 */
const COMPONENT_GROUP_PREFIX = new Map([
  ['Nan/lá cửa', 'NHOM'],
  ['Linh kiện motor', 'PK'],
  ['Điều khiển & phụ kiện điện', 'PK'],
  ['Phụ kiện chung', 'PK'],
  ['Phụ kiện CN Đức', 'PK'],
  ['Phụ kiện cần sơn tĩnh điện', 'PK'],
]);

/**
 * Luật nhìn tên — chỉ dùng khi nhóm không đủ để quyết.
 *
 * Thứ tự có nghĩa: luật đầu tiên khớp sẽ thắng. Mỗi luật phải chỉ được một tiền tố, không
 * bao giờ "đoán cho có".
 */
const NAME_OVERRIDES = [
  // DỊCH VỤ đứng TRƯỚC mọi luật vật lý. "Phụ thu sơn ray" có chữ `ray` nên luật RAY nuốt mất
  // nó, và một khoản phụ thu bị gán danh tính của một thanh ray.
  { test: /(PHUTHU|PHỤ ?THU|CONG ?LAP|CÔNG ?LẮP|VAN ?CHUYEN|VẬN ?CHUYỂN|DICH ?VU|DỊCH ?VỤ|TIEN ?CONG|TIỀN ?CÔNG)/i, prefix: 'DV', why: 'dịch vụ/phụ thu theo §2' },
  // KHÔNG dùng `\b` sau TRUC/RAY: mã thật viết liền số (`NVL-TRUC114_2.4LY`), mà `\b` giữa
  // chữ và số không khớp — hai mã trục đã lọt qua vì đúng chỗ này.
  { test: /(TRUC|TRỤC)/i, prefix: 'TRUC', why: 'tên chứa TRỤC' },
  { test: /(^|[^A-Z])RAY/i, prefix: 'RAY', why: 'tên chứa RAY' },
  { test: /(TOLE|TÔN|TON)\b/i, prefix: 'VT', why: 'tôn — vật tư khác theo §2' },
  { test: /\b(XOP|XỐP|VIS|KEO|SON|SƠN|HOA ?CHAT|HOÁ ?CHẤT|CROMATE|TAY|TẨY)\b/i, prefix: 'VT', why: 'vật tư/hoá chất theo §2' },
];

/**
 * Token màu phải biến khỏi mã.
 *
 * Gồm cả viết tắt cũ (`GS`, `VK`, `XN-VK`…) lẫn dạng slug (`XANH_NGOC`). CẢNH BÁO: `THO`
 * cũng ở đây nhưng nó là TÌNH TRẠNG chứ không phải màu — nó vẫn phải rời khỏi mã, và đi về
 * `Batch.condition` chứ không về `Item Color`.
 */
const COLOR_TOKENS = [
  'XN-VK', 'XN-XLC', 'GU-KU', 'KU-GU', 'XR-CF', 'XAM-TRANG', 'XANH-NGOC-VANG-KEM',
  'GHI-UC-KEM-UC', 'XANH-REU-CAFE', 'XAM-XANH-NGOC',
  'XANH_NGOC_VANG_KEM_MM', 'XAM_TRANG_MM', 'GHI_UC_KEM_UC_MM', 'XANH_REU_CAFE_MM', 'XAM_XANH_NGOC_MM',
  'MIDNIGHT_BLUE', 'VANG_KEM_BONG', 'XANH_NGOC_BONG', 'XAM_LONG_CHUOT', 'XANH_LA_CAY',
  'DEN_XINGFA', 'NAU_XINGFA', 'XAM_XINGFA', 'XANH_DUONG', 'XANH_NGOC', 'VANG_KEM',
  'KEM_SUA', 'GHI_SAN', 'XAM_MO', 'DO_DO', 'VAN_GO',
  'XN', 'GS', 'VK', 'CF', 'XF', 'XLC', 'MSK', 'STD',
  'KEM', 'THO', 'TRANG', 'DEN', 'XAM', 'NAU', 'CAM',
];

/** Token cách bán — nhồi vào mã là dựng lại Sales Option qua cửa sau. */
const SALES_MODE_TOKENS = ['TRONBO', 'TRON-BO', 'TACHMON', 'TACH-MON', 'CHILA', 'CHI-LA'];

/** Tiền tố cũ vô nghĩa: 275/477 mã mang `TP-` trong khi chỉ 139 mã thật sự là thành phẩm. */
const LEGACY_PREFIXES = ['TP', 'NVL', 'HH', 'LK', 'JG', 'RONNHUA'];

/**
 * Token NHÀ CUNG CẤP phải rời khỏi mã — §2 luật 4: "tiền tố nói món đó LÀ GÌ, không nói nó
 * đến từ đâu hay ai bán". `TD` là TIẾN ĐẠT, `ALD`/`ALUM` là nhà cung cấp nhôm.
 * Ví dụ chốt trong `QUY-UOC-MA §5`: `TP-TD-AL595` ⇒ `NHOM-AL595`.
 */
const SUPPLIER_TOKENS = ['TD', 'ALD', 'ALUM'];

/**
 * Token thừa sau khi đã có tiền tố chuẩn.
 *
 * `MT` dưới `MOTO` là nói hai lần cùng một chuyện, và `KG` là đơn vị chứ không phải danh tính
 * — ví dụ chốt của tài liệu: `TP-MT-TANKER600KG` ⇒ `MOTO-TANKER-600`. Chỉ bỏ khi tiền tố đã
 * mang đúng nghĩa đó, không bỏ mù quáng.
 */
const REDUNDANT_BY_PREFIX = new Map([
  ['MOTO', { tokens: ['MT', 'MOTOR'], trailingUnit: /KG$/ }],
  ['PIN', { tokens: ['BINH'], trailingUnit: null }],
  ['TRUC', { tokens: [], trailingUnit: null }],
]);

const stripDiacritics = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[đĐ]/g, 'D');

/** Chuẩn hoá về bảng chữ cho phép của §2, giữ nguyên dấu chấm trong số đo. */
export function normalizeCodeText(value) {
  return stripDiacritics(value)
    // `m²` phải thành `M2` TRƯỚC bộ lọc bảng chữ. Nếu không, `²` biến thành gạch nối và bậc
    // diện tích `4-5m²` sống sót dưới dạng `4-5M` — luật bỏ bậc không nhận ra nó nữa.
    .replace(/²/g, '2')
    .toUpperCase()
    .replace(/[_\s,()]+/g, '-')
    .replace(/[^A-Z0-9.\-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

const dropTokens = (text, tokens) => {
  let out = text;
  for (const token of tokens) {
    const t = normalizeCodeText(token);
    if (!t) continue;
    out = out.replace(new RegExp(`(^|-)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=(-|$))`, 'g'), '');
    out = out.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  }
  return out;
};

/** Bậc diện tích: `3-4M2`, `>10M2`, `4-5M²`. */
const dropAreaTier = (text) => text
  .replace(/(^|-)>?\d+(-\d+)?M2(?=(-|$))/g, '')
  .replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

const dropLegacyPrefix = (text) => {
  for (const legacy of LEGACY_PREFIXES) {
    if (text.startsWith(`${legacy}-`)) return text.slice(legacy.length + 1);
  }
  return text;
};

/** Tiền tố theo nhóm, rồi mới tới luật nhìn tên. Không suy được thì trả null kèm lý do. */
export function resolveCodePrefix(item) {
  const group = String(item?.item_group ?? '').trim();
  const haystack = `${item?.item_code ?? ''} ${item?.item_name ?? ''}`;
  if (String(item?.item_nature ?? '').trim() === 'Dịch vụ') {
    return { prefix: 'DV', why: 'item_nature = Dịch vụ' };
  }
  // Thứ tự có chủ đích: dòng sản phẩm → luật tên → nhóm cấu kiện.
  const byProductLine = PRODUCT_LINE_GROUP_PREFIX.get(group);
  if (byProductLine) return { prefix: byProductLine, why: `dòng sản phẩm "${group}"` };
  for (const rule of NAME_OVERRIDES) {
    if (rule.test.test(haystack)) return { prefix: rule.prefix, why: rule.why };
  }
  const byComponent = COMPONENT_GROUP_PREFIX.get(group);
  if (byComponent) return { prefix: byComponent, why: `nhóm cấu kiện "${group}"` };
  return {
    prefix: null,
    why: group
      ? `nhóm "${group}" chưa có luật tiền tố và tên không chỉ ra loại`
      : 'mặt hàng không có nhóm hàng',
  };
}

/**
 * Mã chuẩn của một mặt hàng.
 *
 * `warnings` không phải trang trí: nó ghi lại đúng những gì đã bị bỏ khỏi mã, để người duyệt
 * thấy được cái gì mất đi chứ không chỉ thấy mã mới.
 */
export function canonicalItemCode(item) {
  const original = String(item?.item_code ?? '').trim();
  const { prefix, why } = resolveCodePrefix(item);
  const warnings = [];

  let body = normalizeCodeText(original);
  const beforeColor = body;
  body = dropTokens(body, COLOR_TOKENS);
  if (body !== beforeColor) warnings.push('bỏ token màu');

  const beforeMode = body;
  body = dropTokens(body, SALES_MODE_TOKENS);
  if (body !== beforeMode) warnings.push('bỏ cách bán');

  const beforeTier = body;
  body = dropAreaTier(body);
  if (body !== beforeTier) warnings.push('bỏ bậc diện tích');

  body = dropLegacyPrefix(body);
  for (const p of ALUMDOOR_CODE_PREFIXES) {
    if (body === p || body.startsWith(`${p}-`)) { body = body.slice(p.length).replace(/^-/, ''); break; }
  }

  const beforeSupplier = body;
  /**
   * Token nhà cung cấp chỉ bị gỡ khi nó đứng ĐẦU — không bao giờ ở đuôi.
   *
   * `TD` nhập nhằng: đứng đầu là TIẾN ĐẠT (`TP-TD-AL595` ⇒ `NHOM-AL595`, ví dụ chốt của §5),
   * nhưng đứng cuối là **TỰ DỪNG** — `NVL-TOLE1.4x270x1.4ly-CRON+TD` tên đầy đủ là
   * "RAY SẮT U100-1.4ly (CÓ RON+TỰ DỪNG)". Gỡ nó ở đuôi là gộp hai mặt hàng KHÁC NHAU về một
   * mã và làm mất hẳn một biến thể sản phẩm. Bảng ánh xạ bắt được đúng chỗ này.
   */
  for (const token of SUPPLIER_TOKENS) {
    const leading = new RegExp(`^${token}(?=-)`);
    if (leading.test(body)) { body = body.replace(leading, '').replace(/^-/, ''); break; }
  }
  /**
   * Token DÍNH LIỀN, không có gạch nối: `NVL_TDAL595THO`.
   *
   * Nguồn xưởng viết cả ba kiểu cho cùng một thứ — `NVL-AL595-GS`, `TD-AL595`, và
   * `NVL_TDAL595THO`. Chỉ cắt theo gạch nối thì kiểu thứ ba sống sót thành một mã riêng, và
   * việc gộp năm-mã-về-một của §5 hụt mất một cái. Chỉ gỡ khi phần còn lại vẫn có nghĩa.
   */
  for (const token of SUPPLIER_TOKENS) {
    const glued = new RegExp(`^${token}(?=[A-Z]{2})`);
    if (glued.test(body)) { body = body.replace(glued, ''); break; }
  }
  for (const token of COLOR_TOKENS) {
    const t = normalizeCodeText(token);
    if (t.length < 3) continue;
    const glued = new RegExp(`(?<=[A-Z0-9]{3})${t}$`);
    if (glued.test(body)) { body = body.replace(glued, '').replace(/-$/, ''); break; }
  }
  if (body !== beforeSupplier) warnings.push('bỏ token nhà cung cấp/màu dính liền');

  if (!prefix) return { original, code: null, prefix: null, why, warnings, body };

  const redundant = REDUNDANT_BY_PREFIX.get(prefix);
  if (redundant) {
    const beforeRedundant = body;
    body = dropTokens(body, redundant.tokens);
    if (redundant.trailingUnit) body = body.replace(redundant.trailingUnit, '').replace(/-$/, '');
    if (body !== beforeRedundant) warnings.push('bỏ token trùng nghĩa với tiền tố');
  }
  const code = body ? `${prefix}-${body}` : prefix;
  if (code.length > ALUMDOOR_CODE_MAX_LENGTH) warnings.push(`dài ${code.length} > ${ALUMDOOR_CODE_MAX_LENGTH}`);
  return { original, code, prefix, why, warnings, body };
}

/** Mã có tuân thủ đủ bốn luật cứng §2 không. */
export function violatesCodeConvention(code) {
  const text = String(code ?? '');
  const problems = [];
  if (/\s/.test(text)) problems.push('có khoảng trắng');
  if (/[a-z]/.test(text)) problems.push('có chữ thường');
  if (/[_(),]/.test(text)) problems.push('có _ ( ) hoặc ,');
  if (text !== stripDiacritics(text)) problems.push('có dấu tiếng Việt');
  if (text.length > ALUMDOOR_CODE_MAX_LENGTH) problems.push(`dài ${text.length} ký tự`);
  const prefix = text.split('-')[0];
  if (!ALUMDOOR_CODE_PREFIXES.includes(prefix)) problems.push(`tiền tố "${prefix}" ngoài 10 tiền tố chuẩn`);
  return problems;
}

/**
 * Bảng ánh xạ cho cả danh mục, kèm gom họ mã.
 *
 * Nhiều mã cũ gộp về một mã mới là ĐÍCH chứ không phải lỗi — `QUY-UOC-MA §5` nêu chính ví dụ
 * đó: năm mã `AL595` khác nhau chỉ vì màu gộp về một `NHOM-AL595`. Nhưng gộp phải CỐ Ý, nên
 * mỗi họ được liệt kê đầy đủ mã nguồn để người duyệt nhìn thấy cái gì đang bị gộp.
 */
/**
 * Gộp có AN TOÀN không — phân biệt "chỉ khác màu" với "khác cấu phần".
 *
 * Gộp năm mã `AL595` khác màu về một là ĐÍCH (§5). Nhưng gộp `...-TRONBO` với `...-TACHMON`
 * thì KHÔNG: đo trên D1 19/08, `TP-LUOI-SN13x26-STD - TRONBO` có BOM Template **5 cấu phần**
 * còn bản `- TACHMON` chỉ có **1**. Hai bộ cấu phần khác nhau thật.
 *
 * Nguyên nhân gốc: khi `Sales Package` bị khai tử, fact "phạm vi cấu phần được giao" không có
 * chỗ nào trên dòng bán nên nó bò vào MÃ HÀNG. Bỏ token đó khỏi mã trước khi `sales_mode` và
 * BOM biết phân giải theo nó là làm mất luôn phần trọn bộ.
 *
 * Cùng lý do với bậc diện tích: các biến thể `3-4m²` … `>10m²` của `TP-TOLEKEM124_6D` có
 * template 4 hoặc 8 cấu phần khác nhau.
 */
const STRUCTURAL_DROPS = new Set(['bỏ cách bán', 'bỏ bậc diện tích']);

function mergeSafety(group) {
  const structural = group.filter((row) => row.warnings.some((w) => STRUCTURAL_DROPS.has(w)));
  if (!structural.length) return { safe: true, reason: 'chỉ khác màu hoặc nhà cung cấp' };
  if (structural.length === group.length && group.length > 1) {
    return { safe: false, reason: 'gộp nhiều biến thể cách giao/bậc diện tích — mỗi biến thể có thể có BOM riêng' };
  }
  return { safe: false, reason: 'gộp bản trọn bộ với bản thường — hai bộ cấu phần khác nhau' };
}

export function buildCodeMapping(items) {
  const rows = items.map((item) => ({ item, ...canonicalItemCode(item) }));
  const families = new Map();
  for (const row of rows) {
    if (!row.code) continue;
    if (!families.has(row.code)) families.set(row.code, []);
    families.get(row.code).push(row);
  }
  const unresolved = rows.filter((row) => !row.code);
  const merged = [...families.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([code, group]) => [code, group, mergeSafety(group)]);
  const unsafeMerges = merged.filter(([, , safety]) => !safety.safe);
  return {
    rows,
    families,
    unresolved,
    merged,
    unsafeMerges,
    summary: {
      source_count: rows.length,
      canonical_count: families.size,
      merged_families: merged.length,
      absorbed: merged.reduce((sum, [, group]) => sum + group.length - 1, 0),
      unresolved_count: unresolved.length,
      too_long: rows.filter((row) => row.code && row.code.length > ALUMDOOR_CODE_MAX_LENGTH).length,
      /** Số họ KHÔNG được gộp cho tới khi BOM phân giải theo `sales_mode` thay vì theo mã. */
      unsafe_merges: unsafeMerges.length,
    },
  };
}
