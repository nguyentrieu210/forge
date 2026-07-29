-- Alumdoor 1.22.0: full compiler-normalized metadata release.
-- Equivalent data shape to AppInstaller.install; generated at statement boundaries.

INSERT INTO workflows(
  tenant_id,name,document_type,is_active,revision,workflow_json,modified_by,modified_at
)
SELECT
  'alu','Chốt báo giá','Quotation',1,
  COALESCE((SELECT revision+1 FROM workflows WHERE tenant_id='alu' AND name='Chốt báo giá'),1),
  json_set(
    json('{"name":"Chốt báo giá","document_type":"Quotation","state_field":"workflow_state","is_active":true,"states":[{"state":"Nháp","docstatus":0},{"state":"Đã gửi khách","docstatus":0},{"state":"Khách đồng ý","docstatus":1},{"state":"Khách từ chối","docstatus":2}],"transitions":[{"state":"Nháp","action":"Gửi khách","next_state":"Đã gửi khách","allowed_role":"Kinh doanh","allow_self_approval":false},{"state":"Đã gửi khách","action":"Sửa lại","next_state":"Nháp","allowed_role":"Kinh doanh","allow_self_approval":false},{"state":"Đã gửi khách","action":"Khách đồng ý","next_state":"Khách đồng ý","allowed_role":"Kinh doanh","allow_self_approval":true},{"state":"Đã gửi khách","action":"Khách từ chối","next_state":"Khách từ chối","allowed_role":"Kinh doanh","allow_self_approval":true}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM workflows WHERE tenant_id='alu' AND name='Chốt báo giá'),1)
  ),
  'admin','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  document_type=excluded.document_type,is_active=excluded.is_active,revision=excluded.revision,
  workflow_json=excluded.workflow_json,modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Hoá đơn ALUMDOOR','Sales Invoice',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Hoá đơn ALUMDOOR'),1),
  json_set(
    json('{"name":"Hoá đơn ALUMDOOR","doc_type":"Sales Invoice","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Hoá đơn bán hàng</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ posting_at | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Khách hàng</b><span>{{ customer }}</span></div>\n  <div class=\"row\"><b>Hạn thanh toán</b><span>{{ due_date | date }}</span></div>\n  <div class=\"row\"><b>Theo đơn hàng</b><span>{{ against_sales_order }}</span></div>\n  <div class=\"row\"><b>Tiền tệ</b><span>{{ currency }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Số lượng</th><th class=\"n\">Đơn giá</th><th class=\"n\">Thành tiền</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}</td><td class=\"n\">{{ qty | number }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"tot\">\n  <div class=\"row\"><span>Tổng cộng</span><span>{{ grand_total | money }} ₫</span></div>\n  <div class=\"row big\"><span>Còn phải thu</span><span>{{ outstanding_amount | money }} ₫</span></div>\n</div>\n<div class=\"sign\"><div><b>Người mua hàng</b>(ký, ghi rõ họ tên)</div><div><b>Người lập phiếu</b>(ký, ghi rõ họ tên)</div><div><b>Đại diện ALUMDOOR</b>(ký, đóng dấu)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Hoá đơn ALUMDOOR'),1)
  ),
  'admin','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Phiếu sản xuất','Work Order',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu sản xuất'),1),
  json_set(
    json('{"name":"Phiếu sản xuất","doc_type":"Work Order","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Phiếu sản xuất</div><div class=\"no\">Số: {{ name }}<br>Hẹn giao: {{ planned_end_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Thành phẩm</b><span>{{ production_item }}</span></div>\n  <div class=\"row\"><b>Theo đơn hàng</b><span>{{ against_sales_order }}</span></div>\n  <div class=\"row\"><b>Màu / mã sơn</b><span>{{ color }}</span></div>\n  <div class=\"row\"><b>Mô tơ</b><span>{{ motor_model }}</span></div>\n  <div class=\"row\"><b>Kho vật tư</b><span>{{ source_warehouse }}</span></div>\n  <div class=\"row\"><b>Kho nhập TP</b><span>{{ target_warehouse }}</span></div>\n</div>\n<div class=\"meas\"><div>RỘNG<div class=\"big\">{{ width_mm }} mm</div></div><div>CAO<div class=\"big\">{{ height_mm }} mm</div></div><div>SỐ BỘ<div class=\"big\">{{ set_count }}</div></div></div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Vật tư cần</th><th class=\"n\">Định mức</th><th>Kho xuất</th><th style=\"width:110px\">Thực xuất</th></tr></thead><tbody>\n{{#each required_items}}<tr><td>{{ _index }}</td><td>{{ item_code }}</td><td class=\"n\">{{ required_qty | number }}</td><td>{{ source_warehouse }}</td><td></td></tr>{{/each}}\n</tbody></table>\n<div class=\"note\">Địa chỉ lắp đặt: {{ install_address }}\nGhi chú xưởng: {{ note }}</div>\n<div class=\"sign\"><div><b>Tổ trưởng</b>(ký)</div><div><b>Thợ thực hiện</b>(ký)</div><div><b>KCS nghiệm thu</b>(ký)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}\n.big{font-size:26px;font-weight:800;letter-spacing:1px}\n.meas{background:#fff4f4;border:2px solid #c1121f;padding:12px;margin:12px 0;display:flex;gap:36px;justify-content:center;text-align:center}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu sản xuất'),1)
  ),
  'admin','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Báo giá ALUMDOOR','Quotation',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Báo giá ALUMDOOR'),1),
  json_set(
    json('{"name":"Báo giá ALUMDOOR","doc_type":"Quotation","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Báo giá</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ transaction_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Khách hàng</b><span>{{ customer }}</span></div>\n  <div class=\"row\"><b>Người liên hệ</b><span>{{ contact_person }} {{ phone }}</span></div>\n  <div class=\"row\"><b>Công trình</b><span>{{ install_address }}</span></div>\n  <div class=\"row\"><b>Hiệu lực đến</b><span>{{ valid_till | date }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Hạng mục</th><th class=\"n\">Rộng</th><th class=\"n\">Cao</th><th class=\"n\">Bộ</th><th class=\"n\">Khối lượng</th><th class=\"n\">Đơn giá</th><th class=\"n\">Thành tiền</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br><span class=\"sub\">{{ color }}</span></td><td class=\"n\">{{ width_mm }}</td><td class=\"n\">{{ height_mm }}</td><td class=\"n\">{{ set_count }}</td><td class=\"n\">{{ qty | number }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"tot\"><div class=\"row big\"><span>Tổng cộng</span><span>{{ grand_total | money }} ₫</span></div></div>\n<div class=\"note\">Thanh toán: {{ payment_terms }}\nBảo hành: {{ warranty_note }}\nGhi chú: {{ note }}</div>\n<div class=\"sign\"><div><b>Khách hàng xác nhận</b>(ký, ghi rõ họ tên)</div><div></div><div><b>Đại diện ALUMDOOR</b>(ký, đóng dấu)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Báo giá ALUMDOOR'),1)
  ),
  'admin','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Đơn mua hàng ALUMDOOR','Purchase Order',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Đơn mua hàng ALUMDOOR'),1),
  json_set(
    json('{"name":"Đơn mua hàng ALUMDOOR","doc_type":"Purchase Order","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Đơn đặt hàng</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ transaction_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Nhà cung cấp</b><span>{{ supplier }}</span></div>\n  <div class=\"row\"><b>Ngày hẹn giao</b><span>{{ schedule_date | date }}</span></div>\n  <div class=\"row\"><b>Theo báo giá</b><span>{{ supplier_quotation }}</span></div>\n  <div class=\"row\"><b>Tiền tệ</b><span>{{ currency }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Số lượng</th><th>ĐVT</th><th class=\"n\">Quy ra</th><th class=\"n\">Đơn giá</th><th class=\"n\">Thành tiền</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br><span class=\"sub\">{{ note }}</span></td><td class=\"n\">{{ qty | number }}</td><td>{{ uom }}</td><td class=\"n\">{{ stock_qty | number }} {{ stock_uom }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"tot\"><div class=\"row big\"><span>Tổng cộng</span><span>{{ grand_total | money }} ₫</span></div></div>\n<div class=\"note\">Giao hàng tại: Xưởng 1 — 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM\nGhi chú: {{ note }}</div>\n<div class=\"sign\"><div><b>Nhà cung cấp xác nhận</b>(ký, đóng dấu)</div><div><b>Người lập đơn</b>(ký, ghi rõ họ tên)</div><div><b>Đại diện ALUMDOOR</b>(ký, đóng dấu)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Đơn mua hàng ALUMDOOR'),1)
  ),
  'admin','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Phiếu nhập kho ALUMDOOR','Purchase Receipt',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu nhập kho ALUMDOOR'),1),
  json_set(
    json('{"name":"Phiếu nhập kho ALUMDOOR","doc_type":"Purchase Receipt","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Phiếu nhập kho</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ posting_at | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Nhà cung cấp</b><span>{{ supplier }}</span></div>\n  <div class=\"row\"><b>Số phiếu giao NCC</b><span>{{ supplier_invoice_no }}</span></div>\n  <div class=\"row\"><b>Đơn mua</b><span>{{ against_purchase_order }}</span></div>\n  <div class=\"row\"><b>Người giao</b><span>{{ driver }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Thực nhận</th><th>ĐVT</th><th class=\"n\">Vào kho</th><th>Kho</th><th>Theo đơn</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}</td><td class=\"n\">{{ qty | number }}</td><td>{{ uom }}</td><td class=\"n\">{{ stock_qty | number }} {{ stock_uom }}</td><td>{{ warehouse }}</td><td>{{ purchase_order }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"note\">Ghi chú: {{ note }}</div>\n<div class=\"sign\"><div><b>Người giao hàng</b>(ký, ghi rõ họ tên)</div><div><b>Thủ kho</b>(ký, ghi rõ họ tên)</div><div><b>Phụ trách xưởng</b>(ký)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu nhập kho ALUMDOOR'),1)
  ),
  'admin','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Yêu cầu báo giá ALUMDOOR','Request for Quotation',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Yêu cầu báo giá ALUMDOOR'),1),
  json_set(
    json('{"name":"Yêu cầu báo giá ALUMDOOR","doc_type":"Request for Quotation","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Yêu cầu báo giá</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ transaction_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Hạn trả lời</b><span>{{ response_by | date }}</span></div>\n  <div class=\"row\"><b>Theo yêu cầu VT</b><span>{{ material_request }}</span></div>\n</div>\n<p class=\"sub\">Kính gửi Quý nhà cung cấp — ALUMDOOR đề nghị báo giá cho các mặt hàng dưới đây. Xin điền đơn giá và số ngày giao vào hai cột để trống.</p>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Số lượng</th><th>ĐVT</th><th class=\"n\">Cần trước</th><th class=\"n\">Đơn giá NCC chào</th><th class=\"n\">Số ngày giao</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br><span class=\"sub\">{{ note }}</span></td><td class=\"n\">{{ qty | number }}</td><td>{{ uom }}</td><td class=\"n\">{{ schedule_date | date }}</td><td class=\"fill\"></td><td class=\"fill\"></td></tr>{{/each}}\n</tbody></table>\n<div class=\"note\">Điều kiện mong muốn: {{ note }}\nGiao hàng tại: Xưởng 1 — 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div>\n<div class=\"sign\"><div><b>Nhà cung cấp báo giá</b>(ký, ghi rõ họ tên, đóng dấu)</div><div><b>Người lập yêu cầu</b>(ký, ghi rõ họ tên)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\ntd.fill{background:#fffbe6;min-width:110px}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:45%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Yêu cầu báo giá ALUMDOOR'),1)
  ),
  'admin','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Company','ALUMDOOR',0,
       '{"label":"ALUMDOOR — Cửa cuốn công nghệ Đức/Úc","abbr":"AD","default_currency":"VND","default_inventory_account":"Hàng tồn kho","default_cogs_account":"Giá vốn hàng bán"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Currency','VND',0,
       '{"currency_scale":0}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Cái',0,
       '{"uom_name":"Cái","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Bộ',0,
       '{"uom_name":"Bộ","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Kg',0,
       '{"uom_name":"Kg"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Mét',0,
       '{"uom_name":"Mét"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','m2',0,
       '{"uom_name":"m2"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Cây',0,
       '{"uom_name":"Cây","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Thanh',0,
       '{"uom_name":"Thanh","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Sợi',0,
       '{"uom_name":"Sợi","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Cuộn',0,
       '{"uom_name":"Cuộn","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Tấm',0,
       '{"uom_name":"Tấm","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Túi',0,
       '{"uom_name":"Túi","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Hộp',0,
       '{"uom_name":"Hộp","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Bình',0,
       '{"uom_name":"Bình","must_be_whole_number":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Lít',0,
       '{"uom_name":"Lít"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Tất cả mặt hàng',0,
       '{"item_group_name":"Tất cả mặt hàng","is_group":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Thành phẩm',0,
       '{"item_group_name":"Thành phẩm","parent_item_group":"Tất cả mặt hàng","is_group":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Nguyên vật liệu',0,
       '{"item_group_name":"Nguyên vật liệu","parent_item_group":"Tất cả mặt hàng","is_group":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Linh kiện & thiết bị',0,
       '{"item_group_name":"Linh kiện & thiết bị","parent_item_group":"Tất cả mặt hàng","is_group":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Dịch vụ',0,
       '{"item_group_name":"Dịch vụ","parent_item_group":"Tất cả mặt hàng"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Cửa cuốn',0,
       '{"item_group_name":"Cửa cuốn","parent_item_group":"Thành phẩm"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Cửa nhôm kính',0,
       '{"item_group_name":"Cửa nhôm kính","parent_item_group":"Thành phẩm"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Nan/lá cửa',0,
       '{"item_group_name":"Nan/lá cửa","parent_item_group":"Nguyên vật liệu"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Mô tơ',0,
       '{"item_group_name":"Mô tơ","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Ray và trục',0,
       '{"item_group_name":"Ray và trục","parent_item_group":"Nguyên vật liệu"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Phụ kiện',0,
       '{"item_group_name":"Phụ kiện","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Remote và điều khiển',0,
       '{"item_group_name":"Remote và điều khiển","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Bộ lưu điện',0,
       '{"item_group_name":"Bộ lưu điện","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Warehouse','Kho Alumdoor',0,
       '{"warehouse_name":"Kho Alumdoor","is_group":true,"disabled":false}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Warehouse','K36',0,
       '{"warehouse_name":"K36","parent_warehouse":"Kho Alumdoor","is_group":false,"address":"Kho vật lý K36","disabled":false}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Warehouse','K12',0,
       '{"warehouse_name":"K12","parent_warehouse":"Kho Alumdoor","is_group":false,"address":"Kho vật lý K12","disabled":false}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Cutting Policy','Cửa Đức — đại lý',0,
       '{"policy_name":"Cửa Đức — đại lý","customer_group":"Đại lý","item_group":"Cửa CN Đức","width_basis":"Phủ bì nhựa","cut_deduction_m":0.02,"note":"Chủ xưởng xác nhận 2026-07-29. BRD 25/7: ''Khách đại lý: kích thước pb nhựa − 0,02''."}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Cutting Policy','Cửa Đức — khách lẻ',0,
       '{"policy_name":"Cửa Đức — khách lẻ","customer_group":"Lẻ","item_group":"Cửa CN Đức","width_basis":"Phủ bì ray","cut_deduction_m":0.08,"note":"Chủ xưởng xác nhận 2026-07-29 là 0,08 (BRD 25/7 ghi 0,06 — bản BRD cũ). Công trình và nhà thầu tính như khách lẻ."}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Measurement Profile','Hàng thường',0,
       '{"profile_name":"Hàng thường","inventory_mode":"Hàng thường","stock_uom":"Cái"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Measurement Profile','Nhôm cây/lá',0,
       '{"profile_name":"Nhôm cây/lá","inventory_mode":"Nhôm cây/lá","stock_uom":"Kg","track_dimension_lot":true,"require_color":true,"require_length":true,"require_piece_qty":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Measurement Profile','Tấm/Kính',0,
       '{"profile_name":"Tấm/Kính","inventory_mode":"Tấm/Kính","stock_uom":"Tấm","track_dimension_lot":true,"require_length":true,"require_width":true,"require_piece_qty":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Measurement Profile','Cuộn',0,
       '{"profile_name":"Cuộn","inventory_mode":"Cuộn","stock_uom":"Kg","track_dimension_lot":true,"require_width":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Measurement Profile','Lô/Serial',0,
       '{"profile_name":"Lô/Serial","inventory_mode":"Lô/Serial","stock_uom":"Cái"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Measurement Profile','Thành phẩm theo m2',0,
       '{"profile_name":"Thành phẩm theo m2","inventory_mode":"Thành phẩm theo m2","stock_uom":"Bộ","require_color":true,"require_length":true,"require_width":true}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Phải thu khách hàng',0,
       '{"account_type":"Receivable"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Doanh thu bán hàng',0,
       '{"account_type":"Income"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Giá vốn hàng bán',0,
       '{"account_type":"Expense"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Hàng tồn kho',0,
       '{"account_type":"Asset"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Tiền mặt',0,
       '{"account_type":"Asset"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Tiền gửi ngân hàng',0,
       '{"account_type":"Asset"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Chênh lệch làm tròn',0,
       '{"account_type":"Expense"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Phải trả người bán',0,
       '{"account_type":"Payable"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Account','Hàng nhận chưa có hoá đơn',0,
       '{"account_type":"Liability"}','2026-07-29T10:33:39.202Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

DELETE FROM app_objects
WHERE tenant_id='alu' AND app_id='alumdoor' AND EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  );

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ('alu','alumdoor','DocType','UOM',''),('alu','alumdoor','DocType','Item Group',''),('alu','alumdoor','DocType','Brand',''),('alu','alumdoor','DocType','Manufacturer',''),('alu','alumdoor','DocType','Item Color',''),('alu','alumdoor','DocType','Item Allowed Color',''),('alu','alumdoor','DocType','Material Grade',''),('alu','alumdoor','DocType','Material Specification',''),('alu','alumdoor','DocType','Item Attribute Value',''),('alu','alumdoor','DocType','Item Attribute',''),('alu','alumdoor','DocType','Item Variant Attribute',''),('alu','alumdoor','DocType','Item Barcode',''),('alu','alumdoor','DocType','Item Default',''),('alu','alumdoor','DocType','Item Reorder',''),('alu','alumdoor','DocType','Supplier Item',''),('alu','alumdoor','DocType','Measurement Profile',''),('alu','alumdoor','DocType','Item',''),('alu','alumdoor','DocType','UOM Conversion',''),('alu','alumdoor','DocType','Warehouse',''),('alu','alumdoor','DocType','Customer',''))
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ('alu','alumdoor','DocType','Price List',''),('alu','alumdoor','DocType','Item Price',''),('alu','alumdoor','DocType','Pricing Rule',''),('alu','alumdoor','DocType','Cutting Policy',''),('alu','alumdoor','DocType','Quotation Item',''),('alu','alumdoor','DocType','Quotation',''),('alu','alumdoor','DocType','Sales Order Item',''),('alu','alumdoor','DocType','Sales Order',''),('alu','alumdoor','DocType','Delivery Note Item',''),('alu','alumdoor','DocType','Delivery Note',''),('alu','alumdoor','DocType','Aluminium Lot',''),('alu','alumdoor','DocType','Aluminium Cut',''),('alu','alumdoor','DocType','Stock Entry Item',''),('alu','alumdoor','DocType','Stock Entry',''),('alu','alumdoor','DocType','Sales Invoice Item',''),('alu','alumdoor','DocType','Sales Invoice',''),('alu','alumdoor','DocType','Payment Entry',''),('alu','alumdoor','DocType','BOM Item',''),('alu','alumdoor','DocType','Supplier',''),('alu','alumdoor','DocType','Material Request Item',''))
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ('alu','alumdoor','DocType','Material Request',''),('alu','alumdoor','DocType','RFQ Supplier',''),('alu','alumdoor','DocType','Request for Quotation',''),('alu','alumdoor','DocType','Supplier Quotation Item',''),('alu','alumdoor','DocType','Supplier Quotation',''),('alu','alumdoor','DocType','Purchase Order Item',''),('alu','alumdoor','DocType','Purchase Order',''),('alu','alumdoor','DocType','Purchase Receipt Item',''),('alu','alumdoor','DocType','Purchase Receipt',''),('alu','alumdoor','DocType','Purchase Invoice Item',''),('alu','alumdoor','DocType','Purchase Invoice',''),('alu','alumdoor','DocType','Stock Return Item',''),('alu','alumdoor','DocType','Stock Return',''),('alu','alumdoor','DocType','Debit Note Item',''),('alu','alumdoor','DocType','Debit Note',''),('alu','alumdoor','DocType','Bill of Materials',''),('alu','alumdoor','DocType','Work Order',''),('alu','alumdoor','DocType','Legacy Sales Order Item',''),('alu','alumdoor','DocType','Legacy Sales Order',''),('alu','alumdoor','DocType','Legacy Goods Intake',''))
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ('alu','alumdoor','DocType','Warranty Claim',''),('alu','alumdoor','DocType','Production Standard',''),('alu','alumdoor','Workflow','Chốt báo giá',''),('alu','alumdoor','Print Format','Hoá đơn ALUMDOOR',''),('alu','alumdoor','Print Format','Phiếu sản xuất',''),('alu','alumdoor','Print Format','Báo giá ALUMDOOR',''),('alu','alumdoor','Print Format','Đơn mua hàng ALUMDOOR',''),('alu','alumdoor','Print Format','Phiếu nhập kho ALUMDOOR',''),('alu','alumdoor','Print Format','Yêu cầu báo giá ALUMDOOR',''),('alu','alumdoor','Role','Chủ xưởng',''),('alu','alumdoor','Role','Kinh doanh',''),('alu','alumdoor','Role','Thủ kho',''),('alu','alumdoor','Role','Kế toán',''),('alu','alumdoor','Role','Sản xuất',''),('alu','alumdoor','Master Record','ALUMDOOR','Company'),('alu','alumdoor','Master Record','VND','Currency'),('alu','alumdoor','Master Record','Cái','UOM'),('alu','alumdoor','Master Record','Bộ','UOM'),('alu','alumdoor','Master Record','Kg','UOM'),('alu','alumdoor','Master Record','Mét','UOM'))
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ('alu','alumdoor','Master Record','m2','UOM'),('alu','alumdoor','Master Record','Cây','UOM'),('alu','alumdoor','Master Record','Thanh','UOM'),('alu','alumdoor','Master Record','Sợi','UOM'),('alu','alumdoor','Master Record','Cuộn','UOM'),('alu','alumdoor','Master Record','Tấm','UOM'),('alu','alumdoor','Master Record','Túi','UOM'),('alu','alumdoor','Master Record','Hộp','UOM'),('alu','alumdoor','Master Record','Bình','UOM'),('alu','alumdoor','Master Record','Lít','UOM'),('alu','alumdoor','Master Record','Tất cả mặt hàng','Item Group'),('alu','alumdoor','Master Record','Thành phẩm','Item Group'),('alu','alumdoor','Master Record','Nguyên vật liệu','Item Group'),('alu','alumdoor','Master Record','Linh kiện & thiết bị','Item Group'),('alu','alumdoor','Master Record','Dịch vụ','Item Group'),('alu','alumdoor','Master Record','Cửa cuốn','Item Group'),('alu','alumdoor','Master Record','Cửa nhôm kính','Item Group'),('alu','alumdoor','Master Record','Nan/lá cửa','Item Group'),('alu','alumdoor','Master Record','Mô tơ','Item Group'),('alu','alumdoor','Master Record','Ray và trục','Item Group'))
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ('alu','alumdoor','Master Record','Phụ kiện','Item Group'),('alu','alumdoor','Master Record','Remote và điều khiển','Item Group'),('alu','alumdoor','Master Record','Bộ lưu điện','Item Group'),('alu','alumdoor','Master Record','Kho Alumdoor','Warehouse'),('alu','alumdoor','Master Record','K36','Warehouse'),('alu','alumdoor','Master Record','K12','Warehouse'),('alu','alumdoor','Master Record','Cửa Đức — đại lý','Cutting Policy'),('alu','alumdoor','Master Record','Cửa Đức — khách lẻ','Cutting Policy'),('alu','alumdoor','Master Record','Hàng thường','Measurement Profile'),('alu','alumdoor','Master Record','Nhôm cây/lá','Measurement Profile'),('alu','alumdoor','Master Record','Tấm/Kính','Measurement Profile'),('alu','alumdoor','Master Record','Cuộn','Measurement Profile'),('alu','alumdoor','Master Record','Lô/Serial','Measurement Profile'),('alu','alumdoor','Master Record','Thành phẩm theo m2','Measurement Profile'),('alu','alumdoor','Master Record','Phải thu khách hàng','Account'),('alu','alumdoor','Master Record','Doanh thu bán hàng','Account'),('alu','alumdoor','Master Record','Giá vốn hàng bán','Account'),('alu','alumdoor','Master Record','Hàng tồn kho','Account'),('alu','alumdoor','Master Record','Tiền mặt','Account'),('alu','alumdoor','Master Record','Tiền gửi ngân hàng','Account'))
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ('alu','alumdoor','Master Record','Chênh lệch làm tròn','Account'),('alu','alumdoor','Master Record','Phải trả người bán','Account'),('alu','alumdoor','Master Record','Hàng nhận chưa có hoá đơn','Account'))
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d'
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

UPDATE installed_apps
SET manifest_json=json_set(manifest_json,'$.doctypes',json('[]')),
    modified_at='2026-07-29T10:33:39.202Z'
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d';

UPDATE installed_apps
SET manifest_json=json_insert(manifest_json,'$.doctypes[#]',json('{"name":"UOM","label":"Đơn vị tính","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:uom_name","title_field":"uom_name","sort_order":"DESC","search_fields":["uom_name"],"fields":[{"fieldname":"uom_name","label":"Tên đơn vị","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"must_be_whole_number","label":"Chỉ nhận số nguyên","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}')),
    modified_at='2026-07-29T10:33:39.202Z'
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d';

UPDATE installed_apps
SET manifest_json=json_insert(manifest_json,'$.doctypes[#]',json('{"name":"Item Group","label":"Nhóm hàng","module":"Alumdoor","custom":false,"is_child":false,"is_tree":true,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:item_group_name","title_field":"item_group_name","sort_order":"DESC","search_fields":["item_group_name"],"fields":[{"fieldname":"item_group_name","label":"Tên nhóm","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"parent_item_group","label":"Nhóm cha","fieldtype":"Link","options":"Item Group","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"is_group","label":"Là nhóm chứa","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"default_inventory_account","label":"TK tồn kho mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"default_cogs_account","label":"TK giá vốn mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"default_income_account","label":"TK doanh thu mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"default_expense_account","label":"TK chi phí mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}')),
    modified_at='2026-07-29T10:33:39.202Z'
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d';

UPDATE installed_apps
SET manifest_json=json_insert(manifest_json,'$.doctypes[#]',json('{"name":"Brand","label":"Thương hiệu","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:brand_name","title_field":"brand_name","sort_order":"DESC","search_fields":["brand_name"],"fields":[{"fieldname":"brand_name","label":"Tên thương hiệu","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"country","label":"Quốc gia","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"website","label":"Website","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}')),
    modified_at='2026-07-29T10:33:39.202Z'
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>'bc72c9747639a714cfacb480af5f54721c7b38d39f8188650ca5f641e1aad01d';
