import { describe, expect, it } from 'vitest';
import { autoPickIndices } from './wheel';

describe('autoPickIndices', () => {
  it('never picks the same card twice (legacy could: 78 cards, 5 picks, r=0.99 then r=0)', () => {
    const seq = [0.99, 0, 0.5, 0.5, 0.5, 0, 0, 0, 0];
    let k = 0;
    const idx = autoPickIndices(78, 5, () => seq[k++ % seq.length]!);
    expect(new Set(idx).size).toBe(5);
  });
  it('distinct and in range for every deck size and count, with extreme rng values', () => {
    for (const N of [12, 22, 56, 78]) for (let n = 1; n <= 12; n++) for (const r of [0, 0.999999]) {
      const idx = autoPickIndices(N, n, () => r);
      expect(new Set(idx).size, `${N}/${n}/${r}`).toBe(n);
      expect(idx.every(i => i >= 0 && i < N)).toBe(true);
    }
  });
});
