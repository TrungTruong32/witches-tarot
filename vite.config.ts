/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';

// Dữ liệu bài & ảnh vẫn nằm ở gốc repo (git-ignored, deploy từ máy). Khi chạy dev, phục vụ thẳng từ gốc.
// Việc chuyển chúng vào bản build thuộc Kế hoạch 3.
const ROOT_STATIC = /^\/(tarot\.db|card_en\.json|sky\.json|cardback\.png|cardback-witches\.webp|icon-[\w-]+\.png|apple-touch-icon\.png|manifest\.webmanifest|og-image\.jpg)$/;
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

export default defineConfig({
  plugins: [react(), serveRootStatic()],
  publicDir: false,
  test: {
    environment: 'jsdom',
    // Node ≥25 bật sẵn localStorage riêng (webstorage) và che mất localStorage của jsdom → tắt đi khi chạy test.
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'tests/**/*.test.ts', 'api/**/*.test.ts'],
  },
});
