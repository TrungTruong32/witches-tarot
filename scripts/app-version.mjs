// Phiên bản bản build: git short hash + giờ build (ISO, tới phút). Không có git → 'dev'.
// git chạy ở gốc repo (không phụ thuộc thư mục hiện tại của tiến trình gọi).
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Dạng phiên bản hợp lệ: "<git short hash> <YYYY-MM-DDTHH:MMZ>". */
export const APP_VERSION_RE = /^[0-9a-f]{7,40} \d{4}-\d\d-\d\dT\d\d:\d\dZ$/;

export function computeAppVersion(now = new Date(), cwd = REPO_ROOT, env = process.env) {
  // Build trên máy chủ Vercel không có .git: deploy-lib truyền phiên bản tính ở máy qua --build-env APP_VERSION
  if (env.APP_VERSION && APP_VERSION_RE.test(env.APP_VERSION)) return env.APP_VERSION;
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!hash) return 'dev';
    return `${hash} ${now.toISOString().slice(0, 16)}Z`;
  } catch {
    return 'dev';
  }
}
