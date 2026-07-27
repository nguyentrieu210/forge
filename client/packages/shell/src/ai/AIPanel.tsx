/** @jsxImportSource react */
/**
 * AIPanel + AIActionRegistry (M-AI, §2.8) — SHELL Pha 2.
 * Có provider → chat thật (Textarea + Gửi → provider.complete → hiện câu trả lời + loading).
 * Chưa có provider → "Chưa cấu hình nhà cung cấp AI".
 * Provider được tạo từ ./provider (OpenAI-compat / echo) và truyền vào qua prop.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Check, Copy, Sparkles, SendHorizonal, Settings2, Loader2, Square, Trash2 } from "lucide-react";
import { Button, Textarea, Badge, Separator, cn } from "@metaforge/ui";

export interface AIContext {
  doctype?: string;
  name?: string;
  doc?: Record<string, unknown>;
}

/** Provider = nối ở Pha 2 (OpenAI-compat/Anthropic). Pha 1 thường null. */
export interface AIProvider {
  name: string;
  /** Pha 2: trả stream/hoàn chỉnh. */
  complete: (prompt: string, opts?: { signal?: AbortSignal; context?: AIContext }) => Promise<string>;
}

export interface AIAction {
  id: string;
  label: string;
  icon?: ReactNode;
  scope: "form" | "list" | "global";
  /** prompt template hoặc handler; Pha 2 gọi provider.complete. */
  buildPrompt?: (ctx: AIContext) => string;
}

export class AIActionRegistry {
  private actions: AIAction[] = [];
  register(a: AIAction): void {
    this.actions = this.actions.filter((x) => x.id !== a.id).concat(a);
  }
  for(scope: AIAction["scope"]): AIAction[] {
    return this.actions.filter((a) => a.scope === scope || a.scope === "global");
  }
}

export interface AIPanelProps {
  provider?: AIProvider | null;
  actions?: AIAction[];
  scope?: AIAction["scope"];
  context?: AIContext;
  onConfigure?: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function AIPanel(props: AIPanelProps) {
  const historyKey = `mf-ai-chat:${props.scope ?? "global"}:${props.context?.doctype ?? "global"}:${props.context?.name ?? ""}`;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(historyKey) ?? "[]") as ChatMessage[]; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(historyKey, JSON.stringify(messages.slice(-40))); } catch { /* private mode/quota */ }
  }, [historyKey, messages]);

  const provider = props.provider ?? null;
  const configured = Boolean(provider);
  const actions = props.actions ?? [];
  const canSend = configured && !loading && Boolean(input.trim());

  async function send(prompt?: string) {
    const question = (prompt ?? input).trim();
    if (!provider || !question || loading) return;

    setInput("");
    setLastQuestion(question);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const answer = await provider.complete(question, { signal: controller.signal, context: includeContext ? props.context : undefined });
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-medium">Trợ lý AI</span>
        {!configured ? <Badge variant="warning" className="ml-auto">Chưa cấu hình</Badge> : <Badge variant="success" className="ml-auto">{provider!.name}</Badge>}
      </div>

      {actions.length ? (
        <div className="flex flex-wrap gap-1.5 p-3">
          {actions.map((a) => (
            <Button
              key={a.id}
              variant="outline"
              size="sm"
              disabled={!configured || loading}
              title={configured ? undefined : "Cần cấu hình AI"}
              onClick={() => {
                if (!a.buildPrompt) return;
                setInput(a.buildPrompt(props.context ?? {}));
              }}
            >
              {a.icon ?? <Sparkles className="size-3.5" />} {a.label}
            </Button>
          ))}
        </div>
      ) : null}

      <Separator />

      {configured && props.context?.doctype ? <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground"><span className="min-w-0 flex-1 truncate">Ngữ cảnh: {props.context.doctype}{props.context.name ? ` · ${props.context.name}` : ""}</span><Button type="button" variant={includeContext ? "secondary" : "ghost"} size="sm" className="h-7" onClick={() => setIncludeContext((value) => !value)}>{includeContext ? <Check className="size-3.5" /> : null}{includeContext ? "Đang gửi ngữ cảnh" : "Không gửi ngữ cảnh"}</Button></div> : null}

      <div className="flex-1 space-y-3 overflow-auto p-3 text-sm">
        {!configured ? (
          <div className="space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">Chưa cấu hình nhà cung cấp AI.</p>
            <p>Vào Thiết lập → AI để nhập endpoint OpenAI-compatible (baseUrl + key + model), hoặc bật chế độ demo (echo).</p>
            <Button variant="outline" size="sm" onClick={props.onConfigure}><Settings2 className="size-3.5" /> Cấu hình AI</Button>
          </div>
        ) : messages.length === 0 && !loading ? (
          <p className="text-muted-foreground">Hỏi bất kỳ điều gì về {props.context?.doctype ?? "dữ liệu"} — trả lời theo đúng quyền của bạn.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "group/message relative max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {m.content}
                {m.role === "assistant" ? <Button type="button" variant="ghost" size="icon-sm" className="absolute -right-8 top-0 opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100" onClick={() => { void navigator.clipboard.writeText(m.content); setCopied(i); window.setTimeout(() => setCopied(null), 1500); }} aria-label="Sao chép câu trả lời">{copied === i ? <Check /> : <Copy />}</Button> : null}
              </div>
            </div>
          ))
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang trả lời…
          </div>
        ) : null}

        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive" role="alert">Lỗi: {error}{lastQuestion ? <Button type="button" variant="link" size="sm" className="ml-2 h-auto p-0 text-destructive underline" onClick={() => void send(lastQuestion)}>Thử lại</Button> : null}</div> : null}
      </div>

      <div className="border-t p-2">
        {messages.length ? <div className="mb-1 flex justify-end"><Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" disabled={loading} onClick={() => { setMessages([]); setError(null); }}><Trash2 className="size-3.5" /> Xóa cuộc trò chuyện</Button></div> : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={configured ? "Nhập câu hỏi… (Enter để gửi)" : "Chưa cấu hình AI"}
            disabled={!configured}
            rows={2}
            className="resize-none"
          />
          <Button size="icon" variant={loading ? "destructive" : "default"} onClick={() => loading ? abortRef.current?.abort() : void send()} disabled={!loading && !canSend} aria-label={loading ? "Dừng trả lời" : "Gửi"}>
            {loading ? <Square className="size-4" /> : <SendHorizonal className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
