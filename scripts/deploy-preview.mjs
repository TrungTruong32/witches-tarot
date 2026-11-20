#!/usr/bin/env node
// Deploy bản đang commit (HEAD) lên Vercel Preview (Vercel build trên máy chủ), kiểm tra, rồi chạy smoke-flows trên URL preview.
//   node scripts/deploy-preview.mjs
// Được chạy từ nhánh bất kỳ (Preview là để thử trước khi merge). Từ chối nếu còn thay đổi chưa commit.
// Mã thoát: 0 = ổn; 1 = có bước hỏng; 2 = UNVERIFIED (Deployment Protection chặn 401/403, không kiểm tra được gì).
// /api/readings, /api/ai trả 503 trên Preview (chưa đặt biến môi trường cho Preview) chỉ là cảnh báo, smoke vẫn chạy.
// smoke-flows vẫn giả lập /api/ai + /api/readings → không tốn lượt AI miễn phí, không ghi trải bài.
import { spawnSync } from 'node:child_process';
import { deployBranchErrorFor } from './deploy-guard.mjs';
import { previewExitCode, runDeploy } from './deploy-lib.mjs';

const { url, results } = await runDeploy({
  prod: false,
  argv: process.argv.slice(2),
  branchError: (branch, argv) => deployBranchErrorFor('preview', branch, argv),
});
console.log('\nPreview: ' + url);
const code = previewExitCode(results);
if (code === 1) process.exit(1);
if (code === 2) {
  // Không kiểm chứng được gì → mã 2 (khác 0) để không ai tưởng preview đã qua kiểm tra
  console.log('\n!!!!!!!! UNVERIFIED — Deployment Protection is on: preview trả 401/403, KHÔNG kiểm tra được trang/API và KHÔNG chạy smoke-flows. !!!!!!!!');
  console.log('         Tắt Deployment Protection cho Preview, hoặc mở URL trên trình duyệt đã đăng nhập Vercel để thử tay.');
  process.exit(2);
}
if (results.some(r => r.warn)) console.log('⚠ Có cảnh báo ở trên (API env vars not set for Preview) — smoke vẫn chạy, /api được giả lập.');
console.log('… smoke-flows trên preview');
const s = spawnSync(process.execPath, ['scripts/smoke-flows.mjs', url], { stdio: 'inherit' });
process.exit(s.status ?? 1);
