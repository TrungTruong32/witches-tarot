import { describe, expect, it } from 'vitest';
import { skyMapText } from './skyText';

// Chữ của bản đồ sao phải giữ đúng từng ký tự như trước khi tách khỏi engine (…, —, dấu cách cuối tiền tố cấp sáng)
describe('skyMapText', () => {
  it('VI', () => {
    const t = skyMapText(p => p.vi);
    expect(t.info('TP.HCM')).toBe('Sao & chòm sao thật trên bầu trời TP.HCM ngay lúc này. Thiên đỉnh ở giữa, chân trời ở mép. Kéo để xoay, lăn/chụm để phóng to.');
    expect(t).toMatchObject({ fail: 'Không tải được dữ liệu bầu trời — kiểm tra mạng rồi thử lại.', loading: 'Đang tải bầu trời…', unnamed: 'Sao chưa đặt tên', mag: 'Cấp sáng ', solar: 'Hệ Mặt Trời', compass: ['B', 'N', 'Đ', 'T'] });
  });
  it('EN', () => {
    const t = skyMapText(p => p.en);
    expect(t.info('Hà Nội')).toBe('Real stars & constellations above Hà Nội right now. Zenith at centre, horizon at the edge. Drag to rotate, scroll/pinch to zoom.');
    expect(t).toMatchObject({ fail: "Couldn't load the sky data — check your connection and try again.", loading: 'Loading sky…', unnamed: 'Unnamed star', mag: 'Mag ', solar: 'Solar system', compass: ['N', 'S', 'E', 'W'] });
  });
});
