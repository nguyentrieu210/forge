const json = (value: unknown, status?: number) =>
  new Response(JSON.stringify(value), { ...(status === undefined ? {} : { status }), headers: { "content-type": "application/json" } });

// Bốn kiểu trả lời của worker. Trước đây khai trong index.ts, nên mọi module tách ra khỏi
// index đều phải kéo ngược index về — tức là không tách được.
export const answer = (value: unknown) => json(value);
export const refuse = (message: string) => json({ message }, 422);
export const accept = () => answer({ ok: true });
export const forbidden = (message: string) => json({ message }, 403);
