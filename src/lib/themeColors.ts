// Màu sao/hạt theo theme hiện tại (CSS --star/--spark); trống thì dùng màu mặc định của bản cũ. Dùng chung cho nền và bản đồ sao.
export interface ThemeColors { star: string; spark: string }

export function readColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  return { star: cs.getPropertyValue('--star').trim() || '#e9e3ff', spark: cs.getPropertyValue('--spark').trim() || '#ffe1a8' };
}
