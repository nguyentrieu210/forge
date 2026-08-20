import { useMemo } from "react";
import { ChevronRight, PackageSearch } from "lucide-react";
import { Button, type StatusTone } from "@metaforge/ui";

/* Hallmark · macrostructure: Workbench · genre: modern-minimal
 * pre-emit critique: P4 H5 E4 S4 R5 V4
 */

export interface AlumdoorMasterItem {
  key: string;
  label: string;
  route: string;
}

/**
 * Số đo của MỘT danh mục. Do nơi gọi truyền vào, màn này không tự gọi API.
 *
 * Vì sao không fetch tại đây: `AlumdoorMasterDataScreen` được `MetaIndexScreen` dựng từ
 * `props.nav` — một mảng đã lọc quyền, thuần dữ liệu, không có hook tải nào. Thêm một lần gọi
 * mạng bên trong sẽ là chỗ duy nhất trong màn hình này biết cách nói chuyện với server, và nó
 * sẽ chạy lại mỗi lần người dùng bấm vào menu.
 *
 * `total` phải là số bản ghi CÒN DÙNG — đã trừ bản ghi `disabled`. Nền tảng không xoá bản ghi
 * đã khai (nghỉ hưu, không xoá), nên đếm thô sẽ báo "đủ" cho một danh mục đã cho nghỉ hết.
 */
export interface AlumdoorMasterMeasure {
  /** Số bản ghi còn dùng (KHÔNG tính bản ghi `disabled`). */
  total: number;
  /** Số bản ghi đã điền trường then chốt. Bỏ trống = chưa đo trường đó, không phải bằng 0. */
  filled?: number;
  /**
   * Số bản ghi mà trường then chốt THỰC SỰ bắt buộc — mẫu số đúng cho `filled`.
   *
   * Vì sao phải tách khỏi `total`: `Item.uom_conversions` khai
   * `depends_on: eval:doc.default_purchase_uom != doc.stock_uom || doc.default_sales_uom != doc.stock_uom`
   * trong brief, nên mặt hàng có mua = tồn = bán thì form ẨN hẳn bảng con — không khai được, và
   * cũng không cần khai. Lấy `total` = 566 làm mẫu số là đòi một con số không bao giờ đạt tới:
   * cảnh báo không tắt được thì vài tuần sau không ai nhìn nữa.
   *
   * `server/scripts/build-alumdoor-uom-conversion-catalog.mjs` (chú thích đầu file) đã ghi đúng
   * cái bẫy này một lần: "20/566 là KÍCH THƯỚC LỖ HỔNG, không phải lượng nguồn cung"; nguồn thật
   * chỉ đọc ra 19 hệ số từ `DANH-MỤC.md` + 40 bản ghi kg/mét. Một kế hoạch trước đã hỏng vì đọc
   * 566 sai vai. Bỏ trống trường này thì màn KHÔNG tự lấy `total` thay thế cho trường
   * `critical.conditional` — nó nói thẳng là chưa đo.
   */
  applicable?: number;
}

/**
 * Bản đồ `tên DocType` → số đo. Thiếu khoá nào thì mục đó hiện "chưa đo", không đoán.
 *
 * Nguồn số dự kiến: `server/scripts/audit-alumdoor-catalog-foundation.mjs` (đọc-chỉ, đếm theo
 * `documents.doctype` của tenant) hoặc một endpoint đếm tương đương. Khoá là tên DocType thật
 * chứ không phải nhãn tiếng Việt, vì nhãn đổi được mà tên DocType thì không.
 */
export type AlumdoorMasterReadiness = Readonly<Record<string, AlumdoorMasterMeasure>>;

interface AlumdoorMasterDataScreenProps {
  items: AlumdoorMasterItem[];
  onNavigate: (route: string) => void;
  /**
   * Không truyền = chưa đo. Màn hình nói thẳng là chưa đo thay vì hiện xanh hết —
   * "rỗng", "đủ" và "chưa ai đọc" trông giống hệt nhau chính là lỗi đang phải sửa.
   */
  readiness?: AlumdoorMasterReadiness;
}

/**
 * Chuỗi vận hành một đơn hàng thật. Đây là đích của cả màn: không phải "menu có đủ mục chưa",
 * mà "chạy hết được tám bước này chưa".
 *
 * Giữ thứ tự — nhãn cổng chặn của một mục phải đọc được là "chuỗi đứt Ở ĐÂU", nên tên bước phải
 * là tên bước nghiệp vụ người dùng gọi hằng ngày, không phải tên DocType.
 */
const CHAIN_STEPS = [
  "báo giá",
  "đơn hàng",
  "mua vật tư",
  "nhập kho",
  "sản xuất",
  "xuất kho",
  "hoá đơn",
  "công nợ",
] as const;

export type ChainStep = typeof CHAIN_STEPS[number];

export interface MasterEntryDefinition {
  key: string;
  label: string;
  /**
   * Bước vận hành đứt nếu mục này chưa dùng được. Không khai = mục tra cứu, thiếu thì bất tiện
   * chứ không chặn ai. Đây là dữ kiện THIẾT KẾ (mục này nuôi bước nào), không phải số đo — nên
   * nó hiện được cả khi chưa có `readiness`.
   */
  gate?: { step: ChainStep; why: string };
  /**
   * Trường then chốt: có bản ghi mà trống trường này thì vẫn không chạy được.
   * `source` là DocType chứa trường, có thể KHÁC `key` (trường nằm ở bảng con).
   *
   * `why` của `gate` chỉ được nói CƠ CHẾ, không được nhồi số đo vào: số phải chảy từ `readiness`
   * qua chip. Đã dính hai lần — xem chú thích tại `Bill of Materials` và `Supplier`.
   */
  critical?: {
    source: string;
    field: string;
    label: string;
    /**
     * Trường chỉ bắt buộc với MỘT PHẦN bản ghi (brief khai `depends_on`) ⇒ `total` KHÔNG phải
     * mẫu số. Khai cờ này thì phải đo được `applicable`, không thì màn nói "chưa đo".
     */
    conditional?: boolean;
  };
}

interface MasterGroupDefinition {
  id: string;
  title: string;
  entries: MasterEntryDefinition[];
}

type ResolvedMasterEntry = AlumdoorMasterItem & {
  displayLabel: string;
  definition: MasterEntryDefinition;
  status: MasterEntryStatus;
};

type ResolvedMasterGroup = Omit<MasterGroupDefinition, "entries"> & {
  step: number;
  items: ResolvedMasterEntry[];
  /** Số mục ĐANG chặn chuỗi — chỉ đếm khi đã đo, chưa đo thì bằng 0 và không hiện gì. */
  blockedCount: number;
  partialCount: number;
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[đĐ]/g, "d")
  .toLocaleLowerCase("vi")
  .trim();

/**
 * Danh mục Alumdoor là một menu nghiệp vụ có chủ đích, không phải toàn bộ DocType
 * mang group "Danh mục". Khai tường minh theo key để tên server đổi nhẹ cũng không
 * làm một mục tự nhảy sang nhóm khác.
 *
 * ĐỔI LẠI, danh sách trắng này có một cái giá phải trả cho đúng: mục nào có trong nav mà
 * KHÔNG có ở đây thì biến mất khỏi màn hình — và thanh bên cũng không cứu được, vì
 * `workspace-navigation.ts` xếp "Danh mục" vào GLOBAL_GROUPS nên nhóm này không xổ menu con.
 * Tháng 8/2026 có 8 mục rơi vào khe đó, trong đó Phường Xã 3.321 bản ghi và Tỉnh Thành 34
 * bản ghi là dữ liệu thật đã nhập xong mà không ai vào xem được.
 *
 * Vì vậy: THÊM DOCTYPE VÀO NHÓM "Danh mục" CỦA BRIEF THÌ PHẢI THÊM VÀO ĐÂY, hoặc khai
 * `menu: false` trong brief nếu cố ý không cho lên menu. Không có lựa chọn thứ ba.
 * Hợp đồng này có máy kiểm: `__tests__/alumdoor-master-data-screen.test.mjs` đọc thẳng
 * `server/briefs/alumdoor-v2.json` và bắt lỗi nếu brief mọc thêm mục mà đây chưa khai —
 * 30/30 DocType đủ điều kiện lên menu (không `child`, không `menu:false`) hiện đã có mặt.
 *
 * Chiều ngược lại CỐ Ý không kiểm: mục đã khai ở đây mà brief tắt `menu` thì vẫn giữ nguyên
 * dòng khai (nghỉ hưu, không xoá) để bật lại là về đúng nhóm cũ. `Supplier Item` đang ở đúng
 * trạng thái đó.
 */
const MASTER_GROUPS: MasterGroupDefinition[] = [
  {
    id: "materials",
    title: "Vật tư & quy cách",
    entries: [
      {
        key: "Item",
        label: "Hàng hoá / Vật tư",
        /**
         * Hệ số quy đổi là một trong ba chỗ chặn cứng của cả chuỗi.
         *
         * Bảng con `uom_conversions` của Item mới có 20/566 mặt hàng được khai. Chính brief ghi
         * ví dụ: ray mua theo CÂY, tồn và bán theo MÉT, `conversion_factor = 5.85` — thiếu dòng
         * đó thì nhân đọc về hệ số 1 và tồn kho sai gần sáu lần MÀ KHÔNG CÓ GÌ BÁO. Đây là loại
         * hỏng tệ nhất: phiếu nhập vẫn ghi thành công, sổ vẫn cân, chỉ có số là sai.
         */
        gate: { step: "mua vật tư", why: "Mua theo cây, tồn theo mét — thiếu hệ số quy đổi thì phiếu nhập ghi sai số lượng mà không báo lỗi" },
        // `conditional`: brief khai `depends_on` cho `uom_conversions`, mặt hàng mua = tồn = bán
        // thì form ẩn bảng con. Mẫu số phải là `applicable`, KHÔNG phải 566 — xem
        // `AlumdoorMasterMeasure.applicable`.
        critical: { source: "Item", field: "uom_conversions", label: "hệ số quy đổi", conditional: true },
      },
      { key: "Item Group", label: "Nhóm hàng" },
      { key: "UOM", label: "Đơn vị tính" },
      { key: "Surface Finish", label: "Bề mặt" },
      { key: "Item Color", label: "Màu vật tư" },
      { key: "Material Specification", label: "Quy cách kỹ thuật vật tư" },
      {
        key: "Quy cách cửa",
        label: "Bản lá theo mã nhôm",
        // Chạm TIỀN, không chạm máy cắt: chiều cao tính tiền = tổng số lá × bản lá của mã.
        // Sai bản lá là sai m² trên hoá đơn, và không ai soát lại được vì con số vẫn hợp lý.
        gate: { step: "báo giá", why: "Chiều cao tính tiền = số lá × bản lá; sai bản lá là sai m² trên hoá đơn" },
      },
      { key: "Measurement Profile", label: "Bộ theo dõi vật tư" },
      { key: "Geometry Field", label: "Trường quy cách hình học" },
      { key: "Geometry Profile", label: "Bộ quy cách hình học" },
    ],
  },
  {
    id: "warehouses",
    title: "Kho",
    entries: [
      {
        key: "Warehouse",
        label: "Danh sách kho",
        /**
         * Lô kho là chỗ chặn cứng thứ ba. `Batch` là DocType NỀN TẢNG (clouderp-stock), không
         * nằm trong brief app nên không bao giờ lên được menu này — lô chỉ sinh ra khi có phiếu
         * nhập ghi vào một kho. Tính tới 19/08 mọi bảng giao dịch kho còn 0 dòng, nên chưa có
         * lô nào tồn tại; Kho là mục duy nhất trên màn này đứng trước chỗ đứt đó.
         */
        gate: { step: "nhập kho", why: "Lô nhôm chỉ sinh khi phiếu nhập ghi vào một kho; chưa có kho thì không có lô để trừ" },
      },
    ],
  },
  {
    id: "purchasing",
    title: "Mua hàng & nhà cung cấp",
    entries: [
      {
        key: "Supplier",
        label: "Nhà cung cấp",
        /**
         * Giá nhập là chỗ chặn cứng thứ hai, và nó KHÔNG nằm ở hồ sơ nhà cung cấp mà ở
         * `Supplier Item.last_purchase_rate`.
         *
         * Câu `why` từng khẳng định cứng "bảng đó còn 0 bản ghi". Số đó đã sai trong chính khung
         * nhìn của nó: dựng màn với `{Supplier:{total:0}, "Supplier Item":{total:448}}` thì hàng
         * trên nói bảng kia 0 bản ghi, hàng ngay dưới nói 448. Và bảng đó sắp hết rỗng thật —
         * `server/scripts/lib/alumdoor-partner-source.mjs` đọc 448 đối tác từ nguồn gốc
         * `apps/alumdoor/docs/nguon/don-hang-xuat-hang/DS-KH-NCC.md`, còn
         * `alumdoor-purchase-catalog.mjs` đã dựng sẵn `supplier_items` kèm `last_purchase_rate`.
         *
         * Nên `why` chỉ nói CƠ CHẾ; tình trạng của `Supplier Item` do `critical` đọc từ
         * `readiness` — sai số một chỗ thì cả hai chỗ cùng sai, không mâu thuẫn nhau được nữa.
         */
        gate: { step: "mua vật tư", why: "Giá nhập gần nhất nằm ở Mã hàng theo nhà cung cấp, không nằm ở hồ sơ nhà cung cấp" },
        critical: { source: "Supplier Item", field: "last_purchase_rate", label: "giá nhập gần nhất" },
      },
      {
        key: "Supplier Item",
        label: "Mã hàng theo nhà cung cấp",
        /**
         * MỤC NÀY HIỆN KHÔNG HIỆN RA — và đó là một mâu thuẫn dữ liệu chưa ai gỡ:
         *  · `server/briefs/alumdoor-v2.json` khai `menu: false` ⇒ không vào `props.nav`;
         *  · `docs/ALUMDOOR-DANH-MUC-HOI-TU-20260819.md` §3 chốt "GIỮ trên menu dù 0 bản ghi,
         *    gỡ nó là mất đường đối chiếu mã theo NCC".
         * Hai câu này ngược nhau. Không tự chọn bên nào ở client: sửa `menu` là việc của brief.
         * Dòng khai giữ nguyên để ngày brief bật lại thì mục về đúng nhóm, đúng cổng chặn.
         */
        gate: { step: "mua vật tư", why: "Mã và giá nhập theo từng nhà cung cấp — chưa có thì không đối chiếu được đơn mua" },
        critical: { source: "Supplier Item", field: "last_purchase_rate", label: "giá nhập gần nhất" },
      },
    ],
  },
  {
    id: "selling",
    title: "Khách hàng & giá bán",
    entries: [
      {
        key: "Customer",
        label: "Khách hàng",
        /**
         * KHÔNG khai gate thì mục này rỗng vẫn hiện "chưa cần" — mà brief nói ngược lại:
         * `Sales Order.customer` `required: true`, `Quotation.customer:Link(Customer)!`,
         * `Sales Invoice.customer:Link(Customer)!`. Không có khách thì cả ba chứng từ đều
         * không lập nổi.
         *
         * Chọn `đơn hàng` chứ không phải `báo giá` vì báo giá là bước BỎ QUA ĐƯỢC (bán thẳng
         * không báo giá vẫn chạy), còn đơn hàng thì không. Cổng phải đặt ở bước không né được,
         * nếu không người dùng đọc "chặn báo giá" rồi đi vòng qua và kẹt sâu hơn.
         */
        gate: { step: "đơn hàng", why: "Đơn hàng, báo giá và hoá đơn đều bắt buộc chọn khách; không có hồ sơ khách thì không mở được chứng từ nào" },
      },
      {
        key: "Price List",
        label: "Bảng giá",
        // `Item Price.price_list:Link(Price List)!` — bắt buộc. Không có bảng giá thì không dòng
        // giá nào tồn tại được, nên đây là mục đứng TRƯỚC `Item Price` trong cùng bước báo giá.
        gate: { step: "báo giá", why: "Mỗi dòng đơn giá bắt buộc thuộc một bảng giá; chưa có bảng giá thì không nhập được giá nào" },
      },
      {
        key: "Item Price",
        label: "Đơn giá theo bảng giá",
        /**
         * `area_tier` = 0/558. Danh mục `Bậc diện tích` 8 bậc đã dựng nhưng chưa dòng giá nào
         * trỏ vào, nên "một mặt hàng, tám mức giá" vẫn đang là TÁM MÃ HÀNG. Đây là nút thắt
         * khoá chéo L2–L3–L4: gỡ được thì cả ba tầng xong cùng lúc.
         */
        // `why` nói CƠ CHẾ, không nói số: "chưa dòng giá nào" là một số đo (0/558) nhồi vào chữ,
        // và nó sẽ nói dối ngay khi có 1 dòng được gắn bậc trong khi chip vẫn kêu vàng.
        // `area_tier` KHÔNG `conditional`: brief chốt trường này bắt buộc có giá trị vì nó là một
        // khoá trong `naming` — mặt hàng không phân bậc thì mang giá trị MOI-DIEN-TICH, vẫn phải
        // điền. Nên `total` đúng là mẫu số ở đây.
        gate: { step: "báo giá", why: "Một mặt hàng giữ được tám mức giá là nhờ bậc diện tích; dòng giá không gắn bậc thì phải tách thành tám mã hàng" },
        critical: { source: "Item Price", field: "area_tier", label: "bậc diện tích" },
      },
      { key: "Bậc diện tích", label: "Bậc diện tích" },
      { key: "Pricing Scope", label: "Phạm vi áp dụng chính sách" },
      { key: "Pricing Rule", label: "Chính sách giá" },
    ],
  },
  {
    id: "sales-configuration",
    title: "Bán hàng & sản xuất",
    entries: [
      { key: "Cutting Policy", label: "Công thức cửa" },
      { key: "Ngưỡng chọn Motor", label: "Ngưỡng chọn Motor / UPS" },
      // BOM Rule từng cần một `fallbackRoute` riêng vì nó không có trong brief — chỉ do
      // importer ghi thẳng vào doctype_definitions. Từ 2026-08-19 nó là DocType thật nên
      // route thường là đủ; miếng vá đã gỡ cùng lượt.
      { key: "BOM Rule", label: "Quy tắc BOM" },
      {
        key: "Bill of Materials",
        label: "Định mức / BOM",
        /**
         * 106/338 hàng bán chưa có định mức (audit 16/08, hoãn có chủ đích H3) ⇒ mở trừ kho
         * sản xuất bây giờ sẽ trừ thiếu cho gần một phần ba mặt hàng.
         *
         * CHƯA ĐO ĐƯỢC Ở ĐÂY: `BOM Template.sales_mode` = 0/349. `BOM Template` thuộc nhóm
         * "Sản xuất" trong brief nên KHÔNG có mục nào trên màn Danh mục dẫn tới nó. Cố gắn số
         * đó vào mục này sẽ chỉ người dùng đi sai màn, nên ghi ra chỗ thiếu thay vì gán bừa.
         *
         * SỐ 106/338 Ở LẠI CHÚ THÍCH, KHÔNG RA MÀN. `gate.why` chỉ được in khi mục đang blocked
         * hoặc partial; mục này không khai `critical` nên partial bất khả ⇒ câu đó chỉ hiện đúng
         * lúc chip trái nói "Rỗng" (0 bản ghi), trong khi chính nó khẳng định 232 mặt hàng ĐÃ có
         * định mức. Hai câu cạnh nhau phủ định nhau, và chuỗi số chỉ lộ ra ở đúng trạng thái nó
         * nói dối.
         */
        gate: { step: "sản xuất", why: "Không có định mức thì lệnh sản xuất không biết trừ vật tư nào, phiếu vẫn ghi thành công" },
      },
      { key: "Production Standard", label: "Tiêu chuẩn sản xuất" },
    ],
  },
  {
    id: "addresses",
    title: "Địa bàn & giao lắp",
    entries: [
      { key: "Tỉnh Thành", label: "Tỉnh / Thành phố" },
      { key: "Phường Xã", label: "Phường / Xã" },
      {
        key: "Địa chỉ giao lắp",
        label: "Địa chỉ giao lắp",
        // 0 bản ghi (audit 19/08), trong khi Tỉnh Thành 34 và Phường Xã 3.321 đã nhập xong: địa
        // bàn có đủ nhưng chưa địa chỉ giao lắp nào được dựng. Số ở lại chú thích — `why` chỉ nói
        // cơ chế, tình trạng rỗng/đủ để chip đọc từ `readiness` nói.
        gate: { step: "xuất kho", why: "Phiếu giao lấy điểm đến từ đây; không có địa chỉ thì không xuất được hàng đi lắp" },
      },
    ],
  },
  {
    id: "finance",
    title: "Kế toán",
    entries: [
      { key: "Tài khoản ngân hàng", label: "Tài khoản ngân hàng" },
    ],
  },
  {
    id: "operations",
    title: "Lý do vận hành",
    entries: [
      { key: "Lý do huỷ", label: "Lý do huỷ" },
      { key: "Nguyên nhân chênh lệch", label: "Nguyên nhân chênh lệch" },
      { key: "Nguyên nhân cửa lỗi", label: "Nguyên nhân cửa lỗi" },
    ],
  },
];

/**
 * Cửa sổ chỉ-đọc cho máy kiểm hợp đồng ở `__tests__`. KHÔNG dùng khi vẽ.
 *
 * Mở ra vì hợp đồng "brief mọc mục nào thì đây phải khai mục đó" chỉ là một đoạn chú thích nếu
 * không ai đối chiếu được — mà chú thích không được kiểm thì sớm muộn cũng nói dối.
 */
export const MASTER_DATA_DECLARED_KEYS: readonly string[] = MASTER_GROUPS
  .flatMap((group) => group.entries.map((entry) => entry.key));

/**
 * Thứ tự này KHÔNG tuỳ ý — nó là thứ tự phải khai, và cũng là thứ tự nhập liệu từ L0 trở đi.
 *
 * Không khai đơn vị tính thì không tạo được mặt hàng; không có mặt hàng thì không có bảng giá,
 * cũng không có định mức. Người dựng hệ lần đầu đi từ trên xuống là xong, đi ngược là kẹt — nên
 * màn này bày đúng theo chiều đó thay vì gom theo chủ đề.
 *
 * Vì bản thân nội dung LÀ một chuỗi, đánh số ở đây mới có nghĩa. Nếu chỉ là các nhóm ngang hàng
 * thì con số chỉ là trang trí và không nên có.
 *
 * KHÔNG xếp lại theo "nhóm nào đang chặn". Thứ tự phải khai là bất biến của màn hình; đảo nó
 * theo một số đo thay đổi hằng ngày thì mỗi lần vào màn lại thấy một bố cục khác, và người dùng
 * mất luôn cái duy nhất họ học thuộc được. Chỗ đang chặn nổi lên bằng MÀU và NHÃN, không bằng
 * vị trí.
 */
const DISPLAY_ORDER = [
  "materials",
  "warehouses",
  "selling",
  "sales-configuration",
  "purchasing",
  "addresses",
  "operations",
  "finance",
] as const;

/**
 * Bề ngang theo SỐ MỤC thật, không theo thói quen chia đôi màn hình.
 *
 * Nhóm một mục mà chiếm bằng nhóm sáu mục thì mắt phải quét những ô gần như trống. `Mua hàng`
 * chỉ hiện một mục vì `Supplier Item` khai `menu: false` trong brief nên không vào `props.nav`
 * — dòng khai của nó vẫn còn ở trên, xem chú thích tại mục đó.
 */
const GROUP_LAYOUT: Record<string, string> = {
  materials: "lg:col-span-7 xl:col-span-8",
  warehouses: "lg:col-span-5 xl:col-span-4",
  selling: "lg:col-span-6 xl:col-span-5",
  "sales-configuration": "lg:col-span-6 xl:col-span-4",
  purchasing: "lg:col-span-3 xl:col-span-3",
  addresses: "lg:col-span-4 xl:col-span-4",
  operations: "lg:col-span-4 xl:col-span-4",
  finance: "lg:col-span-4 xl:col-span-4",
};

export type MasterReadinessState = "unknown" | "ready" | "partial" | "blocked" | "idle";

export interface MasterEntryStatus {
  state: MasterReadinessState;
  /** Chữ hiện trên chip. Rỗng ⇒ không vẽ chip (trạng thái `unknown`). */
  label: string;
  tone: StatusTone;
  /**
   * Có bản ghi nhưng chưa ai đo trường then chốt — nói ra thay vì coi như đã đủ.
   * "Chưa đo" gồm cả THIẾU MẪU SỐ: biết 20 dòng đã điền mà không biết bao nhiêu dòng phải điền
   * thì chưa kết luận được gì.
   */
  unmeasuredField?: string;
}

const formatCount = (value: number) => value.toLocaleString("vi-VN");

/**
 * Bốn trạng thái người dùng cần phân biệt, cộng một trạng thái thứ năm là "chưa đo".
 *
 * Trạng thái thứ năm không phải để cho đủ bộ: nếu thiếu nó thì màn hình buộc phải chọn giữa
 * "báo đủ" và "báo rỗng" cho một danh mục chưa ai đếm — cả hai đều là bịa. Đúng cái bẫy đã bỏ
 * khi gỡ con số đếm-đường-dẫn cạnh tiêu đề nhóm: một con số hợp lý mà sai thì không ai nghi
 * để đi kiểm.
 *
 * `filled` không có KHÁC `filled === 0`. Chưa đo trường then chốt thì mục vẫn tính là dùng
 * được, nhưng chip phải nói rõ là chưa đo trường nào.
 */
export function resolveEntryStatus(
  entry: MasterEntryDefinition,
  readiness: AlumdoorMasterReadiness | undefined,
): MasterEntryStatus {
  const own = readiness?.[entry.key];
  if (!own) return { state: "unknown", label: "", tone: "muted" };

  if (own.total <= 0) {
    return entry.gate
      ? { state: "blocked", label: `Rỗng · chặn ${entry.gate.step}`, tone: "destructive" }
      // KHÔNG viết "chưa cần". Không khai `gate` chỉ có nghĩa là màn này CHƯA XÉT mục đó, không
      // phải đã xét và thấy không ai cần. Nhãn cũ nói "chưa cần" cho cả Khách hàng lẫn Bảng giá
      // — hai master mà brief khai bắt buộc (`Sales Order.customer` required,
      // `Item Price.price_list!`). Hai mục đó nay đã có gate, nhưng nhãn vẫn phải trung tính vì
      // 21/31 mục còn lại chưa ai đặt vai trò và chúng dùng chung đúng câu này.
      : { state: "idle", label: "Rỗng · chưa đặt vai trò trong chuỗi", tone: "muted" };
  }

  const critical = entry.critical;
  const source = critical ? readiness[critical.source] : undefined;

  /**
   * NGUỒN CỦA TRƯỜNG THEN CHỐT RỖNG HẲN = ca TỆ NHẤT, phải xét trước.
   *
   * Bản trước gộp nó vào điều kiện partial bằng `source.total > 0`, làm ĐẢO NGƯỢC mức nghiêm
   * trọng: `{Supplier:{total:41}, "Supplier Item":{total:0,filled:0}}` ra xanh "Đủ dùng · 41 bản
   * ghi", còn `{total:10,filled:0}` — nhẹ hơn hẳn — mới ra vàng. Tức là cách sửa hiển nhiên cho
   * chỗ chặn cứng "giá nhập" (gắn `critical` vào Supplier) lại là cách duy nhất làm nó biến mất
   * khỏi màn hình.
   *
   * Chưa nổ trước đây chỉ vì cả ba `critical` đều tự trỏ về chính mình, nên `own.total > 0` kéo
   * theo `source.total > 0`. Nay Supplier trỏ sang `Supplier Item` thì ca này là hiện trạng.
   */
  if (critical && source && source.total <= 0) {
    return entry.gate
      ? { state: "blocked", label: `Chưa có ${critical.label}`, tone: "destructive" }
      : { state: "partial", label: `Chưa có ${critical.label}`, tone: "warning" };
  }

  /**
   * Mẫu số: `applicable` nếu đo được, không thì `total` — TRỪ trường có `depends_on`.
   *
   * Trường `conditional` mà chưa ai đo `applicable` thì KHÔNG được lấy `total` thay: đòi
   * 566/566 mặt hàng khai hệ số quy đổi là đòi một con số không đạt tới được (mặt hàng mua = tồn
   * = bán bị form ẩn hẳn bảng con). Chưa đo được thì nói chưa đo.
   */
  const denominator = critical
    ? source?.applicable ?? (critical.conditional ? undefined : source?.total)
    : undefined;

  if (critical && source && source.filled !== undefined && denominator !== undefined && source.filled < denominator) {
    return {
      state: "partial",
      label: `Thiếu ${critical.label} ${formatCount(source.filled)}/${formatCount(denominator)}`,
      tone: "warning",
    };
  }

  return {
    state: "ready",
    label: `Đủ dùng · ${formatCount(own.total)} bản ghi`,
    tone: "success",
    // Có trường then chốt mà không ai đo nó thì "đủ dùng" mới chỉ đúng ở mức đếm dòng. Thiếu
    // MẪU SỐ cũng là chưa đo: biết 20 dòng đã điền mà không biết bao nhiêu dòng phải điền thì
    // không kết luận được gì.
    unmeasuredField: critical && (!source || source.filled === undefined || denominator === undefined)
      ? critical.label
      : undefined,
  };
}

/**
 * Mục nào không giải được thì bỏ hẳn — không dựng route đoán.
 *
 * `items` đã được server lọc theo quyền, nên một mục vắng mặt có đúng hai nguyên nhân:
 * tài khoản không có quyền đọc, hoặc brief chưa khai (kể cả khai `menu: false`). Cả hai đều
 * không được chữa bằng một route bịa ở client: cái đầu là vượt quyền, cái sau dẫn tới màn
 * báo lỗi. Kể cả khi mục đó mang cờ `gate` — thà im lặng còn hơn hiện một cổng chặn không
 * bấm được, hoặc kể cho người không có quyền nghe về một danh mục họ không được thấy.
 */
export function resolveMasterGroups(
  items: AlumdoorMasterItem[],
  readiness?: AlumdoorMasterReadiness,
): ResolvedMasterGroup[] {
  const itemsByKey = new Map(items.map((item) => [normalize(item.key), item]));
  const itemsByLabel = new Map(items.map((item) => [normalize(item.label), item]));
  const rank = new Map<string, number>(DISPLAY_ORDER.map((id, index) => [id, index]));
  const resolveEntry = (entry: MasterEntryDefinition) => itemsByKey.get(normalize(entry.key))
    ?? itemsByLabel.get(normalize(entry.label));

  return MASTER_GROUPS.map((group) => {
    const resolved: ResolvedMasterEntry[] = group.entries.flatMap((entry) => {
      const item = resolveEntry(entry);
      if (!item) return [];
      return [{ ...item, displayLabel: entry.label, definition: entry, status: resolveEntryStatus(entry, readiness) }];
    });
    return {
      id: group.id,
      title: group.title,
      step: 0,
      items: resolved,
      blockedCount: resolved.filter((entry) => entry.status.state === "blocked").length,
      partialCount: resolved.filter((entry) => entry.status.state === "partial").length,
    };
  })
    .filter((group) => group.items.length > 0)
    .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    // Đánh số SAU khi lọc quyền, nên bước luôn liền mạch 1,2,3 kể cả khi một nhóm bị chặn hết.
    // Số nhảy cóc trên màn hình khiến người dùng đi tìm một bước không tồn tại.
    .map((group, index) => ({ ...group, step: index + 1 }));
}

/**
 * Số BƯỚC, không phải số bản ghi.
 *
 * Ô này trước đây hiện `group.items.length` — tức đếm số ĐƯỜNG DẪN trong nhóm. Đặt một con số
 * cạnh tiêu đề "Vật tư & quy cách" thì người đọc hiểu ngay là số mặt hàng, mà thực ra là số mục
 * menu. Con số hợp lý mà sai là loại tệ nhất: không ai nghi để đi kiểm.
 *
 * Từ khi màn nhận `readiness`, số bản ghi thật ĐÃ có chỗ hiện — nhưng ở cạnh từng mục và luôn
 * đi kèm chữ ("… bản ghi", "thiếu bậc diện tích 0/558"), không bao giờ là một con số trần cạnh
 * tiêu đề nhóm. Cái bẫy cũ nằm ở chỗ con số trần không nói nó đếm gì.
 */
function StepMarker({ step }: { step: number }) {
  return (
    <span
      className="shrink-0 select-none text-xs font-medium tabular-nums text-muted-foreground/70"
      aria-hidden="true"
    >
      {String(step).padStart(2, "0")}
    </span>
  );
}

function MasterLink({ entry, onNavigate, prominent = false }: {
  entry: ResolvedMasterEntry;
  onNavigate: (route: string) => void;
  prominent?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={`group h-auto min-h-11 w-full items-start justify-between gap-3 rounded-md px-2.5 py-2.5 text-left font-normal hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${prominent ? "text-[15px]" : "text-sm"}`}
      onClick={() => onNavigate(entry.route)}
    >
      <span className="flex min-w-0 flex-col">
        <span className="min-w-0 whitespace-normal leading-5">{entry.displayLabel}</span>
      </span>
      <ChevronRight
        className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary group-focus-visible:translate-x-0.5 group-focus-visible:text-primary"
        aria-hidden="true"
      />
    </Button>
  );
}

function MasterGroupSection({ group, onNavigate }: {
  group: ResolvedMasterGroup;
  onNavigate: (route: string) => void;
}) {
  const isPrimary = group.id === "materials";

  if (isPrimary) {
    return (
      <section className={`${GROUP_LAYOUT[group.id]} rounded-xl border bg-card p-3 shadow-sm sm:p-4`}>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b pb-3">
          <StepMarker step={group.step} />
          <h2 className="text-base font-semibold tracking-tight">{group.title}</h2>
        </div>
        <nav aria-label={group.title} className="grid min-w-0 gap-x-3 sm:grid-cols-2">
          {group.items.map((entry) => (
            <MasterLink key={entry.key} entry={entry} onNavigate={onNavigate} prominent />
          ))}
        </nav>
      </section>
    );
  }

  return (
    <section className={`${GROUP_LAYOUT[group.id] ?? "lg:col-span-4"} min-w-0 border-t pt-3`}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-2.5">
        <StepMarker step={group.step} />
        <h2 className="text-sm font-semibold tracking-tight">{group.title}</h2>
      </div>
      <nav aria-label={group.title} className="min-w-0">
        {group.items.map((entry) => (
          <MasterLink key={entry.key} entry={entry} onNavigate={onNavigate} />
        ))}
      </nav>
    </section>
  );
}

export interface MasterChainSummary {
  measured: boolean;
  blocked: number;
  partial: number;
  /**
   * Số mục HIỆN TRÊN MÀN mà `readiness` không có khoá — tức chưa ai đếm.
   *
   * Không có ô này thì "chưa đo" bị cộng chung vào "không có vấn đề": truyền `readiness={}` (map
   * rỗng) cho ra blocked=0, partial=0 và màn tuyên bố cả chuỗi đã đủ dữ liệu nền trong khi 0/31
   * mục được đo. Đo đúng 30/31, thiếu mỗi `Warehouse` (thực tế 0 bản ghi, một trong ba chặn
   * cứng), cũng ra đúng câu đó.
   */
  unknown: number;
  /**
   * Mục đếm được đủ dòng nhưng TRƯỜNG THEN CHỐT chưa ai đo (`filled` hoặc mẫu số vắng mặt).
   *
   * Cùng một lỗ hổng với `unknown`, chỉ sâu hơn một tầng: đo `total` cho cả 31 mục mà không đo
   * `filled` nào thì mọi mục đều `ready`, blocked = partial = unknown = 0, và câu all-clear lại
   * tuyên bố đủ dữ liệu nền ngay trên ba chip đang ghi "chưa đo hệ số quy đổi / bậc diện tích /
   * giá nhập gần nhất".
   */
  unmeasured: number;
  /** Mục rỗng nhưng chưa ai đặt vai trò trong chuỗi — đếm riêng, không trộn vào `blocked`. */
  idle: number;
  /** Tổng số mục hiện trên màn sau khi lọc quyền. Mẫu số của `unknown`. */
  visible: number;
  /** Các bước vận hành đang đứt, theo đúng thứ tự chuỗi. */
  brokenSteps: ChainStep[];
  /** Các bước CÓ ít nhất một mục canh trên màn này — phần màn dám kết luận. */
  coveredSteps: ChainStep[];
  /** Các bước KHÔNG mục nào canh — màn không đo được, và phải nói ra thay vì nhận đã thông. */
  uncoveredSteps: ChainStep[];
}

/**
 * Một câu ở đầu màn, không phải một bảng điều khiển.
 *
 * Người dùng vào đây để khai dữ liệu, không để đọc thống kê. Câu này chỉ trả lời đúng một câu
 * hỏi: "chuỗi đứt ở đâu" — hoặc thú nhận là chưa ai đo.
 */
export function summarizeChain(groups: ResolvedMasterGroup[], readiness?: AlumdoorMasterReadiness): MasterChainSummary {
  const entries = groups.flatMap((group) => group.items);
  const broken = new Set<ChainStep>();
  const covered = new Set<ChainStep>();
  for (const entry of entries) {
    const gate = entry.definition.gate;
    if (!gate) continue;
    // Bước được coi là CÓ CANH tính theo mục hiện trên màn sau lọc quyền, không theo bảng khai
    // gốc: tài khoản không thấy mục nào canh bước đó thì với họ bước đó không được đo.
    covered.add(gate.step);
    if (entry.status.state === "blocked" || entry.status.state === "partial") broken.add(gate.step);
  }
  return {
    measured: readiness !== undefined,
    blocked: entries.filter((entry) => entry.status.state === "blocked").length,
    partial: entries.filter((entry) => entry.status.state === "partial").length,
    unknown: entries.filter((entry) => entry.status.state === "unknown").length,
    unmeasured: entries.filter((entry) => entry.status.unmeasuredField !== undefined).length,
    idle: entries.filter((entry) => entry.status.state === "idle").length,
    visible: entries.length,
    brokenSteps: CHAIN_STEPS.filter((step) => broken.has(step)),
    coveredSteps: CHAIN_STEPS.filter((step) => covered.has(step)),
    uncoveredSteps: CHAIN_STEPS.filter((step) => !covered.has(step)),
  };
}

export function AlumdoorMasterDataScreen({ items, onNavigate, readiness }: AlumdoorMasterDataScreenProps) {
  const groups = useMemo(() => resolveMasterGroups(items, readiness), [items, readiness]);

  if (groups.length === 0) {
    return (
      <section className="flex flex-col items-start rounded-lg border border-dashed bg-card px-5 py-10 text-left">
        <PackageSearch className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-semibold">Chưa có danh mục khả dụng</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tài khoản hiện tại chưa được cấp quyền xem dữ liệu danh mục.</p>
      </section>
    );
  }

  return (
    <section className="w-full min-w-0 overflow-x-clip">
      <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-12 xl:gap-x-8 xl:gap-y-6">
        {groups.map((group) => (
          <MasterGroupSection key={group.id} group={group} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}
