// Phiên bản bản build: git short hash + giờ build (ISO, tới phút). Không có git → 'dev'.
import { execSync } from 'node:child_process';

export function computeAppVersion(now = new Date()) {
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!hash) return 'dev';
    return `${hash} ${now.toISOString().slice(0, 16)}Z`;
  } catch {
    return 'dev';
  }
}
