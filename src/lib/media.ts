// Truy vấn media an toàn: trình duyệt cũ / môi trường test không có matchMedia thì coi như không khớp.
export function media(query: string): Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'> {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') return window.matchMedia(query);
  return { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
}

/** Người dùng bật "giảm chuyển động" trong hệ điều hành. */
export const prefersReducedMotion = () => media('(prefers-reduced-motion: reduce)').matches;
