// Lấy các hàm/hằng THEO TÊN từ bản sao đóng băng của witches_tarot.html và chạy trong sandbox Node (vm).
// Dùng cho test "giống bản cũ": code mới phải cho ra cùng kết quả với chính code cũ trên cùng đầu vào.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const LEGACY_FILE = join(dirname(fileURLToPath(import.meta.url)), 'witches_tarot.legacy.html');

let cachedScript: string | null = null;

/** Thân thẻ <script> lớn nằm sau thẻ nạp sql-wasm. */
function legacyScript(): string {
  if (cachedScript != null) return cachedScript;
  const html = readFileSync(LEGACY_FILE, 'utf8');
  const marker = html.indexOf('sql-wasm.js');
  if (marker < 0) throw new Error('legacy: sql-wasm marker not found');
  const open = html.indexOf('<script>', marker);
  const close = html.indexOf('</script>', open);
  cachedScript = html.slice(open + '<script>'.length, close);
  return cachedScript;
}

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '']);

/**
 * Tìm điểm kết thúc của một khai báo bắt đầu tại `start`.
 * Bỏ qua chuỗi, template literal (kể cả ${...} lồng nhau), comment và regex literal.
 * Hàm: kết thúc khi đóng ngoặc nhọn của thân. Hằng: kết thúc ở ';' (hoặc xuống dòng) khi về độ sâu 0.
 */
function declarationEnd(src: string, start: number, kind: 'function' | 'const'): number {
  let depth = 0;
  let sawBody = false;
  let prevSig = '';
  // ngăn xếp: số độ sâu ngoặc tại đó một ${ của template được mở
  const templateStack: number[] = [];
  let i = start;

  const readTemplate = (from: number): number => {
    // from trỏ sau dấu ` mở (hoặc sau } đóng ${...}); trả về vị trí sau ` đóng, hoặc -1 nếu gặp ${
    let j = from;
    while (j < src.length) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') return j + 1;
      if (c === '$' && src[j + 1] === '{') { templateStack.push(depth); depth++; return -(j + 2); }
      j++;
    }
    throw new Error('legacy: unterminated template');
  };

  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) return src.length; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (src[j] !== c) { if (src[j] === '\\') j++; j++; }
      i = j + 1; prevSig = 'a'; continue;
    }
    if (c === '`') {
      const r = readTemplate(i + 1);
      if (r >= 0) { i = r; prevSig = 'a'; } else { i = -r; prevSig = '{'; }
      continue;
    }
    if (c === '/' && REGEX_PREV.has(prevSig)) {
      let j = i + 1, inClass = false;
      while (j < src.length) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inClass = true; else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j++;
      }
      j++;
      while (/[a-z]/i.test(src[j] ?? '')) j++;
      i = j; prevSig = 'a'; continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth++; if (c === '{') sawBody = true; }
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (c === '}' && templateStack.length && templateStack[templateStack.length - 1] === depth) {
        templateStack.pop();
        const r = readTemplate(i + 1);
        if (r >= 0) { i = r; prevSig = 'a'; } else { i = -r; prevSig = '{'; }
        continue;
      }
      if (kind === 'function' && depth === 0 && sawBody && c === '}') return i + 1;
    } else if (kind === 'const' && depth === 0 && c === ';') return i + 1;
    if (!/\s/.test(c)) {
      prevSig = /[\w$]/.test(c) ? 'a' : c;
      // từ khoá đứng trước regex
      if (prevSig === 'a') {
        const m = /(?:return|typeof|case|in|of)$/.exec(src.slice(Math.max(0, i - 6), i + 1));
        if (m && !/[\w$]/.test(src[i + 1] ?? '')) prevSig = '(';
      }
    }
    i++;
  }
  throw new Error('legacy: unterminated declaration at ' + start);
}

function findDeclaration(src: string, name: string): { start: number; end: number } {
  const esc = name.replace(/\$/g, '\\$');
  const re = new RegExp(`(^|\\n)[ \\t]*(?:(async\\s+)?function\\s+${esc}\\s*\\(|(?:const|let|var)\\s+${esc}\\s*=)`, 'g');
  const m = re.exec(src);
  if (!m) throw new Error(`legacy: declaration "${name}" not found`);
  const start = m.index + (m[1] ? m[1].length : 0);
  const kind = /function\s/.test(m[0]) ? 'function' : 'const';
  return { start, end: declarationEnd(src, start, kind) };
}

const BASE_GLOBALS = () => ({
  console, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob,
  btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent,
  Math, JSON, Date, Number, String, Object, Array, Set, Map, RegExp, Promise, Uint8Array, Error, crypto,
});

/**
 * Trả về các binding đã nêu tên (hàm hoặc hằng), đánh giá theo đúng thứ tự trong file cũ, kèm context sandbox
 * (đổi ctx.lang… sau khi nạp để thử ngôn ngữ khác). Phải liệt kê cả những hàm/hằng phụ thuộc.
 * `globals` là các biến toàn cục mà code cũ đọc (lang, settings, db…).
 */
export function loadLegacyWithContext<T extends object>(
  names: string[],
  globals: Record<string, unknown> = {},
): { fns: T; ctx: Record<string, unknown> } {
  const src = legacyScript();
  const decls = names.map(name => ({ name, ...findDeclaration(src, name) })).sort((a, b) => a.start - b.start);
  const body = decls.map(d => src.slice(d.start, d.end)).join('\n');
  const exportsObj = `({${names.map(n => `${JSON.stringify(n)}: ${n}`).join(',')}})`;
  const ctx = vm.createContext({ ...BASE_GLOBALS(), ...globals }) as Record<string, unknown>;
  ctx.window = ctx;
  const fns = vm.runInContext(`${body}\n;${exportsObj}`, ctx) as T;
  return { fns, ctx };
}

export function loadLegacy<T extends object>(names: string[], globals: Record<string, unknown> = {}): T {
  return loadLegacyWithContext<T>(names, globals).fns;
}
