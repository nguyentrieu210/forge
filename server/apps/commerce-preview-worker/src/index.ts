const PAGE = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Forge Omnichannel Commerce ERP — Preview</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f6f9}*{box-sizing:border-box}body{margin:0;background:#f4f6f9}.shell{min-height:100vh;display:grid;grid-template-columns:230px 1fr}.side{background:#111827;color:#d5dbea;padding:22px 16px;position:sticky;top:0;height:100vh}.brand{display:flex;gap:10px;align-items:center;margin:2px 8px 28px}.logo{width:34px;height:34px;border-radius:10px;background:#fff;color:#111827;display:grid;place-items:center;font-weight:800}.brand small{display:block;color:#8e9aae;margin-top:2px}.nav{display:grid;gap:5px}.nav div{padding:10px 12px;border-radius:9px;font-size:13px}.nav .active{background:#263143;color:#fff}.nav .group{padding:18px 12px 6px;color:#6f7c91;text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:.12em}.main{min-width:0}.top{height:68px;background:#fff;border-bottom:1px solid #e5e8ef;display:flex;align-items:center;justify-content:space-between;padding:0 28px}.top strong{font-size:15px}.tag{background:#fff3d7;color:#8b5a00;border:1px solid #f2d38a;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700}.content{padding:26px;max-width:1480px;margin:auto}.title-row{display:flex;justify-content:space-between;gap:18px;align-items:end;margin-bottom:22px}.title-row h1{margin:0;font-size:27px;letter-spacing:-.025em}.title-row p{margin:7px 0 0;color:#6b7280;font-size:13px}.channels{display:flex;gap:8px;flex-wrap:wrap}.channel{background:#fff;border:1px solid #e2e6ed;border-radius:9px;padding:8px 10px;font-size:12px;font-weight:650;box-shadow:0 1px 2px #00000008}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a;margin-right:7px}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card,.panel{background:#fff;border:1px solid #e2e6ed;border-radius:14px;box-shadow:0 2px 5px #11182708}.card{padding:17px}.card .label{color:#768195;font-size:11px}.card .value{font-size:25px;font-weight:760;margin-top:7px}.card .sub{font-size:11px;color:#15803d;margin-top:5px}.grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(310px,.75fr);gap:14px;margin-top:14px}.panel{padding:18px}.panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}.panel-head h2{font-size:14px;margin:0}.panel-head span{font-size:11px;color:#64748b}.table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;min-width:760px}.table th{text-align:left;color:#7b8598;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:10px 8px;border-bottom:1px solid #edf0f4}.table td{font-size:12px;padding:12px 8px;border-bottom:1px solid #f0f2f5;white-space:nowrap}.order{font-weight:700;color:#263652}.money{text-align:right!important;font-variant-numeric:tabular-nums}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:700}.confirmed{background:#e8f7ee;color:#15733b}.packing{background:#fff4db;color:#8b5c08}.issue{background:#feecec;color:#a72c2c}.mapped{background:#ecf3ff;color:#315fa9}.queue{display:grid;gap:10px}.queue-item{border:1px solid #e7eaf0;border-radius:11px;padding:12px}.queue-item strong{font-size:12px}.queue-item p{font-size:11px;color:#6b7280;margin:5px 0 0;line-height:1.45}.severity{font-size:10px;font-weight:700;float:right}.warn{color:#a16207}.bad{color:#b42318}.ok{color:#15803d}.flow{display:flex;align-items:center;gap:7px;overflow:auto;padding:2px 0 4px}.step{min-width:max-content;background:#f7f8fa;border:1px solid #e4e8ef;border-radius:9px;padding:8px 10px;font-size:11px;font-weight:650}.arrow{color:#9ba5b5}.footer-note{margin-top:14px;color:#7a8495;font-size:11px}.mobile-only{display:none}@media(max-width:1000px){.shell{grid-template-columns:76px 1fr}.side{padding:18px 10px}.brand span,.nav div span{display:none}.brand{justify-content:center;margin-left:0;margin-right:0}.nav div{height:38px;text-align:center;padding:10px 3px}.nav .group{font-size:0;height:12px;padding:6px}.cards{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:640px){.shell{display:block}.side{display:none}.top{padding:0 16px}.content{padding:17px}.title-row{display:block}.channels{margin-top:14px}.cards{grid-template-columns:1fr 1fr;gap:9px}.card{padding:13px}.card .value{font-size:20px}.grid{gap:9px}.panel{padding:14px}.mobile-only{display:inline}.title-row h1{font-size:22px}}
</style>
</head>
<body>
<div class="shell">
  <aside class="side">
    <div class="brand"><div class="logo">F</div><span><b>Forge</b><small>Commerce ERP</small></span></div>
    <div class="nav">
      <div class="active">Tổng quan</div>
      <div>Đơn hàng</div>
      <div>Sản phẩm & SKU</div>
      <div>Tồn kho</div>
      <div>Vận chuyển</div>
      <div>Đối soát</div>
      <div class="group">Thiết lập</div>
      <div>Gian hàng</div>
      <div>Ánh xạ SKU</div>
      <div>Kết nối sàn</div>
    </div>
  </aside>
  <main class="main">
    <header class="top"><strong>Trung tâm bán hàng đa sàn</strong><span class="tag">PREVIEW — PR #675</span></header>
    <div class="content">
      <section class="title-row">
        <div><h1>Omnichannel Commerce</h1><p>Một Sales Order authority cho Shopee, Lazada, TikTok Shop và Facebook.</p></div>
        <div class="channels"><span class="channel"><i class="dot"></i>Shopee</span><span class="channel"><i class="dot"></i>Lazada</span><span class="channel"><i class="dot"></i>TikTok Shop</span><span class="channel"><i class="dot"></i>Facebook</span></div>
      </section>
      <section class="cards">
        <div class="card"><div class="label">Đơn hôm nay</div><div class="value">184</div><div class="sub">+14,2% so với hôm qua</div></div>
        <div class="card"><div class="label">GMV hôm nay</div><div class="value">68,4tr</div><div class="sub">4 kênh đang hoạt động</div></div>
        <div class="card"><div class="label">Chờ đóng gói</div><div class="value">27</div><div class="sub">Kho mặc định: HCM-01</div></div>
        <div class="card"><div class="label">Cần xử lý</div><div class="value">6</div><div class="sub">SKU mapping / đối soát</div></div>
      </section>
      <section class="grid">
        <div class="panel">
          <div class="panel-head"><h2>Đơn hàng mới nhất</h2><span>Canonical Sales Order</span></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Đơn sàn</th><th>Kênh</th><th>Khách hàng</th><th>Sales Order</th><th>Trạng thái</th><th class="money">Tổng tiền</th></tr></thead>
            <tbody>
              <tr><td class="order">250805SH9214</td><td>Shopee</td><td>Nguyễn H.</td><td>SO-2026-01842</td><td><span class="status confirmed">Đã xác nhận</span></td><td class="money">428.000</td></tr>
              <tr><td class="order">LAZ-448129</td><td>Lazada</td><td>Trần M.</td><td>SO-2026-01841</td><td><span class="status packing">Đang đóng gói</span></td><td class="money">1.260.000</td></tr>
              <tr><td class="order">TT-972118</td><td>TikTok Shop</td><td>Lê T.</td><td>SO-2026-01840</td><td><span class="status confirmed">Đã xác nhận</span></td><td class="money">739.000</td></tr>
              <tr><td class="order">FB-CHAT-882</td><td>Facebook</td><td>Phạm A.</td><td>SO-2026-01839</td><td><span class="status mapped">Đã map</span></td><td class="money">315.000</td></tr>
              <tr><td class="order">250805SH9207</td><td>Shopee</td><td>Hoàng P.</td><td>—</td><td><span class="status issue">Thiếu SKU mapping</span></td><td class="money">690.000</td></tr>
            </tbody>
          </table></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Hàng đợi xử lý</h2><span>Fail-closed</span></div>
          <div class="queue">
            <div class="queue-item"><span class="severity bad">BLOCK</span><strong>SKU SHOPEE-RED-XL chưa ánh xạ</strong><p>Đơn 250805SH9207 không được tạo Sales Order cho tới khi Item ERP được xác định.</p></div>
            <div class="queue-item"><span class="severity warn">CHECK</span><strong>Lệch tổng tiền 12.000đ</strong><p>Provider total khác canonical pricing. Hệ thống giữ draft và không submit.</p></div>
            <div class="queue-item"><span class="severity ok">OK</span><strong>4 gian hàng kết nối</strong><p>Profile kênh dùng Company, Warehouse, Customer và Price List do ERP kiểm soát.</p></div>
          </div>
        </div>
      </section>
      <section class="panel" style="margin-top:14px">
        <div class="panel-head"><h2>Authority flow</h2><span>Không tạo shadow ledger</span></div>
        <div class="flow"><span class="step">Marketplace / Social</span><span class="arrow">→</span><span class="step">Channel Profile</span><span class="arrow">→</span><span class="step">SKU Mapping</span><span class="arrow">→</span><span class="step">Sales Order</span><span class="arrow">→</span><span class="step">Stock / Delivery</span><span class="arrow">→</span><span class="step">Finance / Settlement</span></div>
        <div class="footer-note">Đây là visual preview độc lập của branch. Số liệu trên màn hình là dữ liệu mẫu; không ghi dữ liệu production và chưa kết nối API thật của các sàn.</div>
      </section>
    </div>
  </main>
</div>
</body>
</html>`;

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "forge-commerce-preview", preview: true });
    }
    return new Response(PAGE, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  },
};
