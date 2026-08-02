/**
 * TRỢ LÝ AI của tenant — đọc ảnh chứng từ, và trả lời câu hỏi về dữ liệu của chính tenant.
 *
 * Hai nguyên tắc chi phối mọi thứ trong file này:
 *
 *   1. AI KHÔNG ĐƯỢC GHI. Nó chỉ đề xuất; người dùng nhìn thấy rồi mới bấm lưu. Một mô hình
 *      đọc nhầm 8,5 thành 85 mà được ghi thẳng vào sổ kho là một sai sót không ai kịp thấy.
 *
 *   2. AI KHÔNG ĐƯỢC BỊA MÃ HÀNG. Nó đọc ra chữ trên tờ giấy; việc quy chữ đó về mã trong
 *      danh mục là do TA đối chiếu, và không khớp thì để trống kèm nguyên văn đã đọc. Một mã
 *      hàng bịa ra trông y hệt mã thật, và chỉ lộ ra khi tồn kho lệch.
 */
import type { JsonObject, JsonValue } from "../../../packages/contracts/src/index.js";
import type { TenantEnv } from "./env.js";

/**
 * Mô hình xếp theo THỨ TỰ ƯU TIÊN, không phải một cái duy nhất.
 *
 * Cloudflare cho mô hình ngừng phục vụ theo lịch, và khi tới hạn thì lời gọi trả về lỗi
 * 5028 — cả tính năng chết dù nền tảng vẫn chạy. Đúng chuyện vừa xảy ra với
 * `llama-3.1-8b-instruct` (ngừng 30/05/2026). Chốt một tên mô hình vào mã nguồn nghĩa là
 * hẹn trước một lần hỏng, vào một ngày không ai nhớ.
 *
 * Nên: thử lần lượt, gặp lỗi ngừng-phục-vụ thì sang cái kế. Cạn danh sách mới báo hỏng.
 */
const VISION_MODELS = [
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-3.2-11b-vision-instruct",
];
const TEXT_MODELS = [
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/ibm-granite/granite-4.0-h-micro",
  "@cf/meta/llama-3.2-3b-instruct",
];

const DEPRECATED = /\b5028\b|deprecated|no longer available/i;

async function runFirstAvailable(env: TenantEnv, models: string[], input: JsonObject): Promise<unknown> {
  let last: unknown = null;
  for (const model of models) {
    try {
      return await env.AI!.run(model, input);
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!DEPRECATED.test(message)) throw error;   // lỗi thật (ảnh hỏng, quá hạn mức) — đừng che
    }
  }
  const detail = last instanceof Error ? last.message : String(last ?? "");
  throw new Error(`Không mô hình nào còn phục vụ (đã thử ${models.length}). Lỗi cuối: ${detail}`);
}

export function aiUnavailable(): Response {
  return new Response(JSON.stringify({
    message: "Trợ lý AI chưa được bật cho không gian này. Cần gắn binding AI cho Worker của tenant rồi triển khai lại.",
  }), { status: 501, headers: { "content-type": "application/json; charset=utf-8" } });
}

/**
 * Lỗi của mô hình phải NÓI RA NÓ LÀ GÌ.
 *
 * Ném tiếp lên handler ngoài thì mọi thứ — model sai tên, tài khoản chưa bật Workers AI,
 * ảnh quá lớn — đều thành đúng một chữ "Internal error", và không ai lần ra được. Đây là
 * tính năng phụ: hỏng thì nói hỏng vì sao, chứ không làm hỏng cả trang.
 */
async function guard(label: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ message: `${label} thất bại: ${detail}`.slice(0, 500) }), {
      status: 502, headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

/**
 * Lấy phần CHỮ ra khỏi kết quả, bất kể mô hình trả về hình dạng nào.
 *
 * Mỗi họ mô hình trên Workers AI gói câu trả lời một kiểu: `{response}`, `{result:{response}}`,
 * hoặc kiểu OpenAI `{choices:[{message:{content}}]}`. Chỉ đọc đúng một hình dạng thì đổi mô
 * hình là trả về chuỗi rỗng — lời gọi "thành công" 200 nhưng không có chữ nào, đúng thứ vừa
 * xảy ra khi chuyển sang Llama 4 Scout. Bóc theo mọi hình dạng đã biết, không đoán một cái.
 */
const textOf = (result: unknown): string => {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  const direct = record.response ?? (record.result as Record<string, unknown> | undefined)?.response;
  if (typeof direct === "string" && direct.trim()) return direct;
  const choices = (record.choices ?? (record.result as Record<string, unknown> | undefined)?.choices) as
    | Array<{ message?: { content?: unknown }; text?: unknown }> | undefined;
  const choice = choices?.[0];
  const content = choice?.message?.content ?? choice?.text;
  if (typeof content === "string" && content.trim()) return content;
  // Kiểu multimodal: content là mảng các khối {type:"text", text:"…"}.
  if (Array.isArray(content)) {
    const joined = content.map((part) => (part && typeof part === "object" ? String((part as { text?: unknown }).text ?? "") : "")).join("");
    if (joined.trim()) return joined;
  }
  return "";
};

/** Lấy khối JSON đầu tiên trong câu trả lời. Mô hình hay kèm lời dẫn dù đã dặn đừng. */
function extractJson(raw: string): JsonValue | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  for (let end = candidate.length; end > start; end -= 1) {
    try { return JSON.parse(candidate.slice(start, end)) as JsonValue; } catch { /* thử ngắn hơn */ }
  }
  return null;
}

const fold = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/gi, "d").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Chữ đọc được trên giấy → mã trong danh mục.
 *
 * Khớp CHÍNH XÁC sau khi bỏ dấu và ký tự ngăn cách, rồi mới tới khớp chứa nhau. Không dùng
 * khoảng cách chuỗi mờ: "AL548" và "AL558" chỉ khác một ký tự nhưng là hai cây nhôm khác
 * nhau, và một phép khớp "gần đúng" ở đây sinh ra phiếu nhập sai mã mà trông hoàn toàn bình thường.
 */
function matchItem(text: string, catalogue: Array<{ name: string; item_name: string }>): string | null {
  const needle = fold(text);
  if (!needle) return null;
  for (const item of catalogue) if (fold(item.name) === needle || fold(item.item_name) === needle) return item.name;
  const contains = catalogue.filter((item) => fold(item.name).includes(needle) || needle.includes(fold(item.name)));
  return contains.length === 1 ? contains[0]!.name : null;
}

/**
 * Đọc ảnh phiếu giao của nhà cung cấp thành các dòng hàng ĐỀ XUẤT.
 *
 * Trả thêm `raw_text` của từng dòng để người nhập đối chiếu được với tờ giấy, và để dòng nào
 * không quy được về mã vẫn còn nguyên thứ đã đọc thay vì biến mất.
 */
/**
 * Danh mục để đối chiếu, đọc thẳng từ D1.
 *
 * Không bắt client gửi lên: gửi cả danh mục qua mạng cho MỖI lần đọc phiếu là vài trăm KB
 * mỗi lần, và tệ hơn — nó biến danh sách mã hợp lệ thành thứ do client khai, tức là thứ có
 * thể sửa. Chỉ lấy hàng ĐƯỢC MUA và chưa ngừng, vì đây là phiếu nhập.
 */
async function purchasableItems(env: TenantEnv, tenantId: string): Promise<Array<{ name: string; item_name: string }>> {
  const rows = await env.DB.prepare(
    `SELECT name, payload_json FROM documents WHERE tenant_id=?1 AND doctype='Item' LIMIT 2000`,
  ).bind(tenantId).all<{ name: string; payload_json: string }>();
  const out: Array<{ name: string; item_name: string }> = [];
  for (const row of rows.results ?? []) {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(row.payload_json) as Record<string, unknown>; } catch { /* bỏ dòng hỏng */ }
    if (payload.disabled) continue;
    if (payload.is_purchase_item === false || payload.is_purchase_item === 0) continue;
    out.push({ name: row.name, item_name: String(payload.item_name ?? row.name) });
  }
  return out;
}

export async function readReceiptImage(env: TenantEnv, tenantId: string, body: JsonObject): Promise<Response> {
  if (!env.AI) return aiUnavailable();
  return guard("Đọc phiếu bằng ảnh", () => readReceiptImageInner(env, tenantId, body));
}
async function readReceiptImageInner(env: TenantEnv, tenantId: string, body: JsonObject): Promise<Response> {
  const image = String(body.image ?? "");
  if (!image) return new Response(JSON.stringify({ message: "Thiếu ảnh phiếu." }), { status: 400 });
  const base64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
  const bytes = [...atob(base64)].map((c) => c.charCodeAt(0));

  const prompt = [
    "Đây là ảnh một PHIẾU XUẤT KHO / phiếu giao hàng của nhà cung cấp nhôm ở Việt Nam.",
    "Đọc bảng dòng hàng. Với MỖI dòng trả về:",
    '  ten_hang (nguyên văn), ma_hang (nếu trên phiếu có cột mã), mau, so_luong, don_vi, kho_dai_m (chiều dài cây/khổ, mét), so_cay, don_gia',
    "Số dùng dấu chấm thập phân. Không đọc được ô nào thì để null.",
    'Chỉ trả về JSON: {"supplier":"...","so_phieu":"...","ngay":"YYYY-MM-DD","lines":[...]}',
    "Tuyệt đối không bịa dòng không có trên ảnh.",
  ].join("\n");

  const result = await runFirstAvailable(env, VISION_MODELS, { image: bytes, prompt, max_tokens: 2048 });
  const parsed = extractJson(textOf(result));
  if (!parsed || typeof parsed !== "object") {
    return new Response(JSON.stringify({ message: "Không đọc được bảng trên ảnh. Thử ảnh rõ hơn hoặc chụp thẳng góc." }), {
      status: 422, headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const doc = parsed as JsonObject;
  const catalogue = await purchasableItems(env, tenantId);
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  const suggested = lines.map((line) => {
    const row = (line ?? {}) as JsonObject;
    const label = String(row.ma_hang ?? row.ten_hang ?? "");
    const matched = matchItem(label, catalogue) ?? matchItem(String(row.ten_hang ?? ""), catalogue);
    return {
      item_code: matched,
      raw_text: label,
      color: row.mau ?? null,
      qty: row.so_luong ?? null,
      uom: row.don_vi ?? null,
      length_m: row.kho_dai_m ?? null,
      qty_bar: row.so_cay ?? null,
      rate: row.don_gia ?? null,
      // Dòng nào không quy được về mã phải HIỆN RÕ, không lặng lẽ bỏ qua: người nhập cần
      // biết tờ giấy có bao nhiêu dòng để đối chiếu, kể cả dòng máy đọc không ra.
      matched: Boolean(matched),
    };
  });

  return new Response(JSON.stringify({
    supplier_text: doc.supplier ?? null,
    supplier_invoice_no: doc.so_phieu ?? null,
    posting_date: doc.ngay ?? null,
    lines: suggested,
    unmatched: suggested.filter((line) => !line.matched).length,
  }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
}

/**
 * Hỏi đáp của trợ lý.
 *
 * Bối cảnh do CLIENT gửi lên vẫn chỉ là dữ liệu người dùng đang được phép xem. Nó là nguồn
 * sự thật cho các câu hỏi về số liệu/trạng thái của tenant, nhưng không còn là cái lồng nhốt
 * mọi câu trả lời: kiến thức chung, nghiệp vụ và cách dùng phần mềm có thể trả lời bình thường.
 */
export async function askAssistant(
  env: TenantEnv,
  body: JsonObject,
  audit?: { tenantId: string; userId: string },
): Promise<Response> {
  if (!env.AI) return aiUnavailable();
  return guard("Hỏi trợ lý", () => askAssistantInner(env, body, audit));
}
async function askAssistantInner(
  env: TenantEnv,
  body: JsonObject,
  audit?: { tenantId: string; userId: string },
): Promise<Response> {
  const question = String(body.question ?? "").trim();
  if (!question) return new Response(JSON.stringify({ message: "Chưa có câu hỏi." }), { status: 400 });
  const context = JSON.stringify(body.context ?? {}).slice(0, 12_000);

  const result = await runFirstAvailable(env, TEXT_MODELS, {
    messages: [
      {
        role: "system",
        content: [
          "Bạn là trợ lý vận hành trong phần mềm quản lý của một doanh nghiệp Việt Nam.",
          "Trả lời tự nhiên, hữu ích và đi thẳng vào việc; ưu tiên tiếng Việt trừ khi người dùng yêu cầu khác.",
          "BỐI CẢNH là dữ liệu màn hình hiện tại để tham khảo khi câu hỏi liên quan, không phải giới hạn chủ đề.",
          "Bạn được dùng kiến thức chung để giải thích nghiệp vụ, quy trình, phần mềm, phân tích và đề xuất cách làm.",
          "Nếu người dùng hỏi một con số, trạng thái hoặc sự thật CỤ THỂ của doanh nghiệp mà BỐI CẢNH không chứa, hãy nói rõ là chưa đủ dữ liệu để xác minh và không bịa dữ liệu tenant.",
          "Không tự nhận đã đọc, sửa hoặc thực hiện hành động trên dữ liệu nếu hệ thống không cung cấp bằng chứng đó trong BỐI CẢNH.",
        ].join(" "),
      },
      { role: "user", content: `BỐI CẢNH HIỆN TẠI (có thể không liên quan câu hỏi):\n${context}\n\nCÂU HỎI: ${question}` },
    ],
    max_tokens: 1200,
  });

  const answer = textOf(result).trim();
  // Trả rỗng mà vẫn 200 thì người dùng thấy một bong bóng trắng và không biết hỏng ở đâu.
  if (!answer) {
    return new Response(JSON.stringify({
      message: `Mô hình trả về rỗng. Hình dạng kết quả: ${JSON.stringify(result).slice(0, 200)}`,
    }), { status: 502, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  if (audit) {
    await env.DB.prepare(
      `INSERT INTO ai_logs(
         tenant_id,log_id,user_id,question,context_json,answer,model_family,created_at
       ) VALUES(?1,?2,?3,?4,?5,?6,'workers-ai',?7)`,
    ).bind(
      audit.tenantId,
      crypto.randomUUID(),
      audit.userId,
      question,
      context,
      answer,
      new Date().toISOString(),
    ).run();
  }
  return new Response(JSON.stringify({ answer }), {
    status: 200, headers: { "content-type": "application/json; charset=utf-8" },
  });
}
