/** @jsxImportSource react */
/**
 * BÓNG TRỢ LÝ — hỏi bằng tiếng Việt, có thể dùng bối cảnh màn hình hiện tại khi câu hỏi cần dữ liệu cụ thể.
 *
 * Bối cảnh gửi lên là thứ NGƯỜI DÙNG ĐANG XEM, do màn hình tự khai qua `useAssistantContext`.
 * Trợ lý không tự đi quét cơ sở dữ liệu, nên quyền xem của người dùng vẫn là ranh giới duy
 * nhất đối với dữ liệu tenant. Câu hỏi kiến thức/nghiệp vụ chung vẫn được trả lời bình thường;
 * chỉ dữ liệu cụ thể của doanh nghiệp mới phải bám vào bối cảnh đã được phép xem.
 */
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { Button, Input } from "@metaforge/ui";

interface Message { role: "user" | "assistant"; text: string }

/** Màn hình đang mở khai bối cảnh của nó vào đây; bóng trợ lý đọc lúc gửi câu hỏi. */
const currentContext: { value: unknown } = { value: null };
export function setAssistantContext(value: unknown): void { currentContext.value = value; }

/**
 * Phiên đăng nhập là COOKIE, nên mọi lời gọi ghi phải kèm mã chống giả mạo (CSRF).
 *
 * Thiếu nó, server trả "CSRF token is missing or does not match this session" — đúng luật,
 * vì một trang web khác cũng gửi được cookie của người dùng sang đây. Bộ điều hợp đặt sẵn mã
 * này lên `globalThis.csrf_token` khi đăng nhập; đây là chỗ duy nhất cần đọc lại.
 */
export function aiHeaders(): Record<string, string> {
  const token = (globalThis as { csrf_token?: string }).csrf_token ?? "";
  return { "content-type": "application/json", ...(token ? { "x-frappe-csrf-token": token } : {}) };
}

export interface AssistantBubbleProps {
  appName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function AssistantBubble({ appName = "Trợ lý", open: controlledOpen, onOpenChange, hideTrigger = false }: AssistantBubbleProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const send = async () => {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setBusy(true);
    try {
      const response = await fetch("/api/method/metaforge.ai.ask", {
        method: "POST", credentials: "include",
        headers: aiHeaders(),
        body: JSON.stringify({ question, context: currentContext.value }),
      });
      const result = await response.json() as { answer?: string; message?: string };
      setMessages((prev) => [...prev, {
        role: "assistant",
        text: response.ok ? (result.answer ?? "(không có trả lời)") : (result.message ?? `Lỗi ${response.status}`),
      }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", text: error instanceof Error ? error.message : "Không gọi được trợ lý" }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    if (hideTrigger) return null;
    return (
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 size-12 rounded-full shadow-lg transition hover:brightness-110"
        aria-label="Mở trợ lý"
        title="Hỏi trợ lý AI"
      >
        <Bot className="size-5" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex h-[min(30rem,calc(100dvh-6rem))] w-[min(24rem,92vw)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Bot className="size-4 text-primary" />
        <strong className="text-sm">{appName}</strong>
        <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setOpen(false)} aria-label="Đóng">
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">
            Hỏi về nghiệp vụ, cách dùng phần mềm, phân tích hoặc dữ liệu đang mở. Bối cảnh màn hình hiện tại chỉ là thông tin hỗ trợ khi câu hỏi cần số liệu cụ thể.
          </p>
        ) : null}
        {messages.map((message, i) => (
          <div
            key={i}
            className={message.role === "user"
              ? "ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              : "w-fit max-w-[92%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-1.5 text-sm"}
          >
            {message.text}
          </div>
        ))}
        {busy ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />đang nghĩ…</div> : null}
        <div ref={endRef} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t p-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
          placeholder="Hỏi AI bất kỳ điều gì…"
          className="min-w-0 flex-1"
        />
        <Button type="button" size="icon" onClick={() => void send()} disabled={busy || !draft.trim()} aria-label="Gửi">
          <Send />
        </Button>
      </div>
    </div>
  );
}
