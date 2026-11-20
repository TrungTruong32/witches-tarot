import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { altAz, celestialBodies, julianDay, localSiderealDeg, skyProject } from './astro';

type Legacy = { celestialBodies(jd: number): unknown };
// sind khai báo chung dòng với cosd/atan2d nên chỉ nêu sind; `const rev` trùng tên ở L2184 (harness lấy cái đầu) nên truyền rev (bản sao nguyên văn L5025) qua globals
const { fns: L } = loadLegacyWithContext<Legacy>(['RD', 'sind', 'eclToEq', 'eccAnom', 'celestialBodies'], { rev: (x: number) => ((x % 360) + 360) % 360 });

const DATES = [new Date(Date.UTC(2000, 0, 1, 12)), new Date(Date.UTC(2026, 10, 20, 3, 30)), new Date(Date.UTC(2035, 5, 21, 23, 59))];

describe('astro', () => {
  it('julianDay = legacy Date.now()/86400000 + 2440587.5', () => {
    for (const d of DATES) expect(julianDay(d)).toBe(d.getTime() / 86400000 + 2440587.5);
  });
  it('celestialBodies deep-equals legacy at 3 dates', () => {
    for (const d of DATES) {
      const jd = julianDay(d);
      const got = celestialBodies(jd);
      expect(got).toHaveLength(7);
      expect(got).toEqual(L.celestialBodies(jd));
    }
  });
  it('altAz / localSiderealDeg / skyProject reproduce legacy skyvCompute proj', () => {
    const stars: [number, number][] = [[0.4, -77.07], [101.29, -16.72], [213.9, 19.18], [279.23, 38.78], [88.79, 7.41]];
    for (const [lat, lon] of [[10.82, 106.63], [21.03, 105.85]] as const) {
      for (const date of DATES) {
        const jd = date.getTime() / 86400000 + 2440587.5, D = jd - 2451545.0;
        let gmst = (280.46061837 + 360.98564736629 * D) % 360; if (gmst < 0) gmst += 360;
        let lst = (gmst + lon) % 360; if (lst < 0) lst += 360;
        expect(localSiderealDeg(jd, lon)).toBe(lst);
        const rad = Math.PI / 180, phi = lat * rad, sinP = Math.sin(phi), cosP = Math.cos(phi);
        const R = 0.46 * 600 * 1.7, cx = 300, cy = 350;
        for (const [ra, dec] of stars) {
          const Hh = (lst - ra) * rad, d = dec * rad, sinD = Math.sin(d), cosD = Math.cos(d), cosH = Math.cos(Hh), sinH = Math.sin(Hh);
          const sinAlt = Math.max(-1, Math.min(1, sinP * sinD + cosP * cosD * cosH)), alt = Math.asin(sinAlt);
          const az = Math.atan2(sinH * cosD, cosH * sinP * cosD - sinD * cosP);
          expect(altAz(ra, dec, lat, lst)).toEqual({ alt, az });
          const r = (1 - alt / (Math.PI / 2)) * R;
          expect(skyProject(ra, dec, lat, lst, R, cx, cy)).toEqual(alt <= 0 ? null : { x: cx + r * Math.sin(az), y: cy + r * Math.cos(az) });
        }
      }
    }
  });
});
