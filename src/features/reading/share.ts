// Chia sẻ trải bài: link `#r=...` (shareReadingLink L4056), ảnh PNG (exportReadingImage L3857–4004),
// mở lại một lời giải đã có (loadReading L4314 — dùng cho link chia sẻ và màn Lịch sử) và mở link khi vào màn (loadSharedFromHash L4072).
import { useApp } from '../../app/store';
import { dailyKey } from '../../core/daily';
import { makeUid } from '../../core/draw';
import { moonPhase } from '../../core/moon';
import { sanitizeShared, type SharedReading } from '../../core/safeShare';
import { buildShareData, decodeShare, encodeShare } from '../../core/share';
import { defsFor, spreadByKey } from '../../core/spreads';
import type { Reading, SpreadCard } from '../../core/types';
import { showLoadedAnswer, useInterpret } from './interpret';
import { useReading } from './readingStore';

/** Bản ghi mở lại được: bản ghi nhật ký đầy đủ, hoặc trải bài dựng từ link chia sẻ (không id). */
export type LoadableReading = Pick<Reading, 'question' | 'deck' | 'text' | 'cards'> & Partial<Pick<Reading, 'id' | 'spread'>>;

const touchDevice = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

/**
 * loadReading (L4314): nạp câu hỏi, lá (uid mới), bộ bài (nếu cả trải bài dùng đúng một bộ đang có), kiểu trải,
 * lời giải; bỏ hội thoại hỏi-tiếp cũ; gắn bản ghi (có id) để ghi chú tiếp; cuộn lên đầu. Nơi gọi tự chuyển sang /trai-bai.
 */
export function loadReading(it: LoadableReading): void {
  const r = useReading.getState();
  r.setQuestion(it.question || '');
  const cards = (it.cards || []).map(c => ({ ...c, uid: makeUid() }) as SpreadCard);
  const app = useApp.getState();
  if (it.deck && !it.deck.includes(',') && app.decks.includes(it.deck)) app.setDeck(it.deck);
  // Bản ghi cũ không có kiểu trải → giữ nguyên kiểu đang chọn (như bản cũ)
  if (it.spread && spreadByKey(it.spread)) r.setSpreadKey(it.spread);
  r.setCards(cards, 'none');
  // showLoadedAnswer: hiện lời giải + nút chia sẻ, aiBg 'done' khi có chữ và có lá, bỏ hội thoại cũ, gắn bản ghi
  showLoadedAnswer(it.text || '', it.id != null ? (it as Reading) : null);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Trải bài đã làm sạch từ link → dạng loadReading nhận. */
export function sharedToLoadable(s: SharedReading): LoadableReading {
  return { question: s.question, deck: s.deck, text: s.text, spread: s.spreadKey, cards: s.cards };
}

// Mỗi giá trị hash chỉ nạp một lần trong cả phiên (bản cũ chỉ đọc hash lúc khởi động): rời màn rồi quay lại
// (hoặc StrictMode gắn lại) không nạp đè lên trải bài người dùng đã đổi.
const handledHashes = new Set<string>();
/** Chỉ dùng trong test. */
export function __resetSharedHash(): void {
  handledHashes.clear();
}

/**
 * loadSharedFromHash (L4072): `#r=...` → decodeShare → sanitizeShared → loadReading, rồi hiện ghi chú "chia sẻ qua link".
 * Link hỏng: im lặng (false). Hash giữ nguyên như bản cũ. Gọi khi DB đã sẵn sàng.
 */
export async function loadSharedHash(hash: string): Promise<boolean> {
  if (hash.indexOf('#r=') !== 0 || handledHashes.has(hash)) return false;
  handledHashes.add(hash); // đánh dấu trước khi await → không nạp hai lần
  const db = useApp.getState().db;
  if (!db) return false;
  const data = await decodeShare(hash.slice(3));
  if (!data) return false;
  const shared = sanitizeShared(data, id => db.byId(id));
  if (!shared) return false;
  loadReading(sharedToLoadable(shared));
  // Nội dung trong link do người gửi tạo (có thể đã bị sửa) → ghi rõ để không bị lợi dụng lừa đảo
  useInterpret.setState({ sharedNote: true });
  return true;
}

export type ShareLinkResult = 'none' | 'shared' | 'copied' | 'prompted';

/** shareReadingLink (L4056): điện thoại → hộp chia sẻ; máy tính → chép link; không chép được → prompt(). Chữ nút do nơi gọi đổi. */
export async function shareReadingLink(): Promise<ShareLinkResult> {
  const s = useReading.getState();
  if (!s.cards.length) return 'none';
  const code = await encodeShare(
    buildShareData({ question: s.question, fallbackDeck: useApp.getState().deck, spreadKey: s.spreadKey, answer: s.answer, cards: s.cards }),
  );
  // Đường dẫn gốc: bản cũ mở link ở trang chủ; bản mới chuyển /#r= sang /trai-bai#r=
  const url = location.origin + '/#r=' + code;
  if (touchDevice() && navigator.share) {
    try {
      await navigator.share({ title: 'Witches Tarot', text: 'Trải bài Tarot của tôi', url });
      return 'shared';
    } catch {
      /* huỷ chia sẻ → chép link */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    prompt('Sao chép link chia sẻ:', url);
    return 'prompted';
  }
}

// ===== Xuất ảnh trải bài để chia sẻ =====

/** Ảnh tarot.vn không có CORS → đi qua proxy same-origin để canvas không bị "taint"; host khác: vẽ ô giữ chỗ. */
export function proxiedImg(url: string | null | undefined): string | null {
  try {
    const h = new URL(String(url)).hostname;
    if (h === 'tarot.vn' || h === 'www.tarot.vn') return '/api/img?u=' + encodeURIComponent(String(url));
  } catch {
    /* không phải URL */
  }
  return null;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    if (line) out.push(line);
  }
  return out;
}

// Font hệ thống có sẵn glyph tiếng Việt precomposed (Georgia trên canvas làm rớt dấu)
const FONT = "Arial, 'Segoe UI', 'Helvetica Neue', sans-serif";
const nfc = (s: unknown) => String(s == null ? '' : s).normalize('NFC'); // ghép dấu về 1 mã ký tự
function fitText(cx: CanvasRenderingContext2D, text: string, maxW: number): string {
  text = nfc(text);
  if (cx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && cx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** Vẽ toàn bộ ảnh PNG (canvas ngoài DOM) rồi chia sẻ (điện thoại) hoặc tải về. Lỗi → alert(). Nút "⏳ Đang tạo…" do nơi gọi đổi. */
export async function exportReadingImage(): Promise<void> {
  try {
    const st = useReading.getState();
    const spread = st.cards;
    const spreadPositions = defsFor(st.spreadKey, useApp.getState().lang);
    const W = 1080;
    const PAD = 64;
    const question = nfc((st.question || '').trim());
    const answer = nfc((st.answer || document.getElementById('aiOutput')?.textContent || '').replace(/\*\*/g, '').trim());
    const m = moonPhase(new Date());
    // Nạp trước ảnh các lá (qua proxy)
    const imgs = await Promise.all(spread.map(c => {
      const p = proxiedImg(c.image_url);
      return p ? loadImg(p) : Promise.resolve(null);
    }));

    // Bố cục thẻ bài: tối đa 5 lá/hàng
    const perRow = Math.min(spread.length, 5) || 1;
    const gap = 22;
    const cardW = Math.floor((W - PAD * 2 - gap * (perRow - 1)) / perRow);
    const cardH = Math.round((cardW * 525) / 300);
    const rows = Math.ceil(spread.length / perRow);
    const labelH = 56; // nhãn 2 dòng: vị trí + tên lá

    // Đo chiều cao phần chữ (dùng canvas tạm để measure)
    const meas = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    meas.font = '30px ' + FONT;
    const ansLines = answer ? wrapText(meas, answer, W - PAD * 2) : [];
    meas.font = 'bold 40px ' + FONT;
    const qLines = question ? wrapText(meas, '“' + question + '”', W - PAD * 2) : [];

    let y = PAD;
    const headerH = 150;
    const H = headerH + qLines.length * 52 + 30
      + rows * (cardH + labelH + gap) + 24
      + (ansLines.length ? 60 + ansLines.length * 42 : 0)
      + PAD + 40;

    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    // Nền huyền ảo
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#241d3b');
    bg.addColorStop(0.55, '#1b1730');
    bg.addColorStop(1, '#241a30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Sao lấp lánh
    ctx.fillStyle = 'rgba(233,227,255,.5)';
    for (let i = 0; i < 90; i++) {
      const rx = (i * 977) % W;
      const ry = (i * 613) % H;
      const rr = (i % 3) * 0.6 + 0.5;
      ctx.globalAlpha = 0.2 + (i % 5) / 8;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Header
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffe1a8';
    ctx.font = 'bold 52px ' + FONT;
    ctx.fillText('✦︎ Witches Tarot', PAD, y);
    ctx.fillStyle = '#c8c2d8';
    ctx.font = '28px ' + FONT;
    ctx.fillText(nfc(m.e + '  ' + m.n + ' · ' + m.illum + '% sáng'), PAD, y + 66);
    ctx.fillStyle = '#8f88a8';
    ctx.font = '24px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(dailyKey(), W - PAD, y + 72);
    ctx.textAlign = 'left';
    y += headerH;

    // Câu hỏi
    if (qLines.length) {
      ctx.fillStyle = '#e9e3ff';
      ctx.font = 'bold 40px ' + FONT;
      for (const l of qLines) {
        ctx.fillText(l, PAD, y);
        y += 52;
      }
      y += 30;
    }

    // Các lá bài
    spread.forEach((c, i) => {
      const col = i % perRow;
      const r = Math.floor(i / perRow);
      const x = PAD + col * (cardW + gap);
      const cy = y + r * (cardH + labelH + gap);
      const im = imgs[i];
      ctx.save();
      if (im) {
        if (c.orientation === 'nguoc') {
          ctx.translate(x + cardW / 2, cy + cardH / 2);
          ctx.rotate(Math.PI);
          ctx.drawImage(im, -cardW / 2, -cardH / 2, cardW, cardH);
        } else ctx.drawImage(im, x, cy, cardW, cardH);
      } else {
        ctx.fillStyle = '#2c2542';
        ctx.fillRect(x, cy, cardW, cardH);
        ctx.strokeStyle = 'rgba(255,225,168,.4)';
        ctx.strokeRect(x + 4, cy + 4, cardW - 8, cardH - 8);
        ctx.fillStyle = '#b49bff';
        ctx.font = '40px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('☾︎', x + cardW / 2, cy + cardH / 2 - 20);
        ctx.textAlign = 'left';
      }
      ctx.restore();
      // Nhãn 2 dòng, mỗi dòng cắt vừa bề ngang lá để không đè lá bên cạnh
      const cxc = x + cardW / 2;
      const maxW = cardW - 2;
      ctx.textAlign = 'center';
      const posLbl = spreadPositions && spreadPositions[i] ? i + 1 + '. ' + spreadPositions[i] : 'Lá ' + (i + 1);
      ctx.fillStyle = '#b9b2d0';
      ctx.font = '600 17px ' + FONT;
      ctx.fillText(fitText(ctx, posLbl, maxW), cxc, cy + cardH + 6);
      const nameLbl = c.ten + (c.orientation === 'nguoc' ? ' (ngược)' : '');
      ctx.fillStyle = '#e9e3ff';
      ctx.font = '700 18px ' + FONT;
      ctx.fillText(fitText(ctx, nameLbl, maxW), cxc, cy + cardH + 28);
      ctx.textAlign = 'left';
    });
    y += rows * (cardH + labelH + gap) + 24;

    // Bài giải
    if (ansLines.length) {
      ctx.strokeStyle = 'rgba(255,225,168,.25)';
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(W - PAD, y);
      ctx.stroke();
      y += 30;
      ctx.fillStyle = '#d9d3ec';
      ctx.font = '30px ' + FONT;
      for (const l of ansLines) {
        ctx.fillText(l, PAD, y);
        y += 42;
      }
    }

    // Xuất
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Không tạo được ảnh');
    const file = new File([blob], 'witches-tarot.png', { type: 'image/png' });
    // Chỉ mở hộp chia sẻ trên thiết bị cảm ứng (điện thoại/tablet); máy tính tải thẳng file.
    if (touchDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Witches Tarot', text: question || 'Trải bài Tarot' });
        return;
      } catch {
        /* huỷ → tải file */
      }
    }
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = 'witches-tarot-' + dailyKey() + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  } catch (e) {
    alert('Không xuất được ảnh: ' + (e instanceof Error ? e.message : String(e)));
  }
}
