/**
 * TỜ IN ĐƠN BÁN HÀNG — VIẾT RIÊNG, KHÔNG MƯỢN GIAO DIỆN MÀN NHẬP.
 *
 * Chủ xưởng chốt 24/08/2026: bản in trước đây là chính màn nhập đem đi in, nên nó tha theo mọi
 * thứ chỉ có nghĩa lúc nhập — ô tick, thẻ badge, ô chọn có mũi tên, nút bung dòng, bề rộng cột
 * nhớ trong trình duyệt, viền hai lớp. Ép bằng CSS chỉ càng chồng luật.
 *
 * Ở đây dựng lại từ đầu bằng HTML trần và một bộ lớp riêng (`ad-p-*`): bảng phẳng, viền 1px
 * đều, chữ có chân, cột tự căn theo nội dung.
 *
 * NHƯNG có ĐÚNG MỘT thứ không được viết lại: LUẬT CHỌN CỘT. Đơn hiện cột "Rộng phủ bì ray"
 * hay "Rộng phủ bì nhựa", có "Cao lưới" / "Rộng cắt lá" hay không — chép tay là trôi dạt, và
 * đã trôi thật (bản in từng bung cả hai cột phủ bì cho bộ cửa chỉ đo một chiều). Luật đó lấy
 * từ `print-columns.ts`, đúng cái mà lưới nhập đang dùng. Số tiền cũng vậy: đọc thẳng các hàm
 * `line*` của `model.ts`, không tính lại một phép nào.
 */
import { Fragment } from "react";
import {
  doorProductGroups,
  moTaKhuyenMai,
  surchargeRuleNames,
} from "./AlumdoorSalesOrderLineTableComplete.js";
import {
  isFullSetSalesItem,
  lineAdjustmentSplit,
  lineDiscountTotal,
  lineNetAmount,
  linePolicyDiscountPercentage,
  linePricedQuantity,
  mayHaveBom,
  money,
  numberValue,
  primaryQuantityField,
  quantity,
  text,
  type Json,
  type SalesLine,
} from "./model.js";
import {
  DYNAMIC_FALLBACK_LABELS,
  DYNAMIC_HEADER_UNITS,
  dynamicDisplayValue,
  dynamicFieldVisible,
  resolveDynamicColumns,
} from "./print-columns.js";

export interface AlumdoorSalesOrderPrintSheetProps {
  header: Json;
  lines: SalesLine[];
  customerGroup: string;
  /** Tổng của cả đơn — lấy thẳng từ màn nhập để tờ in không tự cộng lại theo cách khác. */
  totals: {
    totalAmount: unknown;
    discountTotal: number;
    surchargeTotal: number;
    vatAmount: unknown;
    grandTotal: unknown;
    depositAmount: number;
    outstandingAmount: number;
  };
}

const CONG_TY = [
  { nhan: "N/M 01:", giaTri: "Số 12B đường số 2, P. Bình Hưng Hòa, Q. Bình Tân, TP.HCM" },
  { nhan: "N/M 02:", giaTri: "Số 36 đường số 7, P. Bình Hưng Hòa, Q. Bình Tân, TP.HCM" },
  { nhan: "Điện thoại:", giaTri: "096.515.9595 - 0966.988.233" },
  { nhan: "Website:", giaTri: "www.alumdoor.vn" },
];

function o(giaTri: string): string {
  return giaTri || "—";
}

export function AlumdoorSalesOrderPrintSheet(props: AlumdoorSalesOrderPrintSheetProps) {
  const { header, totals } = props;
  const lines = props.lines.filter((line) => text(line.item_code));
  const options = { customerGroup: props.customerGroup, showLeafCountColumn: false };
  const dynamicColumns = resolveDynamicColumns(lines, options);
  const coMau = lines.some((line) => text(line.color));
  /*
   * Số cột THẬT của bảng — `colSpan` của dòng phụ đếm theo con số này.
   *   3 cố định (STT · Mã hàng · Tên hàng) + Màu (nếu có) + nhóm cột động
   *   + 5 cố định cuối (SL · ĐVT · Khối lượng · Đơn giá · Thành tiền)
   * Đếm hụt một ô thì dòng phụ ngắn hơn dòng hàng và ô cuối bảng vỡ ra — đã dính đúng lỗi đó.
   * Không có cột CK riêng: phần trăm chiết khấu ghi thẳng trên dòng phụ (chốt chủ xưởng).
   */
  const soCot = 3 + (coMau ? 1 : 0) + dynamicColumns.length + 5;

  const thongTinTrai = [
    { nhan: "Khách hàng", giaTri: text(header.customer) },
    { nhan: "Người liên hệ", giaTri: text(header.contact_person) },
    { nhan: "SĐT", giaTri: text(header.phone) },
    { nhan: "Địa chỉ", giaTri: text(header.install_address) },
    { nhan: "Ghi chú vận chuyển", giaTri: text(header.shipping_note) },
  ];
  const thongTinPhai = [
    { nhan: "Số đơn", giaTri: text(header.name) || "(chưa lưu)" },
    { nhan: "Ngày đặt hàng", giaTri: text(header.transaction_date) },
    { nhan: "Ngày giao hàng", giaTri: text(header.delivery_date) },
    { nhan: "Thanh toán", giaTri: text(header.payment_method) },
    { nhan: "% VAT", giaTri: `${quantity(header.vat_rate ?? 0)} %` },
  ];

  return (
    <div className="ad-p-sheet" data-print-root>
      <div className="ad-p-head">
        <img className="ad-p-logo" src="/alumdoor-order-logo.png" alt="ALUMDOOR" />
        {/* Khối công ty là CHỮ chứ không phải ảnh: ảnh có bề ngang cố định nên khổ giấy hẹp
            hơn là cụt mất đuôi — đã dính đúng lỗi đó. */}
        <div className="ad-p-co">
          <div className="ad-p-co-cap">CHUYÊN SẢN XUẤT: CỬA CUỐN CÔNG NGHỆ ÚC/ ĐÚC - CỬA MẮT VÕNG/ SONG NGANG</div>
          {CONG_TY.map((dong) => <div key={dong.nhan}><b>{dong.nhan}</b> {dong.giaTri}</div>)}
        </div>
      </div>

      <h1 className="ad-p-title">ĐƠN BÁN HÀNG</h1>

      <div className="ad-p-info">
        {thongTinTrai.map((dong, index) => (
          <div key={dong.nhan} className="ad-p-info-row" style={{ gridRow: index + 1, gridColumn: 1 }}>
            <span className="ad-p-k">{dong.nhan}:</span><span className="ad-p-v">{dong.giaTri}</span>
          </div>
        ))}
        {thongTinPhai.map((dong, index) => (
          <div key={dong.nhan} className="ad-p-info-row" style={{ gridRow: index + 1, gridColumn: 2 }}>
            <span className="ad-p-k">{dong.nhan}:</span><span className="ad-p-v">{dong.giaTri}</span>
          </div>
        ))}
      </div>

      <table className="ad-p-table">
        <thead>
          <tr>
            <th className="ad-p-nowrap">STT</th>
            <th>Mã hàng</th>
            <th className="ad-p-name-col">Tên hàng</th>
            {coMau ? <th>Màu</th> : null}
            {dynamicColumns.map((fieldname) => (
              <th key={fieldname}>
                {DYNAMIC_FALLBACK_LABELS[fieldname]}
                {DYNAMIC_HEADER_UNITS[fieldname] ? <span className="ad-p-u">({DYNAMIC_HEADER_UNITS[fieldname]})</span> : null}
              </th>
            ))}
            <th className="ad-p-nowrap">SL</th>
            <th className="ad-p-nowrap">ĐVT</th>
            <th className="ad-p-nowrap">Khối lượng</th>
            <th className="ad-p-nowrap">Đơn giá<span className="ad-p-u">(VNĐ)</span></th>
            <th className="ad-p-nowrap">Thành tiền<span className="ad-p-u">(VNĐ)</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const nhomMoTa = doorProductGroups(line, props.customerGroup);
            const khuyenMai = moTaKhuyenMai(line);
            const moTa = [
              ...nhomMoTa.map((nhom) => `${nhom.label}: ${nhom.items.join(" · ")}`),
              ...khuyenMai,
            ].filter(Boolean).join(" · ");
            const oSoLuong = primaryQuantityField(line);
            const chietKhau = lineDiscountTotal(line);
            const phanTramCK = numberValue(line.discount_percentage) ?? linePolicyDiscountPercentage(line);
            const phuThu = lineAdjustmentSplit(line);
            // Tên khoản đã tự mang phần trăm ("Chiết khấu đại lý 15% — AL70"); chỉ khi danh mục
            // không đặt tên mới phải tự dựng nhãn từ số phần trăm.
            const tenChietKhau = phuThu.reductionRules.join(" · ") || `Chiết khấu ${quantity(phanTramCK)}%`;
            const tenPhuThu = surchargeRuleNames(line).join(" · ");
            const thanhTien = numberValue(line._commercial?.gross_amount) ?? numberValue(line.amount);
            const conLai = lineNetAmount(line);
            /*
             * CHỈ HÀNG TRỌN BỘ mới xổ cấu kiện.
             *
             * KHÔNG hỏi `isFullSetSalesItem(line)` — hàm đó chỉ dò chữ "TRỌN BỘ" trong MÃ, mà
             * mã đặt đúng chuẩn thì không nhồi cách bán vào mã: `CDL_DLM_1LY` có định mức đầy
             * đủ nhưng mã không mang chữ đó, nên gạn theo mã là loại đúng những mã mới. Cách
             * bán thật nằm ở ô `sales_mode` của dòng; không có thì mới lui về dò TÊN hàng.
             */
            const tenHang = text(line._itemName) || text(line.item_name);
            const laTronBo = text(line.sales_mode)
              ? text(line.sales_mode) === "Trọn bộ"
              : isFullSetSalesItem(line) || isFullSetSalesItem({ item_code: tenHang });
            const cauKien = laTronBo && mayHaveBom(line) && Array.isArray(line._bomPreview?.components)
              ? line._bomPreview!.components!
              : [];
            const tenCauKien = line._bomComponentNames ?? {};

            return (
              <Fragment key={line._key}>
              <tr className="ad-p-row">
                <td className="ad-p-c ad-p-nowrap">{index + 1}</td>
                <td className="ad-p-c ad-p-code">{text(line.item_code)}</td>
                <td className="ad-p-name-col">
                  <div className="ad-p-prod">{text(line._itemName) || text(line.item_code)}</div>
                  {/* Mô tả xuống DÒNG RIÊNG ngay dưới tên hàng — chủ xưởng chốt 24/08/2026. */}
                  {moTa ? <div className="ad-p-spec">{moTa}</div> : null}
                </td>
                {coMau ? <td className="ad-p-c">{o(text(line.color))}</td> : null}
                {dynamicColumns.map((fieldname) => (
                  <td key={fieldname} className="ad-p-c ad-p-nowrap">
                    {dynamicFieldVisible(line, fieldname, options)
                      ? o(dynamicDisplayValue(fieldname, line[fieldname]))
                      : "—"}
                  </td>
                ))}
                <td className="ad-p-c ad-p-nowrap">{o(quantity(line[oSoLuong]))}</td>
                <td className="ad-p-c ad-p-nowrap">{o(text(line.uom))}</td>
                <td className="ad-p-c ad-p-nowrap">{o(quantity(linePricedQuantity(line)))}</td>
                <td className="ad-p-r ad-p-nowrap">{numberValue(line.rate) === undefined ? "—" : money(line.rate)}</td>
                <td className="ad-p-r ad-p-nowrap ad-p-strong">{thanhTien === undefined ? "—" : money(thanhTien)}</td>
              </tr>

              {/* Dòng phụ nằm NGAY DƯỚI dòng hàng của chính nó, và chỉ mọc khi có số.
                  Nhãn trải hết phần bên trái, chừa đúng cột CK và cột Thành tiền. */}
              {/*
                DÒNG 2 CỦA MỖI MẶT HÀNG (chốt chủ xưởng 24/08/2026):
                  Chiết khấu % · số tiền chiết khấu · Phụ thu · số tiền phụ thu · diễn giải,
                  và Ô CUỐI là số tiền phải trả còn lại.
                Không gộp vào ô Thành tiền của dòng trên: dòng trên là tiền gốc, dòng này là
                phép trừ và kết quả.
              */}
              {chietKhau || phuThu.surcharge ? (
                <tr className="ad-p-sub">
                  <td colSpan={soCot - 1} className="ad-p-c">
                    {/* Tên quy tắc ĐÃ nói "Chiết khấu … 15%", nên không thêm nhãn chung nữa —
                        in cả hai ra thành "Chiết khấu 15%: −1.547.100  Chiết khấu đại lý 15%". */}
                    {chietKhau ? <span className="ad-p-part">{tenChietKhau}: −{money(chietKhau)}</span> : null}
                    {phuThu.surcharge ? <span className="ad-p-part">{tenPhuThu || "Phụ thu"}: +{money(phuThu.surcharge)}</span> : null}
                    {/*
                      "Còn lại dòng N" chứ KHÔNG phải "Tiền phải trả": đơn nhiều dòng thì hai
                      chữ sau trùng nghĩa với "Tiền phải thu" ở khối tổng, và khách đọc số của
                      MỘT dòng thành số của CẢ ĐƠN. Gắn số thứ tự dòng vào là hết đường hiểu lầm.
                    */}
                    <span className="ad-p-payable-label">Còn lại dòng {index + 1}:</span>
                  </td>
                  <td className="ad-p-r ad-p-nowrap ad-p-payable">{money(conLai)}</td>
                </tr>
              ) : null}

              {/*
                XỔ BOM CHO HÀNG TRỌN BỘ (chốt chủ xưởng 24/08/2026).
                Chỉ mã TRỌN BỘ, và chỉ khi mặt hàng đó được phép hiện BOM ở màn bán
                (`_showBomOnSales` — cửa Đức đã tắt). Đây là DANH SÁCH CẤU KIỆN VẬT LÝ: mấy cây,
                mấy lá, mấy cái, mỗi cây cắt dài bao nhiêu. Không có Kg, không có giá vốn.
                Đọc `component_count`/`component_count_uom` chứ KHÔNG đọc `qty`/`uom` — hai ô sau
                là lớp tiêu hao kho, lấy nhầm là cây ray hiện "2 Mét" thay vì "2 Cây".
              */}
              {cauKien.map((phan, viTri) => (
                <tr key={`${line._key}-bom-${viTri}`} className="ad-p-bom">
                  {/* Đánh số như lưới nhập: cấu kiện thứ hai của dòng 1 là 1.2. */}
                  <td className="ad-p-c ad-p-nowrap">{index + 1}.{viTri + 1}</td>
                  <td className="ad-p-c ad-p-code">{text(phan.item_code)}</td>
                  <td className="ad-p-name-col">
                    {/* Tên cấu kiện do màn nhập tra sẵn (`_bomComponentNames`); dòng BOM tự nó
                        thường chỉ có mã. */}
                    <div className="ad-p-bom-name">{text(phan.item_name) || text(tenCauKien[text(phan.item_code)]) || text(phan.item_code)}</div>
                    {/* Quy cách cắt xuống DÒNG RIÊNG, và đơn vị đi theo ĐVT ĐẾM: lá thì
                        "m/lá", cây thì "m/cây" — không đóng cứng chữ "cây". */}
                    {numberValue(phan.cut_length_each_m)
                      ? <div className="ad-p-bom-cut">cắt {quantity(phan.cut_length_each_m)} m/{text(phan.component_count_uom).toLocaleLowerCase("vi") || "cái"}</div>
                      : null}
                  </td>
                  {/* KHÔNG gộp ô: mỗi cột số đo giữ nguyên chỗ và hiện "—", y như lưới nhập.
                      Gộp là số đếm trôi sang vùng tiền — đúng cái vừa bị lệch. */}
                  {coMau ? <td className="ad-p-c">{text(phan.color) || "—"}</td> : null}
                  {dynamicColumns.map((fieldname) => <td key={fieldname} className="ad-p-c">—</td>)}
                  <td className="ad-p-c ad-p-nowrap">
                    {numberValue(phan.component_count) === undefined ? "—" : quantity(phan.component_count)}
                  </td>
                  <td className="ad-p-c ad-p-nowrap">{text(phan.component_count_uom) || "—"}</td>
                  {/* Khối lượng · Đơn giá · Thành tiền: cấu kiện không mang tiền. */}
                  <td className="ad-p-c">—</td>
                  <td className="ad-p-c">—</td>
                  <td className="ad-p-c">—</td>
                </tr>
              ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="ad-p-sum">
        <div className="ad-p-totals">
          <div><span>Tiền hàng</span><span>{money(totals.totalAmount)}</span></div>
          {totals.discountTotal ? <div><span>Chiết khấu</span><span>−{money(totals.discountTotal)}</span></div> : null}
          {totals.surchargeTotal ? <div><span>Phụ thu</span><span>+{money(totals.surchargeTotal)}</span></div> : null}
          <div><span>VAT ({quantity(header.vat_rate ?? 0)}%)</span><span>{money(totals.vatAmount)}</span></div>
          <div className="ad-p-sep" />
          <div className="ad-p-em"><span>Tiền phải thu</span><span>{money(totals.grandTotal)}</span></div>
          {totals.depositAmount ? <div><span>Tiền cọc</span><span>{money(totals.depositAmount)}</span></div> : null}
          <div className="ad-p-em"><span>Còn phải thu</span><span>{money(totals.outstandingAmount)}</span></div>
        </div>
      </div>

      <div className="ad-p-sign">
        <div><b>Khách hàng xác nhận</b><i>(ký, ghi rõ họ tên)</i></div>
        <div><b>Người lập đơn</b><i>(ký, ghi rõ họ tên)</i></div>
        <div><b>Đại diện ALUMDOOR</b><i>(ký, đóng dấu)</i></div>
      </div>
    </div>
  );
}
