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
import { runForgeAi } from "../../../packages/ai-policy/src/index.js";
import type { TenantEnv } from "./env.js";

export function aiUnavailable(): Response {
  return new Response(JSON.stringify({
    message: "Trợ lý AI chưa được bật cho không gian này. Cần gắn binding AI cho Worker của tenant rồi triển khai lại.",
  }), { status: 501, headers: { "content-type": "application/json; charset=utf-8" } });
}

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
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (part && typeof part === "object" ? String((part as { text?: unknown }).text ?? "") : ""))
      .join("");
    if (joined.trim()) return joined;
  }
  return "";
};

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

function matchItem(text: string, catalogue: Array<{ name: string; item_name: string }>): string | null {
  const needle = fold(text);
  if (!needle) return null;
  for (const item of catalogue) if (fold(item.name) === needle || fold(item.item_name) === needle) return item.name;
  const contains = catalogue.filter((item) => fold(item.name).includes(needle) || needle.includes(fold(item.name)));
  return contains.length === 1 ? contains[0]!.name : null;
}

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

  const execution = await runForgeAi(env.AI, {
    tenantId,
    app: "tenant-worker",
    purpose: "receipt_ocr",
    requestClass: "extraction",
    sensitivity: "confidential",
    input: { image: bytes, prompt, max_tokens: 2048 },
  }, env.AI_GATEWAY_ID ? { gatewayId: env.AI_GATEWAY_ID } : {});
  const parsed = extractJson(textOf(execution.result));
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
  const tenantId = audit?.tenantId ?? env.TENANT_ID ?? "";

  const execution = await runForgeAi(env.AI, {
    tenantId,
    ...(audit?.userId ? { userId: audit.userId } : {}),
    app: "tenant-worker",
    purpose: "context_assistant",
    requestClass: "interactive",
    sensitivity: "confidential",
    input: {
      messages: [
        {
          role: "system",
          content: [
            "Bạn là trợ lý của một xưởng cửa cuốn nhôm ở Việt Nam, làm việc trong phần mềm quản lý của họ.",
            "Trả lời NGẮN, bằng tiếng Việt, đi thẳng vào con số.",
            "Chỉ dùng dữ liệu trong phần BỐI CẢNH. Bối cảnh không có thì nói thẳng là không có,",
            "và chỉ ra người dùng nên mở màn hình nào — TUYỆT ĐỐI không suy đoán con số.",
          ].join(" "),
        },
        { role: "user", content: `BỐI CẢNH:\n${context}\n\nCÂU HỎI: ${question}` },
      ],
      max_tokens: 700,
    },
  }, env.AI_GATEWAY_ID ? { gatewayId: env.AI_GATEWAY_ID } : {});

  const answer = textOf(execution.result).trim();
  if (!answer) {
    return new Response(JSON.stringify({
      message: `Mô hình trả về rỗng. Hình dạng kết quả: ${JSON.stringify(execution.result).slice(0, 200)}`,
    }), { status: 502, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  if (audit) {
    await env.DB.prepare(
      `INSERT INTO ai_logs(
         tenant_id,log_id,user_id,question,context_json,answer,model_family,created_at
       ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`,
    ).bind(
      audit.tenantId,
      crypto.randomUUID(),
      audit.userId,
      question,
      context,
      answer,
      `workers-ai:${execution.model}`,
      new Date().toISOString(),
    ).run();
  }
  return new Response(JSON.stringify({ answer }), {
    status: 200, headers: { "content-type": "application/json; charset=utf-8" },
  });
}
