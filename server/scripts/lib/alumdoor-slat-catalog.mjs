/**
 * Danh mục `Quy cách cửa` — bản lá theo mã nhôm.
 *
 * BRD gọi bảng này là "bảng quyết định sinh tử" (apps/alumdoor/docs/BRD.md §4.1) và khai nó
 * là một danh mục có PK `ma`. Trước 2026-08-19 nó là hằng `SLAT_PROFILES` nằm trong
 * `server/apps-src/alumdoor-worker/src/slats.ts` — tức chủ xưởng không thêm được mã lá mới,
 * không sửa được bản lá, và hai trường mà BRD đòi (`rong_toi_da_mm`, `trong_luong_kg_m2`)
 * không có chỗ nào để tồn tại. Điều đó vi phạm thẳng luật §4.2 của BRD-v2:
 * "mọi field chọn-1-trong-danh-sách mà admin tự cấu hình được PHẢI là doctype riêng, cấm hardcode".
 *
 * ═══ HAI CỘT, KHÔNG PHẢI MỘT ═══
 *
 * `buoc_la_m` (ước số CHIA) và `be_rong_nan_mm` (bề rộng nan, chỉ để nhận diện mã và tra giá)
 * là hai đại lượng khác nhau. BRD cảnh báo nguyên văn: "lấy nhầm là lệch tới 2 lá mỗi bộ".
 * Bảng giá gọi `AL70` là "bản lá 70" theo bề rộng nan, nhưng chia lá phải dùng 0,068.
 *
 * ═══ NGUỒN ═══
 *
 * `buoc_la_m` + `tru_mot_la`: chép từ SLAT_PROFILES đang thi hành, vốn đã có 11 test ghim số
 *   (server/tests/slats.test.mjs) và mang bốn quyết định đã chốt khi hai tài liệu xưởng
 *   nói khác nhau. Đây là nguồn ĐANG TÍNH RA TIỀN, nên nó là nguồn của danh mục.
 * `be_rong_nan_mm`: sheet `GHI CHÚ` (MS LIÊN BS.xlsx), cột [3], qua raw extract
 *   apps/alumdoor/docs/nguon/ms-lien/GHI-CHÚ.md.
 *
 * ═══ HAI TRƯỜNG CỐ Ý ĐỂ TRỐNG ═══
 *
 * `rong_toi_da_mm` và `trong_luong_kg_m2`: BRD khai chúng, nhưng KHÔNG nguồn nào trong repo
 * cho con số theo từng mã — BRD chỉ nêu dải 4.000 → 7.600 cho cả bảng. Điền một con số đại
 * diện vào đây là lặp lại đúng lỗi mà chính BRD đã bắt: bản cũ tự đặt ngưỡng đầu thừa
 * 0,25 m rồi tự ghi "con số đó em bịa". Để trống, và luật chặn bán bỏ qua mã chưa có số.
 */

/**
 * Đời sản phẩm nằm trong CHÍNH mã tra công thức, không phải một cột riêng: `profileKey()`
 * ghép mã kho với cột TÌNH TRẠNG thành `AL548N` / `AL548 (CŨ)`. Danh mục giữ đúng khoá đó
 * để tra cứu không phải dịch lại lần nữa.
 */
export const ALUMDOOR_SLAT_CATALOG = Object.freeze([
  { ma: "AL71N", buoc_la_m: 0.055, be_rong_nan_mm: 57, tru_mot_la: false, doi: "MỚI", dong_cua: "Cửa Đức",
    ghi_chu: "Bản lá 0,055 theo cột BẢN LÁ, ĐẢO LẠI quyết định 0,057 ngày 2026-08-15. Sổ nhật ký phân xử: TP LÁ RUỘT AL71N VK — AL71 9 LÁ RUỘT cao 0,495 m ⇒ 0,495/9 = 0,055. Cột [3] và [4] của sheet nguồn đều ghi 57; sổ tiền đã thu thắng bảng tra." },
  { ma: "AL71 (CŨ)", buoc_la_m: 0.055, be_rong_nan_mm: 55, tru_mot_la: false, doi: "CŨ", dong_cua: "Cửa Đức",
    ghi_chu: "AL71C. Không trừ 1 lá, theo đúng PDF công thức." },
  { ma: "AL70 (2 LỚP)", buoc_la_m: 0.068, be_rong_nan_mm: 68, tru_mot_la: false, doi: "MỚI", dong_cua: "Cửa Đức",
    ghi_chu: "KHÔNG trừ 1: đặc tả nêu ba ví dụ và cả ba đều cộng ra 42 lá. AL70 đếm TỔNG số lá nên không có gì để trừ. Bảng giá gọi mã này là 'bản lá 70' — đó là bề rộng nan, không phải ước số chia." },
  { ma: "AL70 (1 LỚP)", buoc_la_m: 0.068, be_rong_nan_mm: 68, tru_mot_la: false, doi: "MỚI", dong_cua: "Cửa Đức",
    ghi_chu: "Cùng bản lá với bản 2 lớp; khác nhau ở cấu tạo lá, không ở ước số chia." },
  { ma: "AL75", buoc_la_m: 0.067, be_rong_nan_mm: 67, tru_mot_la: true, doi: "MỚI", dong_cua: "Cửa Đức",
    ghi_chu: "AL75N trong sheet nguồn." },
  { ma: "AL595", buoc_la_m: 0.060, be_rong_nan_mm: 60, tru_mot_la: true, doi: "", dong_cua: "Cửa Đức",
    ghi_chu: "Sheet nguồn chỉ có một đời cho mã này." },
  { ma: "AL503N", buoc_la_m: 0.055, be_rong_nan_mm: 55, tru_mot_la: true, doi: "MỚI", dong_cua: "Cửa Đức" },
  { ma: "AL503 (CŨ)", buoc_la_m: 0.050, be_rong_nan_mm: 50, tru_mot_la: true, doi: "CŨ", dong_cua: "Cửa Đức" },
  { ma: "AL548N", buoc_la_m: 0.055, be_rong_nan_mm: 55, tru_mot_la: true, doi: "MỚI", dong_cua: "Cửa Đức",
    ghi_chu: "Ví dụ kiểm chứng của xưởng: CPB 3 m ⇒ raw 52,18 ⇒ 51 lá ruột." },
  { ma: "AL548 (CŨ)", buoc_la_m: 0.050, be_rong_nan_mm: 50, tru_mot_la: true, doi: "CŨ", dong_cua: "Cửa Đức",
    ghi_chu: "Chênh 10% so với đời MỚI — đây là lý do đời sản phẩm phải nằm trong khoá tra." },
  { ma: "AL501N", buoc_la_m: 0.057, be_rong_nan_mm: 57, tru_mot_la: true, doi: "MỚI", dong_cua: "Cửa Đức" },
  { ma: "AL501 (CŨ)", buoc_la_m: 0.050, be_rong_nan_mm: 50, tru_mot_la: true, doi: "CŨ", dong_cua: "Cửa Đức" },
  {
    ma: "AL552 (CŨ)", buoc_la_m: 0.057, be_rong_nan_mm: null, tru_mot_la: true, doi: "CŨ", dong_cua: "Cửa Đức",
    // ⚠️ CHƯA KHỚP NGUỒN — ghi lại thay vì tự sửa, vì sửa một ước số chia là đổi số lá thật.
    // Sheet GHI CHÚ có HAI dòng: AL552C = 50 / 0,05 và AL552N = 57 / 0,057.
    // SLAT_PROFILES chỉ có một khoá `AL552 (CŨ)` mang 0,057 — tức giá trị của đời MỚI gắn vào
    // đời CŨ, và đời MỚI thì không có khoá nào nên `profileKey("AL552","")` sẽ ném lỗi.
    // BRD §4.1 lại liệt `AL552` 56/0,057 trong nhóm 5 mã có hai số khác nhau.
    // Ba nguồn nói ba kiểu ⇒ để nguyên giá trị đang thi hành, bỏ trống bề rộng nan, và
    // chờ chủ xưởng chốt. Đừng "dọn cho gọn" chỗ này.
    ghi_chu: "CHỜ CHỦ XƯỞNG CHỐT: sheet nguồn ghi AL552C = 0,05 và AL552N = 0,057, nhưng bảng đang thi hành gắn 0,057 cho đời CŨ và không có đời MỚI. Giữ nguyên giá trị đang tính tiền cho tới khi có xác nhận.",
  },
  { ma: "AL652", buoc_la_m: 0.050, be_rong_nan_mm: 50, tru_mot_la: true, doi: "CŨ", dong_cua: "Cửa Đức",
    ghi_chu: "AL652C trong sheet nguồn." },
  { ma: "AL752", buoc_la_m: 0.050, be_rong_nan_mm: 50, tru_mot_la: true, doi: "CŨ", dong_cua: "Cửa Đức",
    ghi_chu: "AL752C trong sheet nguồn." },
  { ma: "AL50", buoc_la_m: 0.055, be_rong_nan_mm: 55, tru_mot_la: true, doi: "MỚI", dong_cua: "Cửa Đức",
    ghi_chu: "AL50N trong sheet nguồn; AL50C là 0,05 nhưng bảng thi hành chưa khai đời CŨ." },
  { ma: "AL-VIP50", buoc_la_m: 0.055, be_rong_nan_mm: 55, tru_mot_la: true, doi: "MỚI", dong_cua: "Cửa Đài Loan",
    ghi_chu: "ALVIP50N trong sheet nguồn." },
  { ma: "AL-VIPST500", buoc_la_m: 0.053, be_rong_nan_mm: 53, tru_mot_la: true, doi: "MỚI", dong_cua: "Cửa Đài Loan",
    ghi_chu: "VIPST500N. BRD §4.1 liệt mã này trong nhóm có hai số khác nhau: nan 55, chia 0,053." },
  { ma: "AL-VIPST700", buoc_la_m: 0.050, be_rong_nan_mm: 50, tru_mot_la: true, doi: "", dong_cua: "Cửa Đài Loan",
    ghi_chu: "VIPST700 trong sheet nguồn." },
]);

const SOURCE = "GHI CHÚ (MS LIÊN BS.xlsx) + slats.ts SLAT_PROFILES (2026-08-19)";

/** Payload fixture cho DocType `Quy cách cửa`. Trường không có nguồn thì KHÔNG xuất hiện. */
export function slatCatalogFixtureData(row) {
  return {
    ma: row.ma,
    dong_cua: row.dong_cua,
    ...(row.doi ? { doi: row.doi } : {}),
    buoc_la_m: row.buoc_la_m,
    ...(row.be_rong_nan_mm == null ? {} : { be_rong_nan_mm: row.be_rong_nan_mm }),
    tru_mot_la: row.tru_mot_la ? 1 : 0,
    nguon: SOURCE,
    ...(row.ghi_chu ? { ghi_chu: row.ghi_chu } : {}),
    disabled: false,
  };
}
