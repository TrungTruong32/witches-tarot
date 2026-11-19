/** Đọc body dạng stream theo từng dòng (SSE hoặc NDJSON). Dòng cuối không có '\n' vẫn được trả về. */
export async function streamLines(res: Response, onLine: (line: string) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  }
  buf += decoder.decode();
  if (buf) onLine(buf);
}

/** Phần dữ liệu của một dòng SSE `data: ...`; null nếu không phải dòng dữ liệu hoặc là `[DONE]`. */
export function sseData(line: string): string | null {
  const l = line.trim();
  if (!l.startsWith('data:')) return null;
  const payload = l.slice(5).trim();
  return payload && payload !== '[DONE]' ? payload : null;
}
