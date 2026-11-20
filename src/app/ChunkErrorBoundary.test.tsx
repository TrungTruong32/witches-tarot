import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChunkErrorBoundary } from './ChunkErrorBoundary';
import { lazyScreen } from './lazyScreens';
import { useApp } from './store';

const Hello = () => <p>xin chào</p>;
const mount = (S: () => JSX.Element) =>
  render(<ChunkErrorBoundary><Suspense fallback={<i>đang tải</i>}><S /></Suspense></ChunkErrorBoundary>);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); // React + boundary ghi lỗi ra console
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => useApp.setState({ lang: 'vi' }));
});

describe('ChunkErrorBoundary (chunk tải lười bị lỗi)', () => {
  it('chunk lỗi → báo lỗi + "Thử lại"; bấm thử lại thì tải lại chunk và hiện màn hình', async () => {
    const load = vi.fn<() => Promise<typeof Hello>>().mockRejectedValueOnce(new Error('mạng')).mockResolvedValue(Hello);
    mount(lazyScreen(load));
    const alert = await screen.findByRole('alert');
    expect(alert.className).toContain('status error');
    expect(alert.textContent).toContain('Không tải được phần này của ứng dụng');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('xin chào')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('giao diện tiếng Anh → chữ tiếng Anh; nút "Reload page" tải lại trang', async () => {
    act(() => useApp.setState({ lang: 'en' }));
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    try {
      mount(lazyScreen(() => Promise.reject(new Error('mạng'))));
      expect((await screen.findByRole('alert')).textContent).toContain('This part of the app failed to load');
      await userEvent.click(screen.getByRole('button', { name: 'Reload page' }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('floating (hộp thoại) → thêm lớp chunk-error-float', async () => {
    render(<ChunkErrorBoundary floating><Suspense fallback={null}>{(() => { const S = lazyScreen(() => Promise.reject(new Error('x'))); return <S />; })()}</Suspense></ChunkErrorBoundary>);
    expect((await screen.findByRole('alert')).className).toContain('chunk-error-float');
  });
});
