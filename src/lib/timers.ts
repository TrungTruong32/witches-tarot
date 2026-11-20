// Sổ hẹn giờ: mọi setTimeout đăng ký qua later() được xoá hết bằng clear() — không còn hẹn giờ mồ côi khi huỷ lượt / gỡ màn.

export interface Timers {
  /** setTimeout tự bỏ khỏi sổ khi chạy. */
  later(fn: () => void, ms: number): void;
  /** Huỷ mọi hẹn giờ còn chờ. Gọi bao nhiêu lần cũng được; sau đó later() vẫn dùng tiếp được. */
  clear(): void;
}

export function createTimers(): Timers {
  const ids = new Set<ReturnType<typeof setTimeout>>();
  return {
    later(fn, ms) {
      const id = setTimeout(() => {
        ids.delete(id);
        fn();
      }, ms);
      ids.add(id);
    },
    clear() {
      ids.forEach(clearTimeout);
      ids.clear();
    },
  };
}
