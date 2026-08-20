const clean = (value) => String(value ?? '').normalize('NFC').trim();

function normalizedCode(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/** Hai giá trị của `sales_mode` — đúng bằng options của cột Select trên BOM Template. */
export const SALES_MODE_FULL_SET = 'Trọn bộ';
export const SALES_MODE_SPLIT = 'Tách món';

/**
 * `source_status` của template cấu thành BÁN HÀNG — phải nằm trong options của brief.
 *
 * `generic-controller.ts:170` ném "must be one of the configured options" khi giá trị Select
 * lạ, kể cả Administrator (`normalizeValue` không có cửa admin). Trước 2026-08-19 brief chỉ khai
 * `Select(READY,READY_WITH_ACTUALS,DEFERRED)` nên MỌI template cấu thành bị nền tảng từ chối ở
 * POST đầu tiên — 0 bản ghi tồn tại, và bộ kiểm `alumdoor-sales-bom-composition-import.test.mjs`
 * không thấy vì nó chỉ so chuỗi trong bộ nhớ. `COMPOSITION` đã được thêm vào brief cùng đợt này;
 * `import-alumdoor-sales-bom-composition-local.mjs` chặn trước khi xoá nếu D1 chưa có nó.
 */
export const SALES_BOM_COMPOSITION_STATUS = 'COMPOSITION';

/** Mọi trường mà một bản ghi COMPOSITION ghi tới. Thiếu một cái là POST 4xx. */
const COMPOSITION_REQUIRED_FIELDS = [
  'sales_mode',
  'template_code',
  'item_code',
  'conditions_json',
  'source_status',
  'required_context_fields_json',
  'required_component_keys_json',
  'deferred_components_json',
  'component_rules',
];

/**
 * D1 có đủ sức nhận bản COMPOSITION chưa — hàm THUẦN, để chốt chặn kiểm được bằng bài kiểm.
 *
 * Vì sao phải chặn: `import-alumdoor-sales-bom-composition-local.mjs` XOÁ SẠCH Bill of Materials
 * và BOM Template rồi mới POST lại. Nền tảng thì TỪ CHỐI chứ không nuốt — trường lạ ném
 * `Unknown field ...` (frappe-model/src/generic-controller.ts:79), giá trị Select ngoài options
 * ném `... must be one of the configured options` (~170), kể cả Administrator. Chạy trên một D1
 * chưa triển khai brief mới thì POST đầu tiên hỏng và D1 còn lại 0 template + 0 định mức.
 *
 * Trả DANH SÁCH thiếu thay vì ném, để người gọi ghép được một câu lỗi duy nhất.
 */
export function bomTemplateMetaCompositionGaps(meta) {
  const fields = Array.isArray(meta?.fields) ? meta.fields : [];
  if (!fields.length) return ['không đọc được meta của BOM Template'];
  const byName = new Map(fields.map((field) => [clean(field?.fieldname), field]));
  const gaps = COMPOSITION_REQUIRED_FIELDS
    .filter((fieldname) => !byName.has(fieldname))
    .map((fieldname) => `thiếu cột \`${fieldname}\``);
  const options = String(byName.get('source_status')?.options ?? '')
    .split('\n').map((entry) => entry.trim()).filter(Boolean);
  if (!options.includes(SALES_BOM_COMPOSITION_STATUS)) {
    gaps.push(`\`source_status\` chưa có lựa chọn \`${SALES_BOM_COMPOSITION_STATUS}\` (đang có: ${options.join(', ') || '<không đọc được options>'})`);
  }
  return gaps;
}

/**
 * Token cách giao còn sót trong MÃ HÀNG — bảng này là ĐƯỜNG LUI, không phải nguồn sự thật.
 *
 * ĐO LẠI 2026-08-19 bằng chính `scripts/lib/alumdoor-source-markdown.mjs` trên nguồn gốc
 * `ms-lien/ĐM.md` (2.115 dòng; mã cha = ô [3] của dòng có ô [1] STT):
 *
 *   358  mã cha phân biệt
 *   100  mã cha nhồi cách giao = 94 `TRONBO` + 2 `TACHMON` + 4 hậu tố ` - TM`
 *   258  mã cha KHÔNG mang cách giao
 *   235  mã cấu phần (ô [3] của dòng con), trong đó **0 mã** mang cách giao
 *   569  mã phân biệt của `ĐM.md` + `app-vat-tu/BaoCao.md` gộp lại, cũng đúng 100 mã có cách giao
 *
 * Bốn mã ` - TM` (không viết `TACHMON`): `TP-LUOI-MV-STD - TM`, `TP-LUOI-SN-STD - TM`,
 * `TP-LUOI-SNPHI19-INOX - TM`, `TP-LUOIMV-INOX- TM`.
 *
 * Con số cũ ghi ở đây (81 + 2 + 3 = 86/355, và "tính cả mã cấu phần thì là 100") SAI hai chỗ:
 * đếm sót, và dán nhãn sai — 100 KHÔNG phải "kể cả cấu phần", vì 0/235 mã cấu phần mang cách
 * giao. 86 và 100 là hai lần đếm CÙNG một tập mã cha, không phải hai tập khác nhau.
 *
 * Vì sao phải liệt kê `TM`: thiếu nó thì 4 mã tách món bị đọc thành "không có cách giao" và
 * BOM tách món của chúng không bao giờ sinh ra template. Đó là mất dữ liệu im lặng.
 * `TM` chỉ được nhận ở CUỐI mã, và đo trên 569 mã thì đúng 4 mã kết thúc bằng `TM` — cả 4 đều
 * là tách món, không có mã nào trúng oan.
 */
const SALES_MODE_CODE_TOKENS = [
  { token: 'TRONBO', mode: SALES_MODE_FULL_SET },
  { token: 'TACHMON', mode: SALES_MODE_SPLIT },
  { token: 'CHILA', mode: SALES_MODE_SPLIT },
];

/** Hậu tố `- TM` chỉ tính khi nó đứng CUỐI mã: `TM` giữa mã là chữ khác, không phải cách giao. */
const SPLIT_MODE_SUFFIX = /TM$/;

/**
 * Suy cách giao TỪ MÃ HÀNG. Chỉ dùng khi bản ghi chưa khai `sales_mode`.
 *
 * Đây chính là thứ phải biến mất: khi 100 mã nhồi cách giao được gộp về mã sạch, mã không còn
 * token nào để dò và hàm này trả `null` cho tất cả. Nên nó KHÔNG được là đường duy nhất —
 * `resolveSalesMode` hỏi trường khai báo trước.
 */
export function salesModeFromItemCode(itemCode) {
  const normalized = normalizedCode(itemCode);
  if (!normalized) return null;
  for (const { token, mode } of SALES_MODE_CODE_TOKENS) {
    if (normalized.includes(token)) return mode;
  }
  return SPLIT_MODE_SUFFIX.test(normalized) ? SALES_MODE_SPLIT : null;
}

/**
 * Giữ lại cho bộ nhập cũ và bản kiểm cũ. Ý nghĩa hẹp: "MÃ này có nói trọn bộ không".
 *
 * KHÔNG dùng nó để quyết định nghiệp vụ nữa — dùng `resolveSalesMode(bom)`, thứ đọc được cả
 * trường khai báo. Hàm này chỉ còn là một lát cắt của bảng token ở trên.
 */
export function isFullSetCompositionParent(itemCode) {
  return salesModeFromItemCode(itemCode) === SALES_MODE_FULL_SET;
}

function assertKnownMode(mode, label) {
  if (mode === SALES_MODE_FULL_SET || mode === SALES_MODE_SPLIT) return mode;
  throw new Error(`${label}: cách giao "${mode}" không thuộc {${SALES_MODE_FULL_SET}, ${SALES_MODE_SPLIT}}; hệ thống không đoán.`);
}

/**
 * Cách giao của một khối BOM, kèm BẰNG CHỨNG lấy từ đâu.
 *
 * Thứ tự cố ý: trường khai báo thắng mã hàng. Mã hàng là khoá bản ghi chứ không phải chỗ khai
 * fact; khi mã được gộp lại thì trường khai báo là thứ duy nhất còn sống.
 *
 * Khai báo LỆCH với mã thì NÉM LỖI chứ không chọn bên nào — cùng kỷ luật với
 * `bom-template-materializer.ts` khi cột `sales_mode` lệch `conditions_json`.
 */
export function resolveSalesMode(bom) {
  const itemCode = clean(bom?.item ?? bom?.item_code);
  const declared = clean(bom?.sales_mode);
  const derived = salesModeFromItemCode(itemCode);
  if (!declared) return { mode: derived, evidence: derived ? 'suy từ mã hàng' : null };
  assertKnownMode(declared, itemCode || 'BOM');
  if (derived && derived !== declared) {
    throw new Error(`${itemCode}: cách giao khai hai nơi lệch nhau — trường sales_mode là "${declared}", mã hàng nói "${derived}". Sửa một chỗ; hệ thống không đoán.`);
  }
  return { mode: declared, evidence: 'khai trên bản ghi' };
}

/** Dấu tách khoá. Xem `salesModeTemplateCode` để biết vì sao là `#`. */
export const SALES_MODE_KEY_SEPARATOR = '#';

/**
 * Khoá của BOM Template khi một mặt hàng giữ HAI định mức.
 *
 * VÌ SAO PHẢI TÁCH KHOÁ — lý do THẬT, đã kiểm lại trong repo:
 *  1. `import-alumdoor-bom-template-local.mjs` gom bản ghi đã có vào `existingByCode` khoá theo
 *     `template_code`. Hai template cùng khoá rơi vào cùng một rổ, và phép kiểm cuối file đòi
 *     ĐÚNG MỘT bản đang dùng khớp mỗi khoá ⇒ bản thứ hai luôn bị đọc là "trùng".
 *  2. `bom-template-core.ts` gắn nhãn xung đột bằng `template_code` (`templateConflictLabel`),
 *     nên hai template cùng khoá cho ra thông báo lỗi không phân biệt được bản nào.
 *
 * KHÔNG phải vì "nền tảng từ chối bản thứ hai". Cờ `unique` (dấu `*` trong `template_code:Data*!`)
 * chỉ được PHÂN TÍCH (`frappe-model/src/validate.ts:220`) và phơi ra cho client
 * (`frappe-api/src/meta-shape.ts:43`) — tìm khắp `packages/` không có chỗ nào đọc nó lúc ghi.
 * Ràng buộc DUY NHẤT thật sự trong `migrations/tenant/0001_core.sql` chỉ là
 * `UNIQUE (tenant_id, doctype, name)`, mà `BOM Template.naming = "autoincrement"` nên `name`
 * là số tự tăng, không liên quan `template_code`.
 *
 * Hậu tố `#` được chọn vì nó KHÔNG có trong bất kỳ mã nguồn nào (đo trên 569 mã phân biệt của
 * `ĐM.md` + `app-vat-tu/BaoCao.md`: 0 mã chứa `#`), nên tách khoá không bao giờ nhập nhằng với
 * một phần của chính mã hàng.
 *
 * Không có cách giao thì GIỮ NGUYÊN mã cũ — 258/358 mã cha không mang cách giao, đổi khoá của
 * chúng là churn vô ích trên bản ghi đã khai.
 */
export function salesModeTemplateCode(itemCode, mode) {
  const base = clean(itemCode);
  if (!mode) return base;
  return `${base}${SALES_MODE_KEY_SEPARATOR}${normalizedCode(assertKnownMode(mode, base || 'BOM'))}`;
}

/**
 * Cách giao chỉ được LÊN BẢN GHI khi nó thật sự phân biệt hai bản ghi của CÙNG một mặt hàng.
 *
 * Đây là chốt chặn quan trọng nhất của cả luồng, và nó sửa một lỗi chặn vận hành đo được:
 *
 * Ghi `sales_mode` lên MỌI template có cách giao thì `parseBomTemplateRecord` gộp cột vào
 * `conditions` (bom-template-materializer.ts:228), biến `conditions` từ RỖNG thành
 * `{sales_mode:"Tách món"}` cho 6 mã tách món. Mà dòng bán để trống Cách giao thì worker bơm
 * `"Trọn bộ"` (sales-production-core.ts:784/967/1200) ⇒ `matchesConditions` loại template ⇒
 * `chooseTemplate` hết ứng viên ⇒ NÉM "BOM Template của … không khớp cấu hình: sales_mode cần
 * Tách món, hiện Trọn bộ". Đã chạy thật: bản CŨ (không cột) dựng BOM bình thường, bản ghi cột
 * thì THROW. Sáu mã trúng: TP-LUOI-MV-STD - TM, TP-LUOI-SN-STD - TM, TP-LUOI-SNPHI19-INOX - TM,
 * TP-LUOIMV-INOX- TM, TP-LUOI-SN13x26-STD - TACHMON, TP-LUOI-SN13x26-INOX - TACHMON.
 *
 * Với dữ liệu HÔM NAY, mỗi cách giao vẫn là một MÃ HÀNG riêng, nên không mặt hàng nào có hai
 * cách giao và hàm này trả `shared` RỖNG: 0/100 template khai cột, 0 khoá bị đổi, 0 vân tay BOM
 * bị mất dấu. Cột và khoá tách chỉ bật lên đúng lúc gộp mã làm hai định mức về chung một
 * `item_code` — tức đúng lúc chúng là thứ DUY NHẤT phân biệt được hai bản ghi.
 */
export function salesModeTemplateKeys(boms) {
  const modesByItem = new Map();
  for (const bom of Array.isArray(boms) ? boms : []) {
    const item = clean(bom?.item ?? bom?.item_code);
    if (!item) continue;
    const { mode } = resolveSalesMode(bom);
    if (!mode) continue;
    const set = modesByItem.get(item) ?? new Set();
    set.add(mode);
    modesByItem.set(item, set);
  }
  const shared = new Set([...modesByItem].filter(([, modes]) => modes.size > 1).map(([item]) => item));
  const declaredMode = (bom) => {
    const item = clean(bom?.item ?? bom?.item_code);
    if (!shared.has(item)) return null;
    return resolveSalesMode(bom).mode;
  };
  return {
    shared,
    /** Cách giao ĐƯỢC KHAI lên bản ghi — `null` khi mặt hàng chỉ có một định mức. */
    declaredMode,
    /** `template_code` của khối này trong đúng lô đang nhập. */
    templateCode: (bom) => salesModeTemplateCode(clean(bom?.item ?? bom?.item_code), declaredMode(bom)),
  };
}

export function buildSalesBomCompositionTemplates(source) {
  if (!['alumdoor-canonical-bom-importable/v1', 'alumdoor-canonical-bom-importable/v2'].includes(source?.format)
    || !Array.isArray(source.boms)) {
    throw new Error('Expected alumdoor-canonical-bom-importable/v1 or /v2');
  }

  const templates = [];
  const seenParents = new Set();
  const keys = salesModeTemplateKeys(source.boms);
  for (const bom of source.boms) {
    const parent = clean(bom?.item);
    const { mode } = resolveSalesMode(bom);
    // Không suy được cách giao ⇒ khối này không phải danh sách cấu thành bán hàng.
    if (!mode) continue;
    // `mode` dùng để LỌC và để chống trùng; `declaredMode` mới là thứ được ghi lên bản ghi —
    // xem `salesModeTemplateKeys`: khai cách giao cho mặt hàng chỉ có một định mức là tự chặn
    // chính mình.
    const declaredMode = keys.declaredMode(bom);
    const templateCode = salesModeTemplateCode(parent, declaredMode);
    if (!parent) throw new Error('Sales BOM composition has a blank parent Item');
    // Khoá trùng lặp phải là (mặt hàng, cách giao), không phải mặt hàng: một mặt hàng được
    // phép có hai danh sách cấu thành, đó chính là mục đích của `sales_mode`.
    const parentKey = `${parent}#${mode}`;
    if (seenParents.has(parentKey)) throw new Error(`Sales BOM composition has duplicate parent Item ${parent} (${mode})`);
    seenParents.add(parentKey);

    const lines = Array.isArray(bom?.lines) ? bom.lines : [];
    if (!lines.length) throw new Error(`${parent}: sales BOM composition has no child Item`);
    const componentRules = lines.map((line, index) => {
      const itemCode = clean(line?.item_code);
      if (!itemCode) throw new Error(`${parent}: component ${index + 1} has a blank Item code`);
      const componentKey = `ROW-${String(index + 1).padStart(3, '0')}`;
      return {
        // Khoá cấu phần phải theo TEMPLATE, không theo mặt hàng: một mặt hàng hai định mức thì
        // `${parent}:ROW-001` lặp ở cả hai template — hai luật khác nội dung mang cùng một mã.
        // `rule_code` là khoá trần trong `component_mappings` của
        // `build-alumdoor-bom-rule-importable.mjs`, nên trùng ở đó là gộp nhầm hai luật.
        rule_code: `${templateCode}:${componentKey}`,
        component_key: componentKey,
        item_code: itemCode,
        priority: 0,
        sequence: index + 1,
        quantity_formula_json: JSON.stringify({
          kind: 'DEFERRED',
          reason: 'sales_composition_only',
          source_value: line?.source_value ?? null,
          source_formula: line?.source_formula_text ?? line?.quantity_formula_json ?? null,
        }),
        source_row: Number.isFinite(Number(line?.source_row)) ? Number(line.source_row) : undefined,
        source_uom: clean(line?.source_uom) || undefined,
        source_formula: clean(line?.source_formula_text),
      };
    });
    const requiredKeys = componentRules.map((row) => row.component_key);
    templates.push({
      doctype: 'BOM Template',
      template_code: templateCode,
      item_code: parent,
      /**
       * Khai cách giao ở CẢ cột lẫn `conditions_json`, cố ý và bắt buộc trùng nhau —
       * NHƯNG CHỈ KHI cách giao thật sự phân biệt hai bản ghi của cùng mặt hàng.
       *
       * Cột để chủ xưởng chọn được trên màn hình; `conditions_json` để luật chọn template
       * (specificity → priority → modified) đếm được nó là MỘT điều kiện.
       * `bom-template-materializer.ts` gộp hai chỗ và NÉM LỖI nếu lệch, nên viết cả hai là an
       * toàn — còn viết một chỗ thì nửa cơ chế kia im lặng bỏ qua.
       *
       * Mặt hàng một định mức thì để trống cả hai: thêm điều kiện vào một template không có
       * đối thủ chỉ có thể LOẠI nó khỏi ngữ cảnh, không bao giờ chọn đúng hơn. Xem
       * `salesModeTemplateKeys` để biết đã đo được nó chặn đúng 6 mã nào.
       */
      ...(declaredMode ? { sales_mode: declaredMode } : {}),
      conditions_json: JSON.stringify(declaredMode
        ? { item_code: parent, sales_mode: declaredMode }
        : { item_code: parent }),
      // `sales_mode` chỉ được đòi khi template ĐÃ được chọn, mà muốn được chọn thì ngữ cảnh
      // buộc phải có `sales_mode` khớp (`matchesConditions` loại template thiếu ngữ cảnh).
      // Nên dòng này không bao giờ ném oan; nó chỉ ghi rõ hợp đồng lên bản ghi.
      required_context_fields_json: JSON.stringify(declaredMode ? ['item_code', 'sales_mode'] : ['item_code']),
      required_component_keys_json: JSON.stringify(requiredKeys),
      source_status: SALES_BOM_COMPOSITION_STATUS,
      source_ref: clean(bom?.source_ref) || clean(source?.source?.workbook) || clean(source?.source),
      deferred_components_json: JSON.stringify(lines),
      component_rules: componentRules,
      note: `Danh sách cấu thành dùng trên đơn bán hàng, cách giao "${mode}"; SL, ĐVT bán và kích thước được tính từ dòng thành phẩm cha, không dùng định mức sản xuất.`,
    });
  }

  templates.sort((left, right) => left.item_code.localeCompare(right.item_code, 'vi')
    || clean(left.sales_mode).localeCompare(clean(right.sales_mode), 'vi'));
  return templates;
}

function normalizedRule(rule) {
  return {
    component_key: clean(rule?.component_key),
    item_code: clean(rule?.item_code),
    sequence: Number(rule?.sequence) || 0,
  };
}

/**
 * Chữ ký để so "bản đã ghi có còn đúng không".
 *
 * `sales_mode` PHẢI nằm trong chữ ký: hai template cùng mặt hàng, cùng danh sách cấu phần mà
 * khác cách giao là HAI bản ghi khác nhau. Thiếu nó thì bộ nhập coi chúng là một và cho một
 * bản nghỉ hưu nhầm — mất đúng phần vừa dựng lên.
 *
 * Ghi cả `sales_mode` lẫn `conditions` dù hai chỗ phải trùng: nếu một bản ghi cũ lệch giữa hai
 * chỗ thì chữ ký phải khác để bộ nhập ghi đè, chứ không im lặng chấp nhận.
 */
export function salesBomCompositionSignature(template) {
  return JSON.stringify({
    template_code: clean(template?.template_code),
    item_code: clean(template?.item_code),
    sales_mode: clean(template?.sales_mode),
    source_status: clean(template?.source_status),
    conditions: JSON.parse(clean(template?.conditions_json) || '{}'),
    required_component_keys: JSON.parse(clean(template?.required_component_keys_json) || '[]'),
    components: (Array.isArray(template?.component_rules) ? template.component_rules : [])
      .map(normalizedRule)
      .sort((left, right) => left.sequence - right.sequence || left.component_key.localeCompare(right.component_key, 'vi')),
  });
}
