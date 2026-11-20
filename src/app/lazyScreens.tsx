// Màn hình / hộp thoại không cần cho lần vẽ đầu: tách thành chunk riêng (React.lazy) để bundle chính nhỏ lại.
// Trang mở đầu, Lá bài hôm nay và Tra cứu vẫn nạp sẵn (là trang vào thẳng phổ biến, cần vẽ ngay).
// preloadLazyScreens() được gọi lúc rảnh sau lần vẽ đầu (main.tsx): mọi chunk lười đã nằm trong bộ nhớ trước khi người
// dùng bấm sang màn khác → không thấy khung trống, và tab cũ vẫn chạy được sau khi SW mới xoá cache cũ (xem main.tsx).
import { createElement, lazy, type ComponentType } from 'react';

/** Các màn hình lười đều dùng không có props (YesNo chỉ có props tuỳ chọn cho test). */
export interface LazyScreen {
  (): JSX.Element;
  preload(): Promise<void>;
}

let retryGen = 0;
/** Cho phép mọi màn hình lười đã tải lỗi tải lại ở lần vẽ sau (gọi trước khi dựng lại phần con bị lỗi). */
export function retryLazyScreens(): void {
  retryGen++;
}

/** Như React.lazy, nhưng khi module đã nạp xong (preload) thì vẽ thẳng component — không treo Suspense thêm một nhịp. */
export function lazyScreen(load: () => Promise<ComponentType>): LazyScreen {
  let Loaded: ComponentType | null = null;
  let pending: Promise<void> | null = null;
  const preload = () =>
    (pending ??= load().then(
      c => { Loaded = c; },
      e => { pending = null; throw e; }, // lỗi mạng: lần sau thử lại
    ));
  // React.lazy nhớ luôn lỗi đã gặp → sau retryLazyScreens() (nút "Thử lại" của ChunkErrorBoundary) dựng lazy mới
  // để tải lại thật. Không tự tạo lại ngay khi lỗi: Suspense sẽ vẽ lại và tải lỗi mãi thành vòng lặp.
  const makeLazy = () => lazy(() => preload().then(() => ({ default: Loaded as ComponentType })));
  let Lazy = makeLazy();
  let gen = retryGen;
  const Screen = () => {
    if (!Loaded && gen !== retryGen) {
      gen = retryGen;
      Lazy = makeLazy();
    }
    return createElement(Loaded ?? Lazy);
  };
  Screen.preload = preload;
  return Screen;
}

export const Draw = lazyScreen(() => import('../features/draw/Draw').then(m => m.Draw));
export const Reading = lazyScreen(() => import('../features/reading/Reading').then(m => m.Reading));
export const History = lazyScreen(() => import('../features/history/History').then(m => m.History));
export const YesNo = lazyScreen(() => import('../features/yesno/YesNo').then(m => m.YesNo));
export const Sky = lazyScreen(() => import('../features/sky/Sky').then(m => m.Sky));
export const AiSettings = lazyScreen(() => import('../features/settings/AiSettings').then(m => m.AiSettings));
export const SiteSettings = lazyScreen(() => import('../features/settings/SiteSettings').then(m => m.SiteSettings));

/** Nạp trước mọi chunk lười (song song). Lỗi từng chunk được bỏ qua — lúc vào màn đó sẽ thử tải lại. */
export function preloadLazyScreens(): Promise<void> {
  const all = [Draw, Reading, History, YesNo, Sky, AiSettings, SiteSettings];
  return Promise.allSettled(all.map(s => s.preload())).then(() => undefined);
}
