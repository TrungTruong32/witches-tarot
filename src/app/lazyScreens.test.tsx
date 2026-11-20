import { act, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { lazyScreen } from './lazyScreens';

const Hello = () => <p>xin chào</p>;

describe('lazyScreen', () => {
  it('đã preload → vẽ ngay, không qua fallback của Suspense', async () => {
    const load = vi.fn(async () => Hello);
    const S = lazyScreen(load);
    await S.preload();
    render(<Suspense fallback={<i>đang tải</i>}><S /></Suspense>);
    expect(screen.getByText('xin chào')).toBeTruthy();
    expect(screen.queryByText('đang tải')).toBeNull();
    await S.preload();
    expect(load).toHaveBeenCalledTimes(1); // nạp một lần
  });

  it('chưa preload → fallback rồi tới màn hình', async () => {
    const S = lazyScreen(async () => Hello);
    render(<Suspense fallback={<i>đang tải</i>}><S /></Suspense>);
    expect(screen.getByText('đang tải')).toBeTruthy();
    expect(await screen.findByText('xin chào')).toBeTruthy();
  });

  it('tải lỗi → lần preload sau thử lại', async () => {
    const load = vi.fn<() => Promise<typeof Hello>>().mockRejectedValueOnce(new Error('mạng')).mockResolvedValue(Hello);
    const S = lazyScreen(load);
    await expect(S.preload()).rejects.toThrow('mạng');
    await act(() => S.preload());
    expect(load).toHaveBeenCalledTimes(2);
    render(<S />);
    expect(screen.getByText('xin chào')).toBeTruthy();
  });
});
