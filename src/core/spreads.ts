// Các kiểu trải bài: tên, gợi ý dùng, vai trò từng vị trí (VI/EN) và sơ đồ đặt lá.
// Dữ liệu chép NGUYÊN VĂN từ bản cũ (test so khớp với witches_tarot.html).
import type { Lang } from './types';

/** [tên VI, tên EN, mô tả VI, mô tả EN] */
export type SpreadPosition = [string, string, string, string];
export interface SpreadDef {
  k: string;
  vi: string;
  en: string;
  use?: [string, string];
  pos: SpreadPosition[] | null;
}
/** [x, y, xoay 90°?] — đơn vị: chiều rộng lá = 1, chiều cao lá = CARD_H */
export type LayoutSlot = [number, number] | [number, number, number];

export const SPREADS: readonly SpreadDef[] = [
  { k: 'free', vi: 'Tự do (số lá tuỳ ý)', en: 'Free (any number of cards)', pos: null },
  { k: 'one', vi: '1 lá — Thông điệp', en: '1 card — Message', use: ['Câu hỏi nhanh, thông điệp trong ngày.', 'Quick question or message of the day.'], pos: [
    ['Thông điệp', 'Message', 'điều quan trọng nhất cần biết lúc này', 'the most important thing to know right now']] },
  { k: 'ppf', vi: '3 lá — Quá khứ · Hiện tại · Tương lai', en: '3 cards — Past · Present · Future', use: ['Xem diễn tiến của một chuyện theo thời gian.', 'See how a matter unfolds over time.'], pos: [
    ['Quá khứ', 'Past', 'gốc rễ, điều đã dẫn tới tình huống', 'roots — what led to the situation'],
    ['Hiện tại', 'Present', 'năng lượng đang chi phối lúc này', 'the energy at play right now'],
    ['Tương lai', 'Future', 'hướng đi nếu giữ nguyên quỹ đạo', 'where things head if nothing changes']] },
  { k: 'sao', vi: '3 lá — Tình huống · Hành động · Kết quả', en: '3 cards — Situation · Action · Outcome', use: ['Khi cần biết nên làm gì.', 'When you need to know what to do.'], pos: [
    ['Tình huống', 'Situation', 'bức tranh thực tế hiện nay', 'the actual picture today'],
    ['Hành động', 'Action', 'việc nên làm / thái độ nên chọn', 'the action or attitude to take'],
    ['Kết quả', 'Outcome', 'điều có thể đến nếu hành động như vậy', 'the likely result of that action']] },
  { k: 'mbs', vi: '3 lá — Tâm trí · Thể chất · Tinh thần', en: '3 cards — Mind · Body · Spirit', use: ['Tự soi chiếu, cân bằng bản thân.', 'Self-check and balance.'], pos: [
    ['Tâm trí', 'Mind', 'suy nghĩ, niềm tin, điều đang bận lòng', 'thoughts, beliefs, mental load'],
    ['Thể chất', 'Body', 'sức khoẻ, vật chất, đời sống hằng ngày', 'health, material and daily life'],
    ['Tinh thần', 'Spirit', 'trực giác, ý nghĩa, kết nối nội tâm', 'intuition, meaning, inner connection']] },
  { k: 'moon', vi: '4 lá — Trăng mới (gieo ý định)', en: '4 cards — New Moon intentions', use: ['Đặt ý định cho chu kỳ trăng mới.', 'Set intentions for a new lunar cycle.'], pos: [
    ['Điều cần gieo', 'What to plant', 'ý định nên khởi đầu trong chu kỳ này', 'the intention to start this cycle'],
    ['Điều cần buông', 'What to release', 'thói quen / nỗi sợ nên để lại phía sau', 'the habit or fear to leave behind'],
    ['Nguồn lực', 'Resources', 'sức mạnh, sự hỗ trợ bạn đang có', 'the strengths and support you have'],
    ['Bước đầu tiên', 'First step', 'hành động cụ thể để bắt đầu', 'a concrete action to begin']] },
  { k: 'sac', vi: '5 lá — Tình huống · Thử thách · Lời khuyên · Nền tảng · Kết quả', en: '5 cards — Situation · Challenge · Advice · Foundation · Outcome', use: ['Phân tích một vấn đề cụ thể.', 'Analyse a specific problem.'], pos: [
    ['Tình huống', 'Situation', 'bối cảnh hiện tại', 'the current context'],
    ['Thử thách', 'Challenge', 'trở ngại chính', 'the main obstacle'],
    ['Lời khuyên', 'Advice', 'cách xử lý được gợi ý', 'the suggested approach'],
    ['Nền tảng', 'Foundation', 'nguyên nhân sâu xa / điều nằm bên dưới', 'the underlying cause'],
    ['Kết quả', 'Outcome', 'kết cục khả dĩ', 'the likely outcome']] },
  { k: 'love', vi: '5 lá — Mối quan hệ', en: '5 cards — Relationship', use: ['Tình cảm, hôn nhân, quan hệ đối tác.', 'Love, marriage or any partnership.'], pos: [
    ['Bạn', 'You', 'bạn đang cảm nhận và đóng góp gì', 'what you feel and bring'],
    ['Người ấy', 'The other', 'người kia đang cảm nhận và đóng góp gì', 'what the other person feels and brings'],
    ['Mối liên kết', 'The bond', 'bản chất sợi dây giữa hai người', 'the nature of the connection'],
    ['Thử thách', 'Challenge', 'điều đang gây cản trở', 'what is getting in the way'],
    ['Tiềm năng', 'Potential', 'mối quan hệ có thể phát triển ra sao', 'where the relationship can go']] },
  { k: 'choice', vi: '5 lá — Hai lựa chọn', en: '5 cards — Two choices', use: ['Phân vân giữa hai hướng đi (ghi rõ A và B trong câu hỏi).', 'Torn between two paths (name A and B in your question).'], pos: [
    ['Hiện trạng', 'Where you stand', 'bạn đang đứng ở đâu trước lựa chọn', 'where you stand before choosing'],
    ['Lựa chọn A', 'Choice A', 'bản chất / trải nghiệm khi chọn A', 'what choosing A is like'],
    ['Kết quả A', 'Outcome A', 'hệ quả nếu chọn A', 'the consequence of A'],
    ['Lựa chọn B', 'Choice B', 'bản chất / trải nghiệm khi chọn B', 'what choosing B is like'],
    ['Kết quả B', 'Outcome B', 'hệ quả nếu chọn B', 'the consequence of B']] },
  { k: 'career', vi: '5 lá — Công việc & sự nghiệp', en: '5 cards — Work & career', use: ['Công việc, dự án, định hướng nghề.', 'Job, projects, career direction.'], pos: [
    ['Hiện trạng', 'Current state', 'tình hình công việc hiện tại', 'your work situation now'],
    ['Điểm mạnh', 'Strengths', 'lợi thế nên phát huy', 'advantages to build on'],
    ['Trở ngại', 'Obstacles', 'điều đang kìm hãm', 'what is holding you back'],
    ['Hành động', 'Action', 'việc nên làm tiếp theo', 'the next move to make'],
    ['Triển vọng', 'Prospects', 'hướng phát triển sắp tới', 'what lies ahead']] },
  { k: 'horseshoe', vi: '7 lá — Móng ngựa', en: '7 cards — Horseshoe', use: ['Tổng quan một tình huống phức tạp.', 'Overview of a complex situation.'], pos: [
    ['Quá khứ', 'Past', 'điều đã qua còn ảnh hưởng', 'past influences still at work'],
    ['Hiện tại', 'Present', 'tình hình ngay lúc này', 'the situation right now'],
    ['Ẩn tàng', 'Hidden influences', 'yếu tố bạn chưa thấy rõ', 'factors you cannot see yet'],
    ['Trở ngại', 'Obstacles', 'khó khăn cần vượt qua', 'difficulties to overcome'],
    ['Môi trường', 'Environment', 'người xung quanh, hoàn cảnh bên ngoài', 'people and circumstances around you'],
    ['Lời khuyên', 'Advice', 'cách hành xử tốt nhất', 'the best way to act'],
    ['Kết quả', 'Outcome', 'kết cục khả dĩ', 'the likely outcome']] },
  { k: 'celtic', vi: 'Celtic Cross — 10 lá', en: 'Celtic Cross — 10 cards', use: ['Đọc sâu, toàn diện một vấn đề lớn.', 'Deep, comprehensive reading of a big issue.'], pos: [
    ['Hiện tại', 'Present', 'trung tâm của vấn đề', 'the heart of the matter'],
    ['Thử thách', 'Challenge', 'lực cắt ngang, cản trở trực tiếp', 'what crosses you directly'],
    ['Nền tảng', 'Foundation', 'gốc rễ tiềm thức', 'the subconscious root'],
    ['Quá khứ gần', 'Recent past', 'điều vừa đi qua', 'what is passing away'],
    ['Mục tiêu / ý thức', 'Goal / conscious', 'điều bạn nhắm tới, nghĩ tới', 'what you aim for consciously'],
    ['Tương lai gần', 'Near future', 'điều sắp đến', 'what is coming soon'],
    ['Bản thân', 'Self', 'thái độ, vị thế của bạn', 'your attitude and stance'],
    ['Môi trường / người khác', 'Environment / others', 'tác động từ bên ngoài', 'outside influences'],
    ['Hy vọng & nỗi sợ', 'Hopes & fears', 'điều bạn mong và lo', 'what you hope for and fear'],
    ['Kết quả', 'Outcome', 'kết cục nếu giữ hướng hiện tại', 'the outcome on the current path']] },
  { k: 'year', vi: '12 lá — Năm tới (12 tháng)', en: '12 cards — Year ahead (12 months)', use: ['Năng lượng từng tháng trong 12 tháng tới, tính từ tháng này.', 'The energy of each of the next 12 months, starting now.'],
    pos: Array.from({ length: 12 }, (_, i) => ['Tháng ' + (i + 1), 'Month ' + (i + 1), 'năng lượng chủ đạo của tháng thứ ' + (i + 1) + ' tính từ nay', 'the main energy of month ' + (i + 1) + ' from now']) }
];

/** Chiều cao lá theo đơn vị chiều rộng lá. */
export const CARD_H = 1.75;
const ROW3: LayoutSlot[] = [[-1.2, 0], [0, 0], [1.2, 0]];
export const SPREAD_LAYOUT: Record<string, LayoutSlot[]> = {
  one: [[0, 0]], ppf: ROW3, sao: ROW3, mbs: ROW3,
  moon: [[0, -1], [-1.2, 0], [1.2, 0], [0, 1]],
  sac: [[0, 0], [-1.2, 0], [1.2, 0], [0, 1.95], [0, -1.95]],
  love: [[-1.2, -1], [1.2, -1], [0, 0], [-1.2, 1], [1.2, 1]],
  choice: [[0, 1], [-1.2, 0], [-2.4, -1], [1.2, 0], [2.4, -1]],
  career: [[-2.4, .8], [-1.2, .4], [0, 0], [1.2, -.4], [2.4, -.8]],
  horseshoe: Array.from({ length: 7 }, (_, i) => [(i - 3) * 1.2, (3 - Math.abs(i - 3)) * .5]),
  celtic: [[0, 0], [0, 0, 1], [0, 2], [-1.6, 0], [0, -2], [1.6, 0], [3.3, 2.85], [3.3, .95], [3.3, -.95], [3.3, -2.85]],
  year: Array.from({ length: 12 }, (_, i) => { const a = (i * 30 - 90) * Math.PI / 180; return [+(3.6 * Math.cos(a)).toFixed(3), +(3.6 * Math.sin(a)).toFixed(3)]; })
};

const BY_KEY: Record<string, SpreadDef> = Object.fromEntries(SPREADS.map(s => [s.k, s]));

export function spreadByKey(k: string): SpreadDef | undefined {
  return BY_KEY[k];
}

/** Tên các vị trí theo ngôn ngữ; null nếu kiểu trải không có vị trí (tự do) hoặc không tồn tại. */
export function defsFor(k: string, lang: Lang): string[] | null {
  const s = BY_KEY[k];
  return s?.pos ? s.pos.map(p => (lang === 'en' ? p[1] : p[0])) : null;
}

/** Mô tả vai trò của vị trí i. */
export function posDesc(k: string, i: number, lang: Lang): string {
  const p = BY_KEY[k]?.pos?.[i];
  return p ? (lang === 'en' ? p[3] : p[2]) : '';
}
