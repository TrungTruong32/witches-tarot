#!/usr/bin/env node
// Deploy bản đang commit (HEAD) lên Vercel Preview (prebuilt), kiểm tra, rồi chạy smoke-flows trên URL preview.
//   node scripts/deploy-preview.mjs
// Được chạy từ nhánh bất kỳ (Preview là để thử trước khi merge). Từ chối nếu còn thay đổi chưa commit.
// smoke-flows vẫn giả lập /api/ai + /api/readings → không tốn lượt AI miễn phí, không ghi trải bài.
import { spawnSync } from 'node:child_process';
import { deployBranchErrorFor } from './deploy-guard.mjs';
import { runDeploy } from './deploy-lib.mjs';

const { url, results } = await runDeploy({
  prod: false,
  argv: process.argv.slice(2),
  branchError: (branch, argv) => deployBranchErrorFor('preview', branch, argv),
});
console.log('\nPreview: ' + url);
if (results.some(r => !r.ok)) process.exit(1);
if (results[0]?.protected) {
  console.log('• Bỏ qua smoke-flows: preview đang bật Deployment Protection (mở URL trên trình duyệt đã đăng nhập Vercel để thử tay).');
  process.exit(0);
}
console.log('… smoke-flows trên preview');
const s = spawnSync(process.execPath, ['scripts/smoke-flows.mjs', url], { stdio: 'inherit' });
process.exit(s.status ?? 1);
