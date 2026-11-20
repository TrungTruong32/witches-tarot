// Chặn deploy Production từ nhánh khác main: deploy-prod.mjs tải cả thư mục làm việc lên Vercel,
// nên deploy nhầm từ nhánh đang chuyển sang React sẽ làm trang chủ trắng.
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
