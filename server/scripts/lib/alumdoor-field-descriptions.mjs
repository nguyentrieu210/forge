/**
 * Mô tả tiếng Việt cho các trường TÍNH TOÁN.
 *
 * Vì sao cần: một ô hiện ra con số mà không nói con số ấy từ đâu thì người dùng không kiểm được,
 * và người sửa sau không biết được ý định. Audit 19/08 đếm 118 ô như vậy trên 57 tên trường.
 *
 * Khai theo TÊN TRƯỜNG, không theo doctype: `stock_qty` mang cùng một nghĩa ở chín chứng từ, nên
 * mô tả một lần rồi áp cho cả chín — chứ không chép chín lần rồi để chúng trôi dạt khỏi nhau.
 *
 * Nguyên tắc viết: nói con số LÀ GÌ và TỪ ĐÂU RA, kèm hệ quả khi nhìn nhầm. Không viết lại nhãn
 * bằng từ khác — "Đơn giá: đơn giá của mặt hàng" thì thà để trống còn hơn.
 */
export const ALUMDOOR_FIELD_DESCRIPTIONS = {
  // ── tiền và đơn giá ──
  rate: 'Đơn giá cho MỘT đơn vị ở dòng này, chưa gồm thuế. Máy tra từ bảng giá theo mặt hàng + ĐVT + biến thể giá; gõ đè lên đây là bỏ qua giá đã tra.',
  valuation_rate: 'Giá VỐN một đơn vị tồn kho tại thời điểm ghi sổ — không phải giá bán. Đây là con số đi vào giá vốn hàng bán.',
  last_purchase_rate: 'Đơn giá của lần mua gần nhất từ nhà cung cấp này. Chỉ để tham khảo khi đặt hàng, máy không tự lấy làm giá.',
  discount_percentage: 'Phần trăm giảm trên đơn giá gốc. Giảm theo số tiền tuyệt đối thì dùng ô điều chỉnh, không dùng ô này.',
  adjustment_basis: 'Khoản điều chỉnh tính trên cái gì: cố định một cục, theo m², theo mét dài, theo số bộ, hay theo số lượng đã tính giá. Chọn sai thì cùng một con số ra kết quả khác hẳn.',
  adjustment_rate: 'Mức điều chỉnh, hiểu theo đúng cách tính đã chọn ở ô bên cạnh. Ví dụ chọn theo m² thì đây là số tiền cho mỗi m².',
  vat_rate: 'Thuế suất GTGT (%) áp cho chứng từ này.',
  min_qty: 'Số lượng tối thiểu để chính sách giá này có hiệu lực. Dưới mức đó thì dòng bán không được hưởng.',
  max_qty: 'Số lượng tối đa còn được hưởng chính sách giá này. Bỏ trống là không giới hạn trên.',

  // ── diện tích tính tiền ──
  min_area_sqm: 'Diện tích tối thiểu tính tiền cho một bộ. Bộ nhỏ hơn mức này VẪN tính bằng mức này — khai 4 m² thì bộ 3,2 m² vẫn thu tiền 4 m².',
  billable_area_sqm: 'Diện tích đem nhân với đơn giá, SAU khi đã áp diện tích tối thiểu. Khác với diện tích hình học của cửa, và đây mới là con số ra tiền.',
  width_basis: 'Lấy chiều rộng nào để tính: phủ bì ray hay phủ bì nhựa. Hai cách lệch nhau vài phân trên mỗi bộ, cộng dồn cả đơn thì thành tiền thật.',

  // ── quy đổi đơn vị ──
  conversion_factor: 'Một đơn vị ở dòng này bằng bao nhiêu đơn vị tồn kho. Ví dụ 1 Cây = 6 Mét thì hệ số là 6.',
  stock_qty: 'Số lượng đã quy về ĐVT tồn kho = số lượng × hệ số quy đổi. Đây là con số vào thẻ kho, không phải số lượng ghi trên chứng từ bán.',
  rate_uom: 'Đơn giá đang tính theo đơn vị nào. Hàng cân theo kiện thì đơn giá đi theo ĐVT khối lượng, không theo số kiện.',

  // ── công thức cửa ──
  formula_policy: 'Công thức cửa đã áp cho dòng này. Ghi lại để về sau đối chiếu được — sửa công thức sau này KHÔNG làm đổi số đã chốt trên chứng từ cũ.',
  formula_version: 'Phiên bản công thức lúc chốt dòng này. Có nó thì mới giải thích được vì sao hai đơn cùng mặt hàng lại ra số khác nhau.',
  formula_explanation: 'Diễn giải bằng lời cách máy ra con số này, để người bán đọc và kiểm mà không cần mở công thức.',
  formula_snapshot: 'Bản chụp nguyên trạng công thức lúc chốt. Đây là bằng chứng, không phải ô để sửa.',
  formula_json: 'Công thức ở dạng máy đọc. Sửa ở đây là đổi cách tính của mọi dòng dùng quy tắc này.',
  formula_display: 'Công thức viết cho người đọc. Phải khớp với công thức máy chạy — lệch nhau là một trong hai đang nói dối.',
  source_formula_text: 'Công thức chép nguyên văn từ nguồn gốc (bảng tính, tài liệu giấy). Giữ để truy lại khi số máy tính khác số xưởng quen làm.',
  source_formula_code: 'Mã định danh công thức ở hệ nguồn, dùng để đối chiếu ngược khi rà soát.',
  source_formula: 'Công thức gốc của cấu phần này, chép từ nguồn — không phải công thức máy đang chạy.',
  quantity_formula_json: 'Công thức tính số lượng cấu phần, dạng máy đọc. Bỏ trống nghĩa là số lượng cố định.',
  leaf_formula: 'Dạng công thức chia lá theo kiểu cửa. Mỗi kiểu có bước lá và cách trừ riêng, chọn nhầm là sai số lá cả bộ.',
  dealer_width_basis: 'Đại lý nhập hàng thì tính rộng theo phủ bì nào.',
  retail_width_basis: 'Bán lẻ thì tính rộng theo phủ bì nào. Để khác đại lý được, vì hai kênh chào giá khác nhau.',
  dealer_split_sales_basis: 'Đại lý mua TÁCH MÓN thì tính tiền trên cơ sở nào.',
  dealer_full_sales_basis: 'Đại lý mua TRỌN BỘ thì tính tiền trên cơ sở nào.',
  retail_sales_basis: 'Bán lẻ thì tính tiền trên cơ sở nào.',
  purchase_formula: 'Công thức quy ra lượng vật tư cần mua cho bộ cửa này.',
  purchase_height_basis: 'Chiều cao dùng khi tính lượng mua — có thể khác chiều cao tính tiền cho khách.',
  purchase_width_basis: 'Chiều rộng dùng khi tính lượng mua — có thể khác chiều rộng tính tiền cho khách.',

  // ── theo dõi số lượng ──
  available_qty: 'Số còn có thể bán, tính theo ĐVT của dòng bán: tồn kho trừ phần đã giữ cho đơn khác.',
  available_stock_qty: 'Số còn có thể bán, quy về ĐVT tồn kho. Cùng một con số với ô bên trên nhưng khác đơn vị.',
  delivered_qty: 'Đã giao bao nhiêu trên dòng này. Máy cộng từ phiếu giao, không gõ tay.',
  delivered_percentage: 'Phần trăm đã giao của cả đơn, tính theo số lượng chứ không theo tiền.',
  billed_percentage: 'Phần trăm đã xuất hoá đơn của cả đơn, tính theo tiền.',
  received_percentage: 'Phần trăm đã nhận của đơn mua, tính theo số lượng.',
  produced_qty: 'Đã sản xuất xong bao nhiêu. Máy cộng từ phiếu ghi nhận sản xuất.',
  produced_percentage: 'Phần trăm đã sản xuất so với lệnh.',
  output_qty: 'Số lượng thành phẩm mà yêu cầu sản xuất này cần ra.',
  finished_good_qty: 'Số thành phẩm nhập kho từ phiếu này.',
  total_qty: 'Tổng số lượng của mọi dòng trên chứng từ, đã quy về cùng ĐVT tồn kho.',
  reorder_qty: 'Đặt thêm bao nhiêu mỗi lần khi tồn chạm mức báo. Không phải mức tồn tối thiểu.',
  minimum_order_qty: 'Nhà cung cấp này chỉ nhận đơn từ mức này trở lên.',

  // ── kiểm kê ──
  book_qty: 'Số lượng theo sổ sách tại thời điểm kiểm — máy lấy, không gõ tay.',
  counted_qty: 'Số lượng đếm thực tế tại kho. Đây là ô người kiểm nhập.',
  variance_qty: 'Chênh lệch = đếm thực tế trừ sổ sách. Dương là thừa, âm là thiếu.',

  // ── bảo hành ──
  received_fault_qty: 'Số hàng lỗi đã nhận về từ khách.',
  replacement_qty: 'Số hàng đã đổi trả cho khách.',
  warranty_sent_qty: 'Số đã gửi đi bảo hành cho nhà cung cấp.',
  warranty_received_qty: 'Số đã nhận lại sau bảo hành. Chênh với số gửi đi là còn đang nằm ngoài.',

  // ── theo dõi vật tư ──
  require_piece_qty: 'Bật thì mặt hàng này bắt buộc khai số cây/số tấm bên cạnh số mét — dùng cho hàng vừa đếm cây vừa tính mét.',
  track_bundle_qty: 'Bật thì theo dõi thêm số kiện/bó, ngoài khối lượng.',

  // ── khác ──
  generated_by_configurator: 'Định mức này do máy sinh từ cấu hình đơn hàng, không phải người lập. Sửa tay sẽ bị ghi đè ở lần sinh sau.',
};

/**
 * Gắn mô tả vào mọi trường khớp tên mà CHƯA có mô tả.
 *
 * Trường khai bằng chuỗi rút gọn không có chỗ đặt mô tả nên phải nở thành đối tượng — và việc
 * nở đó dùng `parseField` của chính bộ biên dịch, KHÔNG viết lại. Lý do có ngay trong chú thích
 * của nó: `notes:Small Text Ghi chú` mà cắt theo dấu cách đầu tiên thì ra kiểu trường tên
 * "Small". Frappe có nhiều kiểu hai từ nên đó là ca thường gặp, không phải ca hiếm.
 *
 * Không đè lên mô tả sẵn có: chỗ nào đã viết riêng cho ngữ cảnh của nó thì bản riêng đúng hơn
 * bản chung. Trả về số ô đã gắn để bên gọi ghi nhật ký.
 */
export function applyFieldDescriptions(doctypes, parseField, dictionary = ALUMDOOR_FIELD_DESCRIPTIONS) {
  let applied = 0;
  for (const doctype of doctypes) {
    const fields = doctype.fields ?? [];
    for (let index = 0; index < fields.length; index += 1) {
      const raw = fields[index];
      const fieldname = typeof raw === "string" ? raw.split(":")[0].trim() : raw?.fieldname;
      if (!fieldname) continue;
      const description = dictionary[fieldname];
      if (!description) continue;
      if (typeof raw !== "string") {
        if (raw.description) continue;
        raw.description = description;
        applied += 1;
        continue;
      }
      const expanded = parseField(raw, index, `doctype ${doctype.name}`);
      if (expanded.description) continue;
      expanded.description = description;
      fields[index] = expanded;
      applied += 1;
    }
  }
  return applied;
}
