// Máy chủ tĩnh cho dist/ áp đúng luật trong vercel.json (redirects → rewrites → headers) để thử bản build
// với header thật (CSP, Permissions-Policy, Cache-Control) trên trình duyệt. Chỉ lắng nghe 127.0.0.1.
// KHÔNG chạy hàm /api (trả 404) — các script thử giả lập /api bằng page.route.
// Chạy tay: node scripts/serve-dist.mjs [port]   → phục vụ dist/ ở http://127.0.0.1:<port>
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.txt': 'text/plain', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mjs': 'text/javascript',
  '.map': 'application/json', '.avif': 'image/avif',
};

/** Tập con path-to-regexp mà vercel.json dùng: chữ thường ("." là ký tự thường), nhóm regex "(...)" giữ nguyên,
 *  ":name" → một đoạn, ":name*" → nhiều đoạn. Khớp toàn bộ đường dẫn.
 *  Cú pháp khác (?, +, *, {}, [], ":name?"…) → ném lỗi, để không âm thầm khớp sai so với Vercel. */
export function sourceToRegExp(source) {
  const bad = why => new Error(`vercel.json source "${source}": ${why} — serve-dist chưa hỗ trợ`);
  if (!source.startsWith('/')) throw bad('phải bắt đầu bằng /');
  let re = '';
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    if (ch === '(') {
      let depth = 0, j = i;
      for (; j < source.length; j++) {
        if (source[j] === '(') depth++;
        else if (source[j] === ')' && --depth === 0) break;
      }
      if (j >= source.length) throw bad('thiếu ")"');
      if (/[?+*{]/.test(source[j + 1] || '')) throw bad('bộ lặp sau nhóm');
      re += source.slice(i, j + 1);
      i = j + 1;
    } else if (ch === ':') {
      const m = /^:(\w+)(\*)?/.exec(source.slice(i));
      if (!m) throw bad('":" không có tên tham số');
      if (/[?+(]/.test(source[i + m[0].length] || '')) throw bad('bộ lặp/regex sau :' + m[1]);
      re += m[2] ? '(.*)' : '([^/]+)';
      i += m[0].length;
    } else if ('*+?{}[]|^$\\)'.includes(ch)) {
      throw bad(`ký tự "${ch}"`);
    } else {
      re += ch === '.' ? '\\.' : ch;
      i++;
    }
  }
  return new RegExp('^' + re + '$');
}

export const matchesSource = (source, path) => sourceToRegExp(source).test(path);

/** Header áp cho một đường dẫn: mọi luật khớp đều áp, luật sau ghi đè luật trước theo từng key (như Vercel). */
export function headersFor(config, path) {
  const out = {};
  for (const rule of config.headers || []) {
    if (!matchesSource(rule.source, path)) continue;
    for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

/** Đích rewrite (luật đầu tiên khớp) hoặc null — serveDist chỉ dùng khi không có file thật. */
export function rewriteFor(config, path) {
  const r = (config.rewrites || []).find(x => matchesSource(x.source, path));
  return r ? r.destination : null;
}

export function redirectFor(config, path) {
  return (config.redirects || []).find(x => matchesSource(x.source, path)) || null;
}

export const readVercelConfig = (file = join(REPO, 'vercel.json')) => JSON.parse(readFileSync(file, 'utf8'));

/** Phục vụ `root` với luật của vercel.json. `site.root` đổi được lúc chạy (giả lập deploy bản mới);
 *  `site.hits` ghi lại đường dẫn đã được yêu cầu. Trả về { server, site }. */
export function serveDist(root, port = 0, config = readVercelConfig()) {
  const site = { root: resolve(root), hits: [] };
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch { res.statusCode = 400; return res.end(); }
    site.hits.push(path);
    const redirect = redirectFor(config, path);
    if (redirect) {
      res.writeHead(redirect.permanent === false ? 307 : 308, { Location: redirect.destination });
      return res.end();
    }
    for (const [k, v] of Object.entries(headersFor(config, path))) res.setHeader(k, v);
    if (path.startsWith('/api/') || path === '/api') { res.statusCode = 404; return res.end('no functions locally'); }
    // Speed Insights / Web Analytics của Vercel: ở máy trả script rỗng (khỏi 404 trên console)
    if (path.startsWith('/_vercel/')) {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end('');
    }
    // Như Vercel: file tĩnh có thật được phục vụ trước, rewrite chỉ áp khi không có file
    const base = site.root;
    const fileAt = p => {
      let f = resolve(base, '.' + p);
      if (f !== base && !f.startsWith(base + sep)) return null;
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      return existsSync(f) && statSync(f).isFile() ? f : null;
    };
    let f = fileAt(path);
    if (!f) {
      const target = rewriteFor(config, path);
      f = target ? fileAt(target) : null;
    }
    if (!f) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
    // mặc định của Vercel cho file tĩnh khi vercel.json không đặt Cache-Control
    if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.end(readFileSync(f));
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok({ server, site })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = await serveDist(join(REPO, 'dist'), Number(process.argv[2]) || 4173);
  console.log('serve-dist: http://127.0.0.1:' + server.address().port);
}
