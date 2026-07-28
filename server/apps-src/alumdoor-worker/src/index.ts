/**
 * Worker riêng của ALUMDOOR — những việc brief không nói được vì phải TÍNH rồi mới quyết.
 *
 *   POST /api/method/alumdoor.slats.compute   chiều cao phủ bì → số lá, theo mã và đời SP
 *   POST /api/method/alumdoor.cut.propose     rộng cắt lá + số lá → đề xuất lô nhôm nên cắt
 *   POST /api/method/alumdoor.cut.apply       cắt thật: trừ lô, ghi phiếu cắt, ghi phế
 *   POST /api/method/alumdoor.cut.reverse     GHI NHẦM: trả lá nguyên khổ về đúng lô cũ
 *   POST /api/method/alumdoor.cut.return      TRẢ HÀNG: nhập lá ĐÃ CẮT vào lô khổ mới
 *   POST /api/method/alumdoor.quote.preview   xem đơn hàng sẽ tạo từ một báo giá
 *   POST /api/method/alumdoor.quote.convert   báo giá đã chốt → đơn hàng, đúng MỘT lần
 *
 * Worker không giữ quyền nào. Mọi đọc/ghi đi ngược qua gateway với danh tính của chính
 * người vừa gọi, nên nó làm được đúng những gì người đó làm được, trong đúng một lời gọi.
 *
 * VÌ SAO TRỪ TỒN Ở ĐÂY LÀ AN TOÀN, trong khi ở chỗ khác em nói kiểm-rồi-ghi là không an
 * toàn cho kho: lệnh ghi lô mang theo `modified` của chính bản ghi vừa đọc. Hai người cắt
 * cùng một lô cùng lúc thì người thứ hai bị TỪ CHỐI vì bản ghi đã đổi — không phải cả hai
 * cùng lọt rồi kho âm. Đó là chốt của nền tảng, không phải của Worker này.
 */
import { slatCount, australianSlatCount, type AustralianDoor } from "./slats.js";

interface Env {
  INTERNAL_AUTH_SECRET?: string;
  /** Gateway, gọi thẳng script. Xem wrangler.jsonc. */
  PLATFORM?: Fetcher;
}

type PlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via: string };

function platformCaller(request: Request, env: Env): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) {
    const seen = [...request.headers.keys()].filter((k) => k.startsWith("x-cloudforge-")).sort();
    throw new Error(`nền tảng không cấp địa chỉ gọi ngược (nhận được: ${seen.join(", ") || "không có"})`);
  }
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return Object.assign(
    (path: string, init: RequestInit = {}) => {
      const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
      });
      return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
    },
    { via: env.PLATFORM ? "binding" : "fetch" },
  );
}

const answer = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const refuse = (message: string) => new Response(JSON.stringify({ message }), { status: 422, headers: { "content-type": "application/json" } });

interface Lot {
  name: string;
  profile: string;
  colour: string;
  generation: string;
  width_m: number;
  sheet_count: number;
  warehouse: string;
  modified?: string;
}

/**
 * Lô nên cắt: khổ ĐỦ DÀI và NHỎ NHẤT trong số đủ dài.
 *
 * "Không được nhỏ hơn chiều rộng cắt lá" là luật của xưởng — cắt từ cây ngắn hơn thì lá
 * không đủ rộng và cả lô hỏng. Trong số các lô đủ dài thì chọn NGẮN NHẤT, vì phế bằng
 * (khổ − rộng cắt) × số lá: chọn cây 8,8 m để cắt lá 3,9 m sẽ phí 4,9 m mỗi lá.
 *
 * Ưu tiên phụ khi cùng khổ: lô nhiều lá hơn, để hạn chế phải cắt từ hai lô cho một đơn.
 */
export function chooseLots(lots: Lot[], widthM: number, sheets: number): { picks: Array<{ lot: Lot; take: number }>; short: number } {
  const usable = lots
    .filter((lot) => lot.width_m >= widthM && lot.sheet_count > 0)
    .sort((a, b) => (a.width_m - b.width_m) || (b.sheet_count - a.sheet_count));
  const picks: Array<{ lot: Lot; take: number }> = [];
  let remaining = sheets;
  for (const lot of usable) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.sheet_count);
    picks.push({ lot, take });
    remaining -= take;
  }
  return { picks, short: Math.max(0, remaining) };
}

async function readLots(call: PlatformCall, profile: string, colour: string, generation: string): Promise<Lot[]> {
  const filters: Array<[string, string, string]> = [
    ["profile", "=", profile],
    ["stock_state", "=", "TỒN"],
  ];
  if (colour) filters.push(["colour", "=", colour]);
  if (generation) filters.push(["generation", "=", generation]);
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "profile", "colour", "generation", "width_m", "sheet_count", "warehouse", "modified"]),
    filters: JSON.stringify(filters),
    limit_page_length: "500",
  });
  const response = await call(`resource/Aluminium%20Lot?${query}`);
  if (!response.ok) throw new Error(`không đọc được lô nhôm (HTTP ${response.status}: ${(await response.text()).slice(0, 140)})`);
  return ((await response.json()) as { data?: Lot[] }).data ?? [];
}

/** Đề xuất cắt — chỉ ĐỌC, không đổi gì. Kế toán xem rồi mới bấm cắt. */
async function proposeCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const profile = String(args.profile ?? "");
  const widthM = Number(args.cut_width_m);
  const sheets = Number(args.sheets);
  if (!profile || !Number.isFinite(widthM) || !Number.isFinite(sheets) || widthM <= 0 || sheets <= 0) {
    return refuse("Cần mã nhôm, rộng cắt lá và số lá, đều là số dương.");
  }
  const lots = await readLots(call, profile, String(args.colour ?? ""), String(args.generation ?? ""));
  const { picks, short } = chooseLots(lots, widthM, sheets);
  return answer({
    profile, cut_width_m: widthM, sheets,
    lots_considered: lots.length,
    picks: picks.map(({ lot, take }) => ({
      lot: lot.name, width_m: lot.width_m, colour: lot.colour, generation: lot.generation,
      warehouse: lot.warehouse, available: lot.sheet_count, take,
      scrap_per_sheet_m: Number((lot.width_m - widthM).toFixed(4)),
      scrap_total_m: Number(((lot.width_m - widthM) * take).toFixed(4)),
    })),
    short,
    // Nói thẳng khi thiếu, kèm con số — "không đủ" mà không nói thiếu bao nhiêu thì kế toán
    // vẫn phải mở file ra đếm tay.
    ...(short > 0 ? { message: `Thiếu ${short} lá khổ ≥ ${widthM} m cho ${profile}.` } : {}),
  });
}

/**
 * Cắt thật. Trừ lô và ghi phiếu cắt.
 *
 * Đề xuất lại từ đầu chứ KHÔNG tin danh sách lô client gửi lên: giữa lúc xem và lúc bấm,
 * người khác có thể đã cắt mất. Tính lại rồi mới ghi là khác biệt giữa "kho đúng" và "kho
 * đúng phần lớn thời gian".
 */
async function applyCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const profile = String(args.profile ?? "");
  const widthM = Number(args.cut_width_m);
  const sheets = Number(args.sheets);
  const voucher = String(args.voucher_no ?? "");
  if (!voucher) return refuse("Cần số chứng từ — phiếu cắt không có số thì không hoàn được.");
  if (!profile || !Number.isFinite(widthM) || !Number.isFinite(sheets) || widthM <= 0 || sheets <= 0) {
    return refuse("Cần mã nhôm, rộng cắt lá và số lá, đều là số dương.");
  }

  const lots = await readLots(call, profile, String(args.colour ?? ""), String(args.generation ?? ""));
  const { picks, short } = chooseLots(lots, widthM, sheets);
  if (short > 0) return refuse(`Không đủ nhôm: thiếu ${short} lá khổ ≥ ${widthM} m cho ${profile}.`);

  const now = new Date().toISOString();
  /**
   * Các lô cắt SONG SONG, không xếp hàng.
   *
   * Mỗi lần gọi ngược tốn ~1,2 giây và nền tảng cắt một lời gọi app ở 5 giây, nên xếp hàng
   * theo lô là đặt một hạn mức ngầm: cắt lấy từ ba lô sẽ hết giờ. Và hết giờ ở ĐÂY là kiểu
   * hỏng tệ nhất trong cả app — tồn đã trừ, người bấm thấy báo lỗi, rồi bấm lại và trừ lần
   * nữa. Các lô là bản ghi khác nhau nên không có lý do gì phải chờ nhau.
   *
   * An toàn khi hai người cùng cắt KHÔNG đổi: mỗi lệnh ghi vẫn mang `modified` của chính
   * bản ghi vừa đọc, nên người thứ hai bị từ chối. Đó là chốt của nền tảng.
   */
  const results = await Promise.all(picks.map(async ({ lot, take }) => {
    const left = lot.sheet_count - take;
    const update = await call(`resource/Aluminium%20Lot/${encodeURIComponent(lot.name)}`, {
      method: "PUT",
      body: JSON.stringify({
        sheet_count: left,
        // Hết lá thì đánh dấu HẾT, giữ dòng lại làm lịch sử — đúng như file Excel vẫn làm.
        stock_state: left > 0 ? "TỒN" : "HẾT",
        modified: lot.modified,
      }),
    });
    if (!update.ok) return { lot: lot.name, take, ok: false, detail: (await update.text()).slice(0, 140) };
    const cut = await call("resource/Aluminium%20Cut", {
      method: "POST",
      body: JSON.stringify({
        lot: lot.name, cut_on: now, voucher_no: voucher,
        ...(args.customer ? { customer: String(args.customer) } : {}),
        cut_width_m: widthM, sheets_cut: take,
        scrap_m: Number((lot.width_m - widthM).toFixed(4)),
        cut_state: "ĐÃ CẮT",
      }),
    });
    const name = cut.ok ? ((await cut.json()) as { data?: { name?: string } }).data?.name ?? "" : "";
    return { lot: lot.name, take, ok: true, cut: name };
  }));

  const failed = results.filter((entry) => !entry.ok);
  const done = results.filter((entry) => entry.ok);
  if (failed.length) {
    /**
     * Nói rõ phần ĐÃ cắt khi có lô hỏng.
     *
     * Nền tảng không có giao dịch trải nhiều tài liệu, nên một lệnh cắt lấy từ nhiều lô có
     * thể xong một phần. Im lặng thì thủ kho tưởng chưa cắt gì và cắt lại — trừ tồn hai lần.
     */
    return refuse(
      `Cắt được ${done.length}/${picks.length} lô. Lô hỏng: ${failed.map((entry) => entry.lot).join(", ")} — có người vừa cắt, đề xuất lại.`
      + (done.length ? ` ĐÃ CẮT: ${done.map((entry) => `${entry.lot}×${entry.take}`).join(", ")}.` : ""),
    );
  }

  return answer({
    voucher_no: voucher, profile, cut_width_m: widthM, sheets,
    cuts: done.map((entry) => entry.cut).filter(Boolean), lots_used: picks.length,
    scrap_total_m: Number(picks.reduce((sum, p) => sum + (p.lot.width_m - widthM) * p.take, 0).toFixed(4)),
  });
}

interface CutRecord {
  name: string;
  lot: string;
  voucher_no: string;
  cut_width_m: number;
  sheets_cut: number;
  cut_state: string;
  /** Nền tảng luôn kèm `modified` vào kết quả danh sách, nên không phải đọc lại từng bản ghi. */
  modified?: string;
}

/** Phiếu cắt còn ở trạng thái ĐÃ CẮT của một chứng từ — thứ duy nhất hoàn/trả được. */
async function openCuts(call: PlatformCall, args: Record<string, unknown>): Promise<CutRecord[]> {
  const voucher = String(args.voucher_no ?? "");
  const single = String(args.cut ?? "");
  if (!voucher && !single) throw new Error("Cần số chứng từ hoặc số phiếu cắt.");
  const filters: Array<[string, string, string]> = [["cut_state", "=", "ĐÃ CẮT"]];
  if (single) filters.push(["name", "=", single]);
  else filters.push(["voucher_no", "=", voucher]);
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "lot", "voucher_no", "cut_width_m", "sheets_cut", "cut_state"]),
    filters: JSON.stringify(filters),
    limit_page_length: "200",
  });
  const response = await call(`resource/Aluminium%20Cut?${query}`);
  if (!response.ok) throw new Error(`không đọc được phiếu cắt (HTTP ${response.status})`);
  return ((await response.json()) as { data?: CutRecord[] }).data ?? [];
}

/** Đọc lại một bản ghi để lấy `modified` — danh sách không chiếu field đó ra. */
async function readDoc<T>(call: PlatformCall, doctype: string, name: string): Promise<T & { modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`không đọc được ${doctype} ${name} (HTTP ${response.status})`);
  return ((await response.json()) as { data?: T & { modified?: string } }).data ?? ({} as T & { modified?: string });
}

/**
 * Đánh dấu phiếu cắt đã xử lý. Chưa đóng dấu thì lần sau hoàn tiếp là cộng tồn hai lần.
 *
 * `modified` lấy từ chính lần đọc danh sách, không đọc lại bản ghi: nếu ai đó đã hoàn phiếu
 * này trong lúc đó thì `modified` đã đổi và lệnh ghi bị TỪ CHỐI — đúng thứ cần, và rẻ hơn
 * một vòng gọi ngược 1,2 giây.
 */
async function closeCut(call: PlatformCall, cut: CutRecord, state: string, note: string): Promise<boolean> {
  const update = await call(`resource/Aluminium%20Cut/${encodeURIComponent(cut.name)}`, {
    method: "PUT",
    body: JSON.stringify({ cut_state: state, note, modified: cut.modified }),
  });
  return update.ok;
}

/**
 * HOÀN CẮT — chữa một lần ghi nhầm. Lá quay về ĐÚNG lô cũ, nguyên khổ.
 *
 * Khác hẳn TRẢ HÀNG ở dưới, và trộn hai thứ này là làm sai tồn theo cách không ai thấy: hoàn
 * cắt nghĩa là nhôm CHƯA bị cắt (bấm nhầm, gõ nhầm số lá), nên cây nhôm vẫn còn nguyên khổ
 * 3,8 m và phải quay về đúng chỗ nó đi ra. Trả hàng nghĩa là nhôm ĐÃ cắt rồi mới quay về —
 * lúc đó nó là lá khổ 3,5 m, không còn là cây 3,8 m nữa, và nhôm thì không nối lại được.
 */
async function reverseCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const cuts = await openCuts(call, args);
  if (!cuts.length) return refuse("Không có phiếu cắt nào đang ở trạng thái ĐÃ CẮT cho chứng từ này.");
  const note = String(args.note ?? "Hoàn cắt");
  // Các phiếu chạy song song, cùng lý do với `applyCut`: xếp hàng theo phiếu là tự đặt một
  // hạn mức ngầm "hoàn quá hai phiếu thì hết giờ".
  const results = await Promise.all(cuts.map(async (cut) => {
    const lot = await readDoc<{ sheet_count?: number }>(call, "Aluminium Lot", cut.lot);
    const restored = Number(lot.sheet_count ?? 0) + Number(cut.sheets_cut ?? 0);
    const update = await call(`resource/Aluminium%20Lot/${encodeURIComponent(cut.lot)}`, {
      method: "PUT",
      body: JSON.stringify({ sheet_count: restored, stock_state: "TỒN", modified: lot.modified }),
    });
    if (!update.ok) return { cut: cut.name, lot: cut.lot, ok: false, stamped: false, sheets: 0 };
    /**
     * Đóng dấu NGAY sau khi cộng tồn, và báo riêng khi đóng dấu hỏng.
     *
     * Cộng tồn xong mà phiếu vẫn mang trạng thái ĐÃ CẮT thì lần hoàn sau cộng thêm lần nữa
     * — tồn phình lên và không có gì báo. Đây là chỗ duy nhất trong đường hoàn cắt mà im
     * lặng gây hại thật, nên nó được nêu tên riêng chứ không gộp vào "có lỗi".
     */
    const stamped = await closeCut(call, cut, "ĐÃ HOÀN CẮT", note);
    return { cut: cut.name, lot: cut.lot, ok: true, stamped, sheets: Number(cut.sheets_cut ?? 0) };
  }));

  const done = results.filter((entry) => entry.ok);
  const failed = results.filter((entry) => !entry.ok);
  const unstamped = done.filter((entry) => !entry.stamped);
  if (unstamped.length) {
    return refuse(`Đã cộng lại tồn nhưng KHÔNG đóng dấu được phiếu ${unstamped.map((entry) => entry.cut).join(", ")} — kiểm tra phiếu đó trước khi hoàn tiếp, nếu không sẽ cộng tồn hai lần.`);
  }
  if (failed.length) {
    return refuse(`Hoàn được ${done.length}/${cuts.length} phiếu. Lô vừa thay đổi: ${failed.map((entry) => entry.lot).join(", ")}.${done.length ? ` ĐÃ HOÀN: ${done.map((entry) => entry.cut).join(", ")}.` : ""}`);
  }
  return answer({ reversed: done.map((entry) => entry.cut), sheets_restored: done.reduce((sum, entry) => sum + entry.sheets, 0), mode: "hoàn cắt" });
}

/**
 * TRẢ HÀNG — lá ĐÃ CẮT quay về kho. Nhập vào lô có khổ bằng RỘNG CẮT, không phải khổ gốc.
 *
 * Cột `returned_on` trên lô là của chính xưởng (file tồn có cột "ngày nhập lại"), nên hàng
 * trả về nhìn ra được ngay, không lẫn vào nhôm mới mua.
 */
async function returnCut(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const cuts = await openCuts(call, args);
  if (!cuts.length) return refuse("Không có phiếu cắt nào đang ở trạng thái ĐÃ CẮT cho chứng từ này.");
  const today = new Date().toISOString().slice(0, 10);
  const note = String(args.note ?? "Trả hàng");
  const done: string[] = [];
  const lotsTouched: string[] = [];
  /**
   * Trả hàng chạy TUẦN TỰ, khác với cắt và hoàn cắt — và đây là lý do.
   *
   * Hai phiếu trả cùng một mã, cùng màu, cùng khổ phải dồn vào MỘT lô. Chạy song song thì
   * cả hai cùng thấy "chưa có lô nào" rồi cùng tạo, và kho có hai dòng cho cùng một thứ —
   * thứ mà file Excel của xưởng vốn không có và không ai đi gộp lại. Chậm hơn ở đây là cái
   * giá đúng để trả.
   */
  for (const cut of cuts) {
    const source = await readDoc<{ profile?: string; colour?: string; generation?: string; warehouse?: string }>(call, "Aluminium Lot", cut.lot);
    const width = Number(Number(cut.cut_width_m).toFixed(4));
    const existing = (await readLots(call, String(source.profile ?? ""), String(source.colour ?? ""), String(source.generation ?? "")))
      .find((lot) => Math.abs(lot.width_m - width) < 1e-6 && lot.warehouse === source.warehouse);
    if (existing) {
      const fresh = await readDoc<{ sheet_count?: number }>(call, "Aluminium Lot", existing.name);
      const update = await call(`resource/Aluminium%20Lot/${encodeURIComponent(existing.name)}`, {
        method: "PUT",
        body: JSON.stringify({
          sheet_count: Number(fresh.sheet_count ?? 0) + Number(cut.sheets_cut ?? 0),
          stock_state: "TỒN", returned_on: today, modified: fresh.modified,
        }),
      });
      if (!update.ok) return refuse(`Lô ${existing.name} vừa thay đổi, trả lại từ đầu.${done.length ? ` ĐÃ TRẢ: ${done.join(", ")}.` : ""}`);
      lotsTouched.push(existing.name);
    } else {
      const created = await call("resource/Aluminium%20Lot", {
        method: "POST",
        body: JSON.stringify({
          profile: source.profile, colour: source.colour, generation: source.generation,
          width_m: width, sheet_count: cut.sheets_cut, warehouse: source.warehouse,
          returned_on: today, stock_state: "TỒN", note: `Trả về từ ${cut.voucher_no}`,
        }),
      });
      if (!created.ok) return refuse(`Không tạo được lô nhận hàng trả cho phiếu ${cut.name}.${done.length ? ` ĐÃ TRẢ: ${done.join(", ")}.` : ""}`);
      lotsTouched.push(((await created.json()) as { data?: { name?: string } }).data?.name ?? "");
    }
    if (!(await closeCut(call, cut, "ĐÃ TRẢ HÀNG", note))) {
      return refuse(`Đã nhập lại lá của phiếu ${cut.name} nhưng KHÔNG đóng dấu được phiếu — kiểm tra trước khi trả tiếp.`);
    }
    done.push(cut.name);
  }
  return answer({ returned: done, lots: lotsTouched, mode: "trả hàng" });
}

/** Dòng hàng chép từ báo giá sang đơn. Field nào nhân O2C đọc thì phải qua nguyên vẹn. */
const QUOTE_LINE_FIELDS = [
  "item_code", "width_mm", "height_mm", "set_count", "qty", "rate",
  "color", "motor_model", "accessories",
] as const;

interface QuotationDoc {
  name: string;
  customer?: string;
  company?: string;
  currency?: string;
  selling_price_list?: string;
  customer_group?: string;
  install_address?: string;
  workflow_state?: string;
  converted_to?: string;
  items?: Array<Record<string, unknown>>;
  modified?: string;
}

/**
 * Báo giá đọc được và ĐỦ ĐIỀU KIỆN chuyển thành đơn.
 *
 * Hai chốt, và cả hai đều là chốt nghiệp vụ chứ không phải kiểm dữ liệu:
 *
 *  · Chỉ chuyển báo giá KHÁCH ĐÃ ĐỒNG Ý. Chuyển một báo giá còn đang thương lượng là đưa
 *    một giá chưa chốt vào sổ, và giá đó sẽ đi thẳng ra hoá đơn.
 *  · Chuyển lần thứ hai bị TỪ CHỐI. Hai đơn cho cùng một báo giá là sản xuất hai lần, giao
 *    hai lần, và công nợ gấp đôi — không ai đọc lại danh sách đơn để phát hiện.
 */
async function loadQuotation(call: PlatformCall, name: string): Promise<QuotationDoc> {
  if (!name) throw new Error("Cần chọn báo giá.");
  const quote = await readDoc<QuotationDoc>(call, "Quotation", name);
  if (quote.converted_to) throw new Error(`Báo giá ${name} đã thành đơn ${quote.converted_to} — không tạo đơn thứ hai.`);
  if (quote.workflow_state !== "Khách đồng ý") {
    throw new Error(`Báo giá ${name} đang ở trạng thái "${quote.workflow_state ?? "Nháp"}". Chỉ chuyển được báo giá KHÁCH ĐÃ ĐỒNG Ý.`);
  }
  if (!quote.items?.length) throw new Error(`Báo giá ${name} không có dòng hàng nào.`);
  return quote;
}

function orderLines(quote: QuotationDoc): Array<Record<string, unknown>> {
  return (quote.items ?? []).map((line, index) => {
    const copied: Record<string, unknown> = { row_id: `R${index + 1}` };
    for (const field of QUOTE_LINE_FIELDS) if (line[field] !== undefined && line[field] !== null && line[field] !== "") copied[field] = line[field];
    return copied;
  });
}

/** Xem đơn SẼ tạo. Chỉ đọc — kinh doanh soát số đo trước khi nó thành một tờ lệnh cắt. */
async function previewQuote(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  let quote: QuotationDoc;
  try { quote = await loadQuotation(call, String(args.quotation ?? "")); } catch (error) { return refuse(error instanceof Error ? error.message : "không đọc được báo giá"); }
  const items = orderLines(quote);
  return answer({
    quotation: quote.name, customer: quote.customer,
    ...(quote.selling_price_list ? { selling_price_list: quote.selling_price_list } : {}),
    items,
    /**
     * Tổng ở đây là tổng của BÁO GIÁ, và nói rõ như vậy.
     *
     * Khi đơn có bảng giá, server sẽ định giá lại theo `Item Price` và có thể ra con số
     * khác. Gọi nó là "tổng đơn hàng" thì lúc lệch, người dùng tin bản xem trước.
     */
    lines: items.length,
    ...(quote.selling_price_list
      ? { message: `Đơn sẽ áp bảng giá ${quote.selling_price_list} — SERVER định giá lại, tổng có thể khác báo giá.` }
      : {}),
  });
}

/** Đơn hàng đã tạo từ báo giá này, nếu có. Đọc theo LIÊN KẾT chứ không theo dấu trên báo giá. */
async function orderFor(call: PlatformCall, quotation: string): Promise<string | null> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["against_quotation", "=", quotation]]),
    limit_page_length: "1",
  });
  const response = await call(`resource/Sales%20Order?${query}`);
  if (!response.ok) return null;
  return ((await response.json()) as { data?: Array<{ name?: string }> }).data?.[0]?.name ?? null;
}

/**
 * Tạo đơn từ báo giá — bấm lại bao nhiêu lần cũng chỉ ra MỘT đơn.
 *
 * Tính bất biến này không phải để cho đẹp. Nền tảng cắt một lời gọi app ở 5 giây, và lần
 * chạy thật đầu tiên đã vượt: đơn ĐƯỢC tạo, nhưng người bấm thấy "hết giờ" nên bấm lại, và
 * lần thứ hai tạo đơn thứ hai. Hai đơn cho một báo giá là sản xuất hai lần, giao hai lần,
 * công nợ gấp đôi — và không ai đọc lại danh sách đơn để phát hiện.
 *
 * Chốt không nằm ở dấu `converted_to` trên báo giá: dấu đó được ghi SAU khi đơn đã tồn tại,
 * nên đúng khoảng giữa hai lệnh ghi là lúc nguy hiểm nhất. Chốt nằm ở việc HỎI THẲNG: đã có
 * đơn nào trỏ về báo giá này chưa. Câu hỏi đó đúng ở mọi thời điểm, kể cả khi lần trước chết
 * giữa chừng.
 */
async function convertQuote(call: PlatformCall, args: Record<string, unknown>, ctx?: ExecutionContext): Promise<Response> {
  const name = String(args.quotation ?? "");
  /**
   * Đọc báo giá và hỏi "đã có đơn chưa" CÙNG LÚC — hai câu hỏi độc lập.
   *
   * Mỗi lần gọi ngược tốn ~1,2 giây (app → gateway → tenant, hai chặng), và nền tảng cắt
   * một lời gọi app ở 5 giây. Xếp bốn lần gọi nối đuôi nhau là 5,9 giây — đo được, và đó
   * chính là lần chạy đã hết giờ giữa chừng rồi tạo ra đơn thứ hai.
   */
  let quote: QuotationDoc;
  let existing: string | null;
  try {
    [quote, existing] = await Promise.all([loadQuotation(call, name), orderFor(call, name)]);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được báo giá");
  }

  if (existing) {
    // Không phải lỗi: lần trước đã xong, chỉ là người gọi không nhận được câu trả lời.
    ctx?.waitUntil(stampQuotation(call, quote, existing));
    return answer({ sales_order: existing, quotation: quote.name, items: orderLines(quote), lines: (quote.items ?? []).length, already: true });
  }

  const created = await call("resource/Sales%20Order", {
    method: "POST",
    body: JSON.stringify({
      customer: quote.customer, company: quote.company, currency: quote.currency,
      transaction_date: new Date().toISOString().slice(0, 10),
      ...(args.delivery_date ? { delivery_date: String(args.delivery_date) } : {}),
      against_quotation: quote.name,
      ...(quote.selling_price_list ? { selling_price_list: quote.selling_price_list } : {}),
      ...(quote.customer_group ? { customer_group: quote.customer_group } : {}),
      items: orderLines(quote),
      note: String(args.note ?? `Theo báo giá ${quote.name}`),
    }),
  });
  if (!created.ok) return refuse(`Không tạo được đơn hàng: ${(await created.text()).slice(0, 200)}`);
  const order = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";

  /**
   * Đóng dấu chạy SAU khi đã trả lời, và không ai phải chờ nó.
   *
   * `converted_to` giờ chỉ để người dùng nhìn thấy trên báo giá; thứ ngăn tạo đơn thứ hai
   * là câu hỏi "đã có đơn nào trỏ về báo giá này chưa" ở trên. Bắt người dùng chờ thêm 1,2
   * giây cho một dòng chữ trang trí là cách chắc chắn nhất để vượt hạn 5 giây — và vượt hạn
   * ở đây tốn kém hơn nhiều so với một dấu ghi muộn nửa giây.
   */
  ctx?.waitUntil(stampQuotation(call, quote, order));
  return answer({ sales_order: order, quotation: quote.name, items: orderLines(quote), lines: (quote.items ?? []).length });
}

/** Ghi dấu lên báo giá. `modified` lấy từ lần đọc đầu — thêm một lần đọc nữa là thêm một vòng chờ. */
async function stampQuotation(call: PlatformCall, quote: QuotationDoc, order: string): Promise<boolean> {
  if (quote.converted_to === order) return true;
  const response = await call(`resource/Quotation/${encodeURIComponent(quote.name)}`, {
    method: "PUT",
    body: JSON.stringify({ converted_to: order, modified: quote.modified }),
  });
  return response.ok;
}

/** Field của dòng mua mà nhân O2P ĐỌC. Chép thiếu `uom`/`conversion_factor` là mất quy đổi. */
const PURCHASE_LINE_FIELDS = [
  "item_code", "qty", "uom", "conversion_factor", "rate", "width_m", "invoice_kg", "note",
] as const;

interface PurchaseDoc {
  name: string;
  supplier?: string;
  company?: string;
  currency?: string;
  supplier_group?: string;
  buying_price_list?: string;
  schedule_date?: string;
  items?: Array<Record<string, unknown>>;
  modified?: string;
}

function purchaseLines(source: PurchaseDoc, warehouse: string): Array<Record<string, unknown>> {
  return (source.items ?? []).map((line, index) => {
    const copied: Record<string, unknown> = { row_id: `R${index + 1}` };
    for (const field of PURCHASE_LINE_FIELDS) if (line[field] !== undefined && line[field] !== null && line[field] !== "") copied[field] = line[field];
    const target = warehouse || String(line.warehouse ?? "");
    if (target) copied.warehouse = target;
    return copied;
  });
}

async function loadSupplierQuotation(call: PlatformCall, name: string): Promise<PurchaseDoc> {
  if (!name) throw new Error("Cần chọn báo giá nhà cung cấp.");
  const quotation = await readDoc<PurchaseDoc & { docstatus?: number }>(call, "Supplier Quotation", name);
  if (quotation.docstatus !== 1) throw new Error(`Báo giá ${name} chưa ghi sổ — chỉ chuyển được báo giá đã ghi sổ.`);
  if (!quotation.items?.length) throw new Error(`Báo giá ${name} không có dòng hàng nào.`);
  return quotation;
}

/** Đơn mua đã tạo từ báo giá này, nếu có. Hỏi theo LIÊN KẾT, không theo dấu trên báo giá. */
async function orderForQuotation(call: PlatformCall, quotation: string): Promise<string | null> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["supplier_quotation", "=", quotation]]),
    limit_page_length: "1",
  });
  const response = await call(`resource/Purchase%20Order?${query}`);
  if (!response.ok) return null;
  return ((await response.json()) as { data?: Array<{ name?: string }> }).data?.[0]?.name ?? null;
}

async function previewPurchaseOrder(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  let quotation: PurchaseDoc;
  try { quotation = await loadSupplierQuotation(call, String(args.supplier_quotation ?? "")); } catch (error) { return refuse(error instanceof Error ? error.message : "không đọc được báo giá"); }
  const items = purchaseLines(quotation, String(args.warehouse ?? ""));
  return answer({ supplier_quotation: quotation.name, supplier: quotation.supplier, items, lines: items.length });
}

/**
 * Báo giá NCC → đơn mua. Bấm lại bao nhiêu lần cũng chỉ ra MỘT đơn.
 *
 * Cùng khuôn với `convertQuote` bên bán, và vì đúng một lý do: lần chạy thật đầu tiên của
 * bản bán đã vượt hạn giờ, đơn ĐƯỢC tạo nhưng người bấm thấy "hết giờ" nên bấm lại — và
 * lần thứ hai tạo đơn thứ hai. Ở phía mua, đơn thứ hai nghĩa là NCC giao gấp đôi và công
 * nợ gấp đôi. Chốt nằm ở câu hỏi "đã có đơn nào trỏ về báo giá này chưa", đúng ở mọi thời
 * điểm kể cả khi lần trước chết giữa chừng.
 */
async function orderFromSupplierQuotation(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const name = String(args.supplier_quotation ?? "");
  let quotation: PurchaseDoc;
  let existing: string | null;
  try {
    [quotation, existing] = await Promise.all([loadSupplierQuotation(call, name), orderForQuotation(call, name)]);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được báo giá");
  }
  const items = purchaseLines(quotation, String(args.warehouse ?? ""));
  if (existing) return answer({ purchase_order: existing, supplier_quotation: quotation.name, items, lines: items.length, already: true });

  const created = await call("resource/Purchase%20Order", {
    method: "POST",
    body: JSON.stringify({
      supplier: quotation.supplier, company: quotation.company, currency: quotation.currency,
      transaction_date: new Date().toISOString().slice(0, 10),
      ...(args.schedule_date ? { schedule_date: String(args.schedule_date) } : {}),
      supplier_quotation: quotation.name,
      ...(quotation.supplier_group ? { supplier_group: quotation.supplier_group } : {}),
      items,
      note: String(args.note ?? `Theo báo giá ${quotation.name}`),
    }),
  });
  if (!created.ok) return refuse(`Không tạo được đơn mua: ${(await created.text()).slice(0, 200)}`);
  const order = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
  return answer({ purchase_order: order, supplier_quotation: quotation.name, items, lines: items.length });
}

/**
 * Số ĐÃ nhận theo từng mã hàng của một đơn mua.
 *
 * Cộng từ chính các phiếu nhập ĐÃ GHI SỔ, không đọc `received_percentage` — cột phần trăm
 * là con số của cả phiếu, không tách được theo mã hàng, mà một đơn có thể về đủ mặt này và
 * thiếu mặt kia. Cộng theo `stock_qty` vì đơn có thể đặt bằng CÂY còn phiếu nhận ghi MÉT.
 *
 * Đọc các phiếu SONG SONG: mỗi lần gọi ngược tốn ~1,2 giây và nền tảng cắt lời gọi app ở
 * 10 giây, nên ba phiếu xếp nối đuôi đã là quá nửa hạn giờ.
 */
async function receivedByItem(call: PlatformCall, order: string): Promise<Map<string, number>> {
  const received = new Map<string, number>();
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["against_purchase_order", "=", order], ["docstatus", "=", 1]]),
    limit_page_length: "20",
  });
  const listed = await call(`resource/Purchase%20Receipt?${query}`);
  if (!listed.ok) return received;
  const names = (((await listed.json()) as { data?: Array<{ name?: string }> }).data ?? [])
    .map((row) => row.name).filter((value): value is string => Boolean(value));
  if (!names.length) return received;
  const receipts = await Promise.all(names.map(async (receipt) => {
    try { return await readDoc<PurchaseDoc>(call, "Purchase Receipt", receipt); } catch { return null; }
  }));
  for (const receipt of receipts) {
    for (const line of receipt?.items ?? []) {
      const code = String(line.item_code ?? "");
      if (!code) continue;
      const quantity = Number(line.stock_qty ?? line.qty ?? 0);
      if (Number.isFinite(quantity)) received.set(code, (received.get(code) ?? 0) + quantity);
    }
  }
  return received;
}

/** Phần CÒN LẠI của một đơn mua, theo từng dòng. Dòng đã về đủ thì biến mất khỏi phiếu. */
async function remainingLines(call: PlatformCall, order: string, warehouse: string): Promise<{ purchase: PurchaseDoc; items: Array<Record<string, unknown>> }> {
  const [purchase, received] = await Promise.all([
    readDoc<PurchaseDoc & { docstatus?: number }>(call, "Purchase Order", order),
    receivedByItem(call, order),
  ]);
  if (purchase.docstatus !== 1) throw new Error(`Đơn mua ${order} chưa ghi sổ.`);
  const items: Array<Record<string, unknown>> = [];
  for (const [index, line] of (purchase.items ?? []).entries()) {
    const code = String(line.item_code ?? "");
    if (!code) continue;
    const factor = Number(line.conversion_factor ?? 1) || 1;
    const orderedStock = Number(line.stock_qty ?? line.qty ?? 0);
    /**
     * Số đã nhận đếm theo MÃ HÀNG, còn đơn có thể có HAI dòng cùng mã (hai khổ, hai màu).
     * Nên phải rót số đã nhận vào các dòng theo thứ tự, hết dòng này mới sang dòng sau —
     * chia đều hay trừ thẳng vào từng dòng đều làm dòng đầu hiện thiếu và dòng sau hiện dư.
     */
    const pool = received.get(code) ?? 0;
    const consumed = Math.min(pool, orderedStock);
    received.set(code, pool - consumed);
    const outstandingStock = orderedStock - consumed;
    if (outstandingStock <= 0) continue;
    const copied: Record<string, unknown> = { row_id: `R${index + 1}`, purchase_order: order };
    for (const field of PURCHASE_LINE_FIELDS) if (line[field] !== undefined && line[field] !== null && line[field] !== "") copied[field] = line[field];
    // `qty` trả về ĐƠN VỊ MUA — thủ kho đếm cây, không đếm mét.
    copied.qty = Number((outstandingStock / factor).toFixed(6));
    const target = warehouse || String(line.warehouse ?? "");
    if (target) copied.warehouse = target;
    items.push(copied);
  }
  return { purchase, items };
}

async function previewPurchaseReceipt(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const order = String(args.purchase_order ?? "");
  if (!order) return refuse("Cần chọn đơn mua.");
  try {
    const { purchase, items } = await remainingLines(call, order, String(args.warehouse ?? ""));
    return answer({
      purchase_order: order, supplier: purchase.supplier, items, lines: items.length,
      ...(items.length ? {} : { message: `Đơn mua ${order} đã nhận đủ — không còn gì để nhập.` }),
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "không đọc được đơn mua");
  }
}

/**
 * Tạo phiếu nhập NHÁP, không ghi sổ.
 *
 * Cố ý dừng ở nháp: số trên đơn là số ĐẶT, số vào kho phải là số ĐẾM ĐƯỢC. Hàng về thiếu
 * vài cây, hoặc một cây móp phải trả lại ngay tại xe, là chuyện thường ngày — ghi sổ hộ
 * thủ kho là ghi vào kho một con số chưa ai nhìn thấy.
 */
async function receiptFromPurchaseOrder(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const order = String(args.purchase_order ?? "");
  if (!order) return refuse("Cần chọn đơn mua.");
  let purchase: PurchaseDoc;
  let items: Array<Record<string, unknown>>;
  try { ({ purchase, items } = await remainingLines(call, order, String(args.warehouse ?? ""))); } catch (error) { return refuse(error instanceof Error ? error.message : "không đọc được đơn mua"); }
  if (!items.length) return refuse(`Đơn mua ${order} đã nhận đủ — không còn gì để nhập.`);

  const created = await call("resource/Purchase%20Receipt", {
    method: "POST",
    body: JSON.stringify({
      supplier: purchase.supplier, company: purchase.company, currency: purchase.currency,
      against_purchase_order: order,
      posting_at: new Date().toISOString(),
      ...(args.supplier_invoice_no ? { supplier_invoice_no: String(args.supplier_invoice_no) } : {}),
      ...(args.driver ? { driver: String(args.driver) } : {}),
      items,
      note: `Nháp theo đơn mua ${order} — sửa lại số THỰC ĐẾM trước khi ghi sổ.`,
    }),
  });
  if (!created.ok) return refuse(`Không tạo được phiếu nhập: ${(await created.text()).slice(0, 200)}`);
  const receipt = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
  return answer({ purchase_receipt: receipt, purchase_order: order, items, lines: items.length, draft: true });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return answer({ ok: true, app: "alumdoor", platform_binding: Boolean(env.PLATFORM) });
    if (!request.headers.get("x-cloudforge-tenant")) {
      return new Response(JSON.stringify({ message: "not a platform call" }), { status: 403 });
    }
    try {
      if (url.pathname.startsWith("/api/method/")) {
        const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
        const body = (await request.json().catch(() => ({}))) as { args?: Record<string, unknown> };
        const args = body.args ?? {};

        // Chia lá không cần đọc gì của tenant — thuần số học, nên không dựng đường gọi ngược.
        if (method === "alumdoor.slats.compute") {
          try {
            const kind = args.australian_kind ? String(args.australian_kind) as AustralianDoor : null;
            if (kind) return answer({ slats: australianSlatCount(kind, Number(args.height_m)), kind });
            return answer(slatCount(String(args.profile ?? ""), String(args.generation ?? "MỚI"), Number(args.height_m)));
          } catch (error) {
            return refuse(error instanceof Error ? error.message : "không tính được số lá");
          }
        }

        const call = platformCaller(request, env);
        if (method === "alumdoor.cut.propose") return await proposeCut(call, args);
        if (method === "alumdoor.cut.apply") return await applyCut(call, args);
        if (method === "alumdoor.cut.reverse") return await reverseCut(call, args);
        if (method === "alumdoor.cut.return") return await returnCut(call, args);
        if (method === "alumdoor.quote.preview") return await previewQuote(call, args);
        if (method === "alumdoor.quote.convert") return await convertQuote(call, args, ctx);
        if (method === "alumdoor.purchase.preview_order") return await previewPurchaseOrder(call, args);
        if (method === "alumdoor.purchase.order_from_quotation") return await orderFromSupplierQuotation(call, args);
        if (method === "alumdoor.purchase.preview_receipt") return await previewPurchaseReceipt(call, args);
        if (method === "alumdoor.purchase.receipt_from_order") return await receiptFromPurchaseOrder(call, args);
        return new Response(JSON.stringify({ message: `Không có method ${method}` }), { status: 404 });
      }
      // App này chưa khai validator nào; hook validate trả "cho qua" để không chặn ghi.
      if (url.pathname === "/hooks/validate") return answer({ ok: true });
      return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "lỗi không xác định";
      return refuse(`Alumdoor không xử lý được: ${message}`);
    }
  },
};
