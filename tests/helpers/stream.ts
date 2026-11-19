// Response giả với body stream, cắt thành các chunk tuỳ ý (kể cả cắt giữa dòng / giữa ký tự UTF-8).
export function streamResponse(chunks: string[], init: ResponseInit = {}): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

export interface FetchCall {
  url: string;
  init: RequestInit;
  body: unknown;
  headers: Record<string, string>;
}

/** fetch giả: ghi lại lời gọi, trả lời bằng `respond`. */
export function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body, headers: { ...(init.headers as Record<string, string>) } });
    return respond(url, init);
  }) as typeof fetch;
  return { fetch: f, calls };
}
