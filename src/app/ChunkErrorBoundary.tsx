// Chặn lỗi khi một màn hình / hộp thoại tải lười (lazyScreens) không tải được chunk (mất mạng giữa chừng, deploy mới đã
// xoá file cũ…). Không có nó React gỡ cả cây → app trắng trơn. Thay vào đó hiện một dòng báo nhỏ kiểu .status error
// với nút "Thử lại" (dựng lại phần con → lazyScreen tải lại chunk) và "Tải lại trang".
import { Component, type ReactNode } from 'react';
import { useT } from '../i18n/useT';
import { retryLazyScreens } from './lazyScreens';

function ChunkError({ onRetry, floating }: { onRetry: () => void; floating?: boolean }) {
  const { pick } = useT();
  return (
    <div className={'status error chunk-error' + (floating ? ' chunk-error-float' : '')} role="alert">
      <p>{pick({ vi: 'Không tải được phần này của ứng dụng. Kiểm tra kết nối mạng rồi thử lại.', en: 'This part of the app failed to load. Check your connection and try again.' })}</p>
      <button type="button" onClick={onRetry}>{pick({ vi: 'Thử lại', en: 'Try again' })}</button>{' '}
      <button type="button" onClick={() => window.location.reload()}>{pick({ vi: 'Tải lại trang', en: 'Reload page' })}</button>
    </div>
  );
}

interface State {
  failed: boolean;
}

/** `floating`: hộp thoại (nằm ngoài khung trang) → báo lỗi nổi ở đáy màn hình thay vì chèn vào cuối trang. */
export class ChunkErrorBoundary extends Component<{ children: ReactNode; floating?: boolean }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  render(): ReactNode {
    if (this.state.failed) return <ChunkError floating={this.props.floating} onRetry={() => { retryLazyScreens(); this.setState({ failed: false }); }} />;
    return this.props.children;
  }
}
