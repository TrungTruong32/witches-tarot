import { SPRITE } from './svgMarkup';

/** Sprite icon (`<symbol id="i-…">`) dùng chung cho mọi `<Icon>`. Đặt một lần ở gốc app. */
export function IconSprite() {
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: SPRITE }} />;
}
