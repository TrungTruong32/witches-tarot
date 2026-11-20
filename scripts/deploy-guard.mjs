// Chặn deploy Production từ nhánh khác main: deploy-prod.mjs build ở máy (vercel build --prod) từ thư mục làm việc
// hiện tại rồi tải thư mục làm việc lên cho Vercel build — deploy nhầm nhánh là đưa code chưa merge lên trang thật.
/**
 * @param {string} branch
 * @param {string[]} argv
 * @returns {string | null} thông báo lỗi, hoặc null nếu được phép deploy
 */
export function deployBranchError(branch, argv) {
  if (branch === 'main' || argv.includes('--allow-branch')) return null;
  return `✗ Đang ở nhánh "${branch || '(không rõ)'}" — chỉ deploy Production từ main (hoặc thêm --allow-branch nếu thật sự muốn).`;
}

/**
 * Luật nhánh theo script: prod chỉ từ main (như trên); preview từ nhánh nào cũng được — Preview chính là để thử trước khi merge.
 * @param {'prod' | 'preview'} target
 * @param {string} branch
 * @param {string[]} argv
 * @returns {string | null}
 */
export function deployBranchErrorFor(target, branch, argv) {
  return target === 'preview' ? null : deployBranchError(branch, argv);
}
