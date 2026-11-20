// Chạy trước mọi file test.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Không bật "globals" của vitest → Testing Library không tự dọn DOM giữa các test; dọn ở đây.
afterEach(() => cleanup());

// jsdom chưa có các API cuộn → thay bằng hàm rỗng (chỉ trong môi trường có window).
if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  Element.prototype.scrollBy = function scrollBy() {};
}

// jsdom không có canvas 2D (in lỗi "Not implemented" mỗi lần gọi) → trả null im lặng; test cần ctx thì tự spyOn.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
