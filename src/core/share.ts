// Chia sẻ trải bài bằng link: dữ liệu mã hoá vào hash `#r=...`.
// Định dạng PHẢI giữ nguyên để link cũ còn mở được:
//   '1' + base64url(deflate-raw(JSON))  — khi nén ngắn hơn
//   '0' + base64url(UTF-8 JSON)
import { readingDecks } from './prompt';
import type { SpreadCard } from './types';

/** Mỗi lá: [id, ngược?] — dựng lại từ DB; kèm chi tiết chỉ khi không có id (bộ ngoài chuẩn). */
export type ShareCard = [number, 0 | 1] | [-1, 0 | 1, string, string?, string?, string?, (string | null)?];

export interface ShareData {
  /** câu hỏi */ q: string;
  /** bộ bài */ d: string;
  /** khoá kiểu trải */ p: string;
  /** lời giải AI */ a: string;
  c: ShareCard[];
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] as number);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const w = stream.writable.getWriter();
  // Lỗi ghi/đóng cũng hiện ra ở phía readable bên dưới → bỏ qua ở đây để khỏi thành unhandled rejection
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function encodeShare(obj: ShareData): Promise<string> {
  const json = JSON.stringify(obj);
  const utf8 = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const packed = '1' + b64urlFromBytes(await pipe(utf8, new CompressionStream('deflate-raw')));
      if (packed.length < json.length) return packed;
    } catch {
      /* rơi xuống dạng không nén */
    }
  }
  return '0' + b64urlFromBytes(utf8);
}

export async function decodeShare(s: string): Promise<ShareData | null> {
  try {
    const mode = s[0];
    const body = s.slice(1);
    let bytes: Uint8Array;
    if (mode === '1') {
      if (typeof DecompressionStream === 'undefined') return null;
      bytes = await pipe(bytesFromB64url(body), new DecompressionStream('deflate-raw'));
    } else if (mode === '0') {
      bytes = bytesFromB64url(body);
    } else {
      return null;
    }
    const v: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return v && typeof v === 'object' ? (v as ShareData) : null;
  } catch {
    return null;
  }
}

export function buildShareData(i: {
  question: string;
  fallbackDeck: string | null;
  spreadKey: string;
  answer: string;
  cards: SpreadCard[];
}): ShareData {
  return {
    q: (i.question || '').trim(),
    d: readingDecks(i.cards).join(', ') || i.fallbackDeck || '',
    p: i.spreadKey,
    a: i.answer || '',
    c: i.cards.map((c): ShareCard => {
      const rev: 0 | 1 = c.orientation === 'nguoc' ? 1 : 0;
      return c.id != null && c.id >= 0 ? [c.id, rev] : [-1, rev, c.ten, c.image_url, c.bo, c.so, c.deck];
    }),
  };
}
