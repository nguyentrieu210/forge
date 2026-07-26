/**
 * AI providers thật (M-AI, §2.8) — SHELL Pha 2.
 * Factory tạo `AIProvider` (đúng interface ở ./AIPanel):
 *  - createOpenAICompatProvider: gọi endpoint OpenAI-compatible thật (baseUrl + apiKey + model).
 *  - createEchoProvider: provider giả, không cần mạng — để demo/offline hoạt động.
 * Key/endpoint do người dùng cấp ở Settings (lưu cục bộ trình duyệt), KHÔNG hard-code.
 */
import type { AIProvider, AIContext } from "./AIPanel.js";

/** Cấu hình endpoint LLM OpenAI-compatible. */
export interface AIConfig {
  /** Ví dụ: https://api.openai.com/v1 (không kèm /chat/completions). */
  baseUrl: string;
  apiKey: string;
  /** Ví dụ: gpt-4o-mini. */
  model: string;
}

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/** Bỏ dấu "/" cuối để ghép path an toàn. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** Ghép system message tối thiểu từ context (nếu có). */
function buildMessages(prompt: string, context?: AIContext): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [];
  if (context?.doctype) {
    const parts = [`Người dùng đang xem doctype "${context.doctype}"`];
    if (context.name) parts.push(`bản ghi "${context.name}"`);
    messages.push({
      role: "system",
      content: `Bạn là trợ lý trong ứng dụng MetaForge. ${parts.join(", ")}. Trả lời ngắn gọn, đúng trọng tâm, bằng tiếng Việt.`,
    });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

/**
 * Provider gọi endpoint OpenAI-compatible thật.
 * complete → POST `${baseUrl}/chat/completions`, parse choices[0].message.content.
 */
export function createOpenAICompatProvider(config: AIConfig): AIProvider {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const { apiKey, model } = config;

  return {
    name: model || "OpenAI-compat",
    async complete(prompt, opts) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(prompt, opts?.context),
          stream: false,
        }),
        signal: opts?.signal,
      });

      let data: OpenAIChatResponse | null = null;
      try {
        data = (await res.json()) as OpenAIChatResponse;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg = data?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
        throw new Error(`AI endpoint lỗi: ${msg}`);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("AI endpoint không trả về nội dung hợp lệ.");
      }
      return content;
    },
  };
}

/**
 * Provider giả — không gọi mạng. Trả lại câu hỏi để demo/offline hoạt động.
 */
export function createEchoProvider(): AIProvider {
  return {
    name: "Demo (echo)",
    async complete(prompt) {
      // Giả lập độ trễ mạng nhẹ để thấy loading state.
      await new Promise((resolve) => setTimeout(resolve, 250));
      return `🤖 (demo) Bạn hỏi: ${prompt}`;
    },
  };
}
