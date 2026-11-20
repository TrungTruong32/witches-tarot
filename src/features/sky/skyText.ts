// Chữ giao diện của bản đồ sao (engines/skyMap không biết ngôn ngữ): Sky.tsx dựng bằng pick theo ngôn ngữ đang chọn.
import type { SkyMapText } from '../../engines/skyMap';

type Pick = (p: { vi: string; en: string }) => string;

// updateSkyInfo của bản cũ: trước + tên nơi + sau
const INFO_PRE = { vi: 'Sao & chòm sao thật trên bầu trời ', en: 'Real stars & constellations above ' };
const INFO_POST = {
  vi: ' ngay lúc này. Thiên đỉnh ở giữa, chân trời ở mép. Kéo để xoay, lăn/chụm để phóng to.',
  en: ' right now. Zenith at centre, horizon at the edge. Drag to rotate, scroll/pinch to zoom.',
};
/** Bản cũ không có chữ này (catch im lặng) — phán quyết. */
const FAIL = { vi: 'Không tải được dữ liệu bầu trời — kiểm tra mạng rồi thử lại.', en: "Couldn't load the sky data — check your connection and try again." };
const LOADING = { vi: 'Đang tải bầu trời…', en: 'Loading sky…' };
const UNNAMED = { vi: 'Sao chưa đặt tên', en: 'Unnamed star' };
const MAG = { vi: 'Cấp sáng ', en: 'Mag ' };
const SOLAR = { vi: 'Hệ Mặt Trời', en: 'Solar system' };
/** Bắc, Nam, Đông, Tây. */
const COMPASS = { vi: 'B N Đ T', en: 'N S E W' };

export function skyMapText(pick: Pick): SkyMapText {
  const pre = pick(INFO_PRE), post = pick(INFO_POST);
  const [n, s, e, w] = pick(COMPASS).split(' ') as [string, string, string, string];
  return {
    info: name => pre + name + post,
    fail: pick(FAIL),
    loading: pick(LOADING),
    unnamed: pick(UNNAMED),
    mag: pick(MAG),
    solar: pick(SOLAR),
    compass: [n, s, e, w],
  };
}
