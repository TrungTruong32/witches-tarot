#!/usr/bin/env node
// Deploy bản đang commit (HEAD) lên Vercel Production theo kiểu prebuilt:
//   npm run check → vercel build --prod (build ở máy, có dữ liệu bài) → vercel deploy --prebuilt --prod → kiểm tra bản thật.
//   node scripts/deploy-prod.mjs [--allow-branch]
// Dùng VERCEL_TOKEN trong .env (không in ra). Từ chối nếu còn thay đổi chưa commit hoặc không ở nhánh main.
import { deployBranchErrorFor } from './deploy-guard.mjs';
import { runDeploy } from './deploy-lib.mjs';

const { results } = await runDeploy({
  prod: true,
  argv: process.argv.slice(2),
  branchError: (branch, argv) => deployBranchErrorFor('prod', branch, argv),
});
if (results.some(r => !r.ok)) process.exit(1);
