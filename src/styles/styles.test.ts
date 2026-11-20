// @vitest-environment node
// Bản HTML cũ đã nghỉ hưu → bỏ ràng buộc "ghép lại khớp từng byte với CSS cũ" để chỉnh giao diện được.
// Giữ một kiểm tra nhẹ: mọi file CSS mà index.ts nạp đều tồn tại và không rỗng.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(here, 'index.ts'), 'utf8');
const files = [...index.matchAll(/^import '\.\/([\w-]+\.css)';$/gm)].map(m => m[1]!);

describe('app CSS files', () => {
  it('index.ts imports at least the token sheet first', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toBe('tokens.css');
  });

  it('every file listed in index.ts exists and is non-empty', () => {
    for (const f of files) {
      expect(existsSync(join(here, f)), f).toBe(true);
      expect(readFileSync(join(here, f), 'utf8').trim().length, f).toBeGreaterThan(0);
    }
  });
});
