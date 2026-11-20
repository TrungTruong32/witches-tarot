// Phiên bản bản build: git short hash + giờ build (ISO, tới phút). Không có git → 'dev'.
// git chạy ở gốc repo (không phụ thuộc thư mục hiện tại của tiến trình gọi).
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export function computeAppVersion(now = new Date(), cwd = REPO_ROOT) {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!hash) return 'dev';
    return `${hash} ${now.toISOString().slice(0, 16)}Z`;
  } catch {
    return 'dev';
  }
}
