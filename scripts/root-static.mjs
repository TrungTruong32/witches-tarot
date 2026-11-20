// Tệp dữ liệu ở gốc repo được phép phục vụ khi chạy local (dev server + script so ảnh).
// Danh sách trắng: mọi thứ khác ở gốc (.env, test.ipynb, Data/, .git/…) không bao giờ được phục vụ.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

export const ROOT_STATIC = /^\/(tarot\.db|card_en\.json|sky\.json|cardback\.png|cardback-witches\.webp|icon-[\w-]+\.png|apple-touch-icon\.png|manifest\.webmanifest|og-image\.jpg)$/;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
};

/** Bản cũ đóng băng (tham chiếu parity) — witches_tarot.html ở gốc đã bỏ khi chuyển sang bản React. */
export const LEGACY_HTML = 'tests/legacy/witches_tarot.legacy.html';

/** Máy chủ tĩnh cho bản cũ: chỉ "/" (bản sao đóng băng) + danh sách trắng, chỉ lắng nghe trên 127.0.0.1. */
export function serveLegacy(root, port) {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url || '/').split('?')[0]);
    const f = p === '/' ? join(root, LEGACY_HTML) : join(root, p);
    if ((p !== '/' && !ROOT_STATIC.test(p)) || !existsSync(f) || statSync(f).isDirectory()) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
    res.end(readFileSync(f));
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}
