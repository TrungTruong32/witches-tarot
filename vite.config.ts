/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, createReadStream } from 'node:fs';
import { ROOT_STATIC } from './scripts/root-static.mjs';
import { resolve, extname } from 'node:path';
import { computeAppVersion } from './scripts/app-version.mjs';

// Dữ liệu bài & ảnh nằm ở gốc repo (git-ignored, deploy từ máy). Khi chạy dev, phục vụ thẳng từ gốc (danh sách trắng);
// khi build, scripts/copy-static.mjs chép chúng vào dist/.
const MIME: Record<string, string> = {
  '.db': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
};

function serveRootStatic(): Plugin {
  return {
    name: 'serve-root-static',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0] ?? '';
        if (!ROOT_STATIC.test(path)) return next();
        const file = resolve(__dirname, '.' + path);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Gắn <meta name="app-version"> vào index.html khi build (dev: 'dev'). Bước kiểm tra sau deploy đọc thẻ này.
function appVersionMeta(): Plugin {
  return {
    name: 'app-version-meta',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => {
        if (ctx.server) return html.replace('%APP_VERSION%', 'dev');
        const v = computeAppVersion();
        // bản build không có git → 'dev': deploy-*.mjs sẽ từ chối bản này
        if (v === 'dev') console.warn("⚠ app-version = 'dev' (không đọc được git) — bản build này không deploy được");
        return html.replace('%APP_VERSION%', v);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), serveRootStatic(), appVersionMeta()],
  publicDir: false,
  build: {
    // Font không bao giờ nhúng data: vào CSS (CSP font-src chỉ 'self'; file riêng thì preload + SW cache được)
    assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
  },
  server: {
    // Gốc dự án là gốc repo → chặn file bí mật / dữ liệu riêng (test.ipynb có API key, Data/ là dữ liệu bài gốc…)
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/*.ipynb', '**/Data/**', '**/local/**', '**/.superpowers/**', '**/.vercel/**'] },
  },
  test: {
    environment: 'jsdom',
    // Node ≥25 bật sẵn localStorage riêng (webstorage) và che mất localStorage của jsdom → tắt đi khi chạy test.
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
