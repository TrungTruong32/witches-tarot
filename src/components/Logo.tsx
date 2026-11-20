import { LOGO_H, LOGO_L } from './svgMarkup';

/** Logo trăng khuyết: 'L' = lớn ở trang mở đầu, 'H' = ở đầu trang app (mỗi bản có id gradient riêng). */
export function Logo({ variant }: { variant: 'L' | 'H' }) {
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: variant === 'L' ? LOGO_L : LOGO_H }} />;
}
