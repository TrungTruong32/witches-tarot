#!/usr/bin/env node
// Deploy bản đang commit (HEAD) lên Vercel Preview (Vercel build trên máy chủ), kiểm tra, rồi chạy smoke-flows trên URL preview.
//   node scripts/deploy-preview.mjs
// Được chạy từ nhánh bất kỳ (Preview là để thử trước khi merge). Từ chối nếu còn thay đổi chưa commit.
//   node scripts/deploy-preview.mjs --check <url>   → chỉ kiểm tra + smoke bản preview đã có
// Mã thoát: 0 = ổn; 1 = có bước hỏng; 2 = UNVERIFIED (Deployment Protection chặn 401/403, không kiểm tra được gì).
// /api/readings, /api/ai trả 503 trên Preview (chưa đặt biến môi trường cho Preview) chỉ là cảnh báo, smoke vẫn chạy.
// smoke-flows vẫn giả lập /api/ai + /api/readings → không tốn lượt AI miễn phí, không ghi trải bài.
import { spawnSync } from 'node:child_process';
import { deployBranchErrorFor } from './deploy-guard.mjs';
import { checkDeployment, loadEnv, previewExitCode, runDeploy } from './deploy-lib.mjs';

// --check <url>: chỉ kiểm tra + smoke một bản preview đã có (không deploy lại)
const argv = process.argv.slice(2);
const ci = argv.indexOf('--check');
const env = loadEnv();
const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
let url, results;
if (ci >= 0) {
  url = (argv[ci + 1] || '').replace(/\/+$/, '');
  if (!/^https:\/\/[\w.-]+\.vercel\.app$/.test(url)) { console.error('✗ --check cần URL https://<...>.vercel.app'); process.exit(1); }
  results = await checkDeployment(url, null, fetch, { preview: true, bypass });
  for (const r of results) console.log(r.msg);
} else {
  ({ url, results } = await runDeploy({
    prod: false,
    argv,
    branchError: (branch, a) => deployBranchErrorFor('preview', branch, a),
  }));
}
console.log('\nPreview: ' + url);
const code = previewExitCode(results);
if (code === 1) process.exit(1);
if (code === 2) {
  // Không kiểm chứng được gì → mã 2 (khác 0) để không ai tưởng preview đã qua kiểm tra
  console.log('\n!!!!!!!! UNVERIFIED — Deployment Protection is on: preview trả 401/403, KHÔNG kiểm tra được trang/API và KHÔNG chạy smoke-flows. !!!!!!!!');
  console.log('         Cách 1: Vercel → Settings → Deployment Protection → "Protection Bypass for Automation" → tạo secret,');
  console.log('                 thêm VERCEL_AUTOMATION_BYPASS_SECRET=<secret> vào .env, rồi chạy: node scripts/deploy-preview.mjs --check ' + url);
  console.log('         Cách 2: tắt Deployment Protection cho Preview. Cách 3: mở URL trên trình duyệt đã đăng nhập Vercel để thử tay.');
  process.exit(2);
}
if (results.some(r => r.warn)) console.log('⚠ Có cảnh báo ở trên (API env vars not set for Preview) — smoke vẫn chạy, /api được giả lập.');
console.log('… smoke-flows trên preview');
// secret bypass đi qua biến môi trường (không lên dòng lệnh)
const s = spawnSync(process.execPath, ['scripts/smoke-flows.mjs', url], { stdio: 'inherit', env: { ...process.env, VERCEL_PROTECTION_BYPASS: bypass } });
process.exit(s.status ?? 1);
