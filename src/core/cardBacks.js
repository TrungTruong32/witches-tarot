// Kiểu: cardBacks.d.ts (file này là JS nguyên văn từ bản cũ, không kiểm tra kiểu).
// Mặt lưng lá bài: các mẫu SVG vẽ bằng code (chép NGUYÊN VĂN từ bản cũ, test so khớp từng byte với witches_tarot.html).
// 'witches' là ảnh dựng sẵn; các kiểu khác là SVG sinh ra theo hạt giống cố định.

const CB = (() => {
  const W = 300, H = 525, cx = 150, cy = 262.5, GOLD = '#e3b98a', CREAM = '#fff3dd';
  const n = x => +x.toFixed(2);
  const pol = (r, deg, ox = cx, oy = cy) => { const t = (deg - 90) * Math.PI / 180; return [n(ox + r * Math.cos(t)), n(oy + r * Math.sin(t))]; };
  const star4 = (x, y, r, fill = GOLD, w = r * .22) => `<path fill="${fill}" d="M${x} ${n(y - r)}Q${n(x + w)} ${n(y - w)} ${n(x + r)} ${y}Q${n(x + w)} ${n(y + w)} ${x} ${n(y + r)}Q${n(x - w)} ${n(y + w)} ${n(x - r)} ${y}Q${n(x - w)} ${n(y - w)} ${x} ${n(y - r)}Z"/>`;
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function starfield(seed, count, color = CREAM) {
    const r = rng(seed); let out = '';
    for (let i = 0; i < count; i++) {
      const x = n(18 + r() * (W - 36)), y = n(18 + r() * (H - 36)), rad = n(.35 + r() * r() * 1.5), o = n(.25 + r() * .65);
      out += r() < .06 ? star4(x, y, rad * 3.2, color).replace('<path', `<path opacity="${o}"`) : `<circle cx="${x}" cy="${y}" r="${rad}" fill="${color}" opacity="${o}"/>`;
    }
    return out;
  }
  function rays(r1, r2a, r2b, count, ox = cx, oy = cy, sw = 1) {
    let out = '';
    for (let i = 0; i < count; i++) { const [x1, y1] = pol(r1, i * 360 / count, ox, oy), [x2, y2] = pol(i % 2 ? r2b : r2a, i * 360 / count, ox, oy); out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${sw}"/>`; }
    return out;
  }
  // Trăng lưỡi liềm = đĩa tròn trừ đĩa lệch. Vẽ thẳng bằng path (2 cung tròn qua 2 giao điểm), KHÔNG dùng <mask>:
  // Safari/iPad vẽ sai mask trong SVG làm ảnh nền → lộ nguyên hình chữ nhật vàng phủ cả lá.
  const crescent = (x, y, r, rot) => {
    const dx = r * .42, dy = -r * .1, R2 = r * .86, d = Math.hypot(dx, dy);
    const a = (r * r - R2 * R2 + d * d) / (2 * d), h = Math.sqrt(r * r - a * a), ux = dx / d, uy = dy / d;
    const px = x + a * ux, py = y + a * uy, A = [n(px - h * uy), n(py + h * ux)], B = [n(px + h * uy), n(py - h * ux)];
    return `<path transform="rotate(${rot} ${x} ${y})" fill="url(#cbGold)" d="M${A[0]} ${A[1]}A${n(r)} ${n(r)} 0 1 1 ${B[0]} ${B[1]}A${n(R2)} ${n(R2)} 0 1 0 ${A[0]} ${A[1]}Z"/>`;
  };
  // Khung chung: viền đôi, góc có sao, chuỗi chấm dọc viền
  function frame(accent = GOLD) {
    let dots = '';
    for (let y = 50; y <= H - 50; y += 17) dots += `<circle cx="27" cy="${y}" r=".9"/><circle cx="${W - 27}" cy="${y}" r=".9"/>`;
    for (let x = 50; x <= W - 50; x += 17) dots += `<circle cx="${x}" cy="27" r=".9"/><circle cx="${x}" cy="${H - 27}" r=".9"/>`;
    const corners = [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]].map(([x, y]) => star4(x, y, 7, accent)).join('');
    return `<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="12" fill="none" stroke="${accent}" stroke-width="1.6"/>` +
      `<rect x="17" y="17" width="${W - 34}" height="${H - 34}" rx="8" fill="none" stroke="${accent}" stroke-width=".7" opacity=".6"/>` +
      `<g fill="${accent}" opacity=".55">${dots}</g>${corners}`;
  }
  const defs = (bg1, bg2, bg3) => `<defs><radialGradient id="cbBg" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset=".6" stop-color="${bg2}"/><stop offset="1" stop-color="${bg3}"/></radialGradient>` +
    `<linearGradient id="cbGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6e4"/><stop offset=".5" stop-color="${GOLD}"/><stop offset="1" stop-color="#b8834f"/></linearGradient>` +
    `<radialGradient id="cbGlow"><stop offset="0" stop-color="${GOLD}" stop-opacity=".35"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#cbBg)"/>`;
  const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
  const G = (inner, sw = 1, op = 1) => `<g fill="none" stroke="${GOLD}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}">${inner}</g>`;

  const designs = {
    // 1. Vòng hoàng đạo: bánh xe 12 cung, hexagram, mặt trời giữa, trăng non trên–dưới
    zodiac() {
      let sect = '', marks = '';
      for (let i = 0; i < 12; i++) {
        const [x1, y1] = pol(80, i * 30), [x2, y2] = pol(98, i * 30); sect += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
        const [mx, my] = pol(89, i * 30 + 15); marks += i % 2 ? `<circle cx="${mx}" cy="${my}" r="2.4" fill="none" stroke="${GOLD}" stroke-width=".9"/>` : star4(mx, my, 4.2);
      }
      const tri = off => 'M' + [0, 1, 2].map(k => pol(70, off + k * 120).join(' ')).join('L') + 'Z';
      return wrap(defs('#33246a', '#1a1238', '#0b0818') + starfield(11, 120) + frame() +
        `<circle cx="${cx}" cy="${cy}" r="120" fill="url(#cbGlow)"/>` +
        G(`<circle cx="${cx}" cy="${cy}" r="104" stroke-dasharray="2 4" opacity=".7"/><circle cx="${cx}" cy="${cy}" r="98"/><circle cx="${cx}" cy="${cy}" r="80"/>${sect}` +
          `<path d="${tri(0)}${tri(60)}" opacity=".55"/><circle cx="${cx}" cy="${cy}" r="48" opacity=".7"/>` + rays(19, 34, 27, 24, cx, cy, .9)) +
        marks + `<circle cx="${cx}" cy="${cy}" r="14" fill="url(#cbGold)"/>` +
        crescent(cx, 78, 22, 0, 'cbm1') + crescent(cx, H - 78, 22, 180, 'cbm2') +
        star4(cx - 50, 80, 4) + star4(cx + 50, 80, 4) + star4(cx - 50, H - 80, 4) + star4(cx + 50, H - 80, 4));
    },
    // 2. Tam nguyệt: trăng lên – rằm – trăng tàn, tia sáng, sao rơi
    triple() {
      return wrap(defs('#2c2156', '#151030', '#08060f') + starfield(23, 160) + frame() +
        `<circle cx="${cx}" cy="${cy}" r="95" fill="url(#cbGlow)"/>` +
        G(rays(40, 110, 80, 36, cx, cy, .6), 1, .45) +
        G(`<circle cx="${cx}" cy="${cy}" r="58" stroke-dasharray="1.5 3.5"/><line x1="${cx}" y1="60" x2="${cx}" y2="${cy - 70}"/><line x1="${cx}" y1="${cy + 70}" x2="${cx}" y2="${H - 60}"/>`, .8, .7) +
        crescent(cx - 70, cy, 24, 180, 'cbt1') + `<circle cx="${cx}" cy="${cy}" r="32" fill="url(#cbGold)"/>` + G(`<circle cx="${cx}" cy="${cy}" r="38"/>`, .7, .8) + crescent(cx + 70, cy, 24, 0, 'cbt2') +
        `<g fill="#b8834f" opacity=".35"><circle cx="${cx - 9}" cy="${cy - 8}" r="6"/><circle cx="${cx + 11}" cy="${cy + 10}" r="4.5"/><circle cx="${cx + 6}" cy="${cy - 14}" r="2.5"/></g>` +
        star4(cx, 52, 9) + star4(cx, H - 52, 9) + star4(cx, cy - 90, 5, CREAM) + star4(cx, cy + 90, 5, CREAM));
    },
    // 3. Nhật – Nguyệt: mặt trời trên, trăng ôm sao dưới, đường chân trời có sao
    sunmoon() {
      const sy = 150, my = H - 150;
      let wavy = '';
      for (let i = 0; i < 12; i++) {
        const a = i * 30 + 15, [x1, y1] = pol(40, a, cx, sy), [xm, ym] = pol(55, a + 5, cx, sy), [x2, y2] = pol(70, a, cx, sy);
        wavy += `<path d="M${x1} ${y1}Q${xm} ${ym} ${x2} ${y2}"/>`;
      }
      return wrap(defs('#4a1a3e', '#22102c', '#0c0612') + starfield(37, 110) + frame() +
        `<circle cx="${cx}" cy="${sy}" r="80" fill="url(#cbGlow)"/>` +
        G(rays(40, 78, 62, 12, cx, sy, 1.1) + wavy + `<circle cx="${cx}" cy="${sy}" r="34"/>`, 1, .9) +
        `<circle cx="${cx}" cy="${sy}" r="27" fill="url(#cbGold)"/>` +
        G(`<line x1="40" y1="${cy}" x2="${cx - 22}" y2="${cy}"/><line x1="${cx + 22}" y1="${cy}" x2="${W - 40}" y2="${cy}"/><circle cx="${cx}" cy="${cy}" r="14"/>`, .9, .8) +
        star4(cx, cy, 10) + star4(56, cy, 4) + star4(W - 56, cy, 4) +
        `<circle cx="${cx}" cy="${my}" r="78" fill="url(#cbGlow)"/>` + crescent(cx - 8, my, 52, -25, 'cbs1') +
        star4(cx + 22, my - 8, 15) + star4(cx + 40, my + 26, 5, CREAM) + G(`<circle cx="${cx}" cy="${my}" r="66" stroke-dasharray="2 4"/>`, .8, .6));
    },
    // 4. Hình học thiêng: hoa sự sống + Metatron, hạt giống sự sống trên–dưới
    sacred() {
      const flower = (ox, oy, r) => `<circle cx="${ox}" cy="${oy}" r="${r}"/>` + [0, 60, 120, 180, 240, 300].map(d => { const [x, y] = pol(r, d, ox, oy); return `<circle cx="${x}" cy="${y}" r="${r}"/>`; }).join('');
      const hex = (r, off = 0) => 'M' + [0, 1, 2, 3, 4, 5].map(k => pol(r, off + k * 60).join(' ')).join('L') + 'Z';
      const tri = off => 'M' + [0, 1, 2].map(k => pol(96, off + k * 120).join(' ')).join('L') + 'Z';
      return wrap(defs('#173b4a', '#0d2230', '#050c14') + starfield(53, 90) + frame() +
        `<circle cx="${cx}" cy="${cy}" r="115" fill="url(#cbGlow)"/>` +
        G(`<circle cx="${cx}" cy="${cy}" r="108"/><circle cx="${cx}" cy="${cy}" r="102" stroke-dasharray="1 3"/><path d="${hex(96)}"/><path d="${tri(0)}${tri(60)}" opacity=".75"/>` + flower(cx, cy, 30) + `<circle cx="${cx}" cy="${cy}" r="60"/>`, .9) +
        `<circle cx="${cx}" cy="${cy}" r="6" fill="url(#cbGold)"/>` +
        G(flower(cx, 72, 13) + `<circle cx="${cx}" cy="72" r="26"/>` + flower(cx, H - 72, 13) + `<circle cx="${cx}" cy="${H - 72}" r="26"/>`, .8, .85) +
        star4(cx, cy - 122, 6) + star4(cx, cy + 122, 6));
    },
    // 5. Con mắt thấu thị: tam giác chứa mắt, hào quang tia, trăng hai bên
    eye() {
      const ty = cy, tri = `M${cx} ${ty - 70}L${cx + 62} ${ty + 38}L${cx - 62} ${ty + 38}Z`;
      return wrap(defs('#3b1b5e', '#1d0f33', '#0a0514') + starfield(71, 120) + frame() +
        `<circle cx="${cx}" cy="${ty}" r="125" fill="url(#cbGlow)"/>` +
        G(rays(78, 125, 100, 48, cx, ty, .6), 1, .55) +
        G(`<path d="${tri}" stroke-width="1.4"/><path d="M${cx - 38} ${ty + 6}Q${cx} ${ty - 26} ${cx + 38} ${ty + 6}Q${cx} ${ty + 36} ${cx - 38} ${ty + 6}Z"/><circle cx="${cx}" cy="${ty + 6}" r="17" opacity=".6"/>`, 1.1) +
        `<circle cx="${cx}" cy="${ty + 6}" r="11" fill="url(#cbGold)"/><circle cx="${cx}" cy="${ty + 6}" r="4.2" fill="#140a22"/><circle cx="${cx + 3}" cy="${ty + 3}" r="1.6" fill="${CREAM}"/>` +
        crescent(cx, 76, 20, 0, 'cbe1') + crescent(cx, H - 76, 20, 180, 'cbe2') +
        G(`<circle cx="${cx}" cy="76" r="30" stroke-dasharray="1.5 3"/><circle cx="${cx}" cy="${H - 76}" r="30" stroke-dasharray="1.5 3"/>`, .8, .7) +
        star4(60, ty, 5) + star4(W - 60, ty, 5));
    },
    // 6. Chòm sao: quỹ đạo elip, hành tinh có vành, đường nối các sao
    stars() {
      const cons = [
        [[62, 92], [96, 70], [128, 98], [170, 84], [206, 118], [236, 96]],
        [[64, 420], [92, 446], [128, 430], [150, 462], [196, 448], [234, 470]],
        [[60, 210], [82, 250], [70, 300]], [[240, 230], [222, 276], [244, 318]]
      ];
      let lines = '', nodes = '';
      cons.forEach(c => { lines += `<polyline points="${c.map(p => p.join(',')).join(' ')}"/>`; c.forEach(([x, y], i) => { nodes += i % 2 ? `<circle cx="${x}" cy="${y}" r="2.2" fill="${CREAM}"/>` : star4(x, y, 5); }); });
      return wrap(defs('#1c2f66', '#0e1838', '#050916') + starfield(97, 200) + frame() +
        `<circle cx="${cx}" cy="${cy}" r="105" fill="url(#cbGlow)"/>` +
        G(`<ellipse cx="${cx}" cy="${cy}" rx="104" ry="42" transform="rotate(-28 ${cx} ${cy})"/><ellipse cx="${cx}" cy="${cy}" rx="104" ry="42" transform="rotate(28 ${cx} ${cy})"/><ellipse cx="${cx}" cy="${cy}" rx="78" ry="78" stroke-dasharray="2 4"/>`, .8, .7) +
        `<circle cx="${cx}" cy="${cy}" r="24" fill="url(#cbGold)"/>` +
        G(`<ellipse cx="${cx}" cy="${cy}" rx="44" ry="11" transform="rotate(-18 ${cx} ${cy})" stroke-width="1.6"/>`) +
        G(lines, .7, .65) + nodes + `<circle cx="${n(pol(104, 62)[0])}" cy="${n(pol(104, 62)[1])}" r="5" fill="${CREAM}" opacity=".9"/>` +
        `<circle cx="${n(pol(78, 200)[0])}" cy="${n(pol(78, 200)[1])}" r="4" fill="url(#cbGold)"/>`);
    }

  };
  const cache = {};
  return {
    keys: [...Object.keys(designs), 'witches'],
    svg: k => cache[k] || (cache[k] = designs[k]()),
    // 'witches' là ảnh dựng sẵn (tinh vân kiểu ảnh chụp) — các kiểu khác là SVG
    css: k => k === 'witches' ? "url('/cardback-witches.webp') center / cover no-repeat, #04030a" : 'url("data:image/svg+xml,' + encodeURIComponent(CB.svg(k)) + '") center / cover no-repeat, #0b0818'
  };
})();

const CARD_BACK_NAMES = {
  zodiac: ['Vòng hoàng đạo', 'Zodiac wheel'], triple: ['Tam nguyệt', 'Triple moon'], sunmoon: ['Nhật – Nguyệt', 'Sun & Moon'],
  sacred: ['Hình học thiêng', 'Sacred geometry'], eye: ['Con mắt thấu thị', 'All-seeing eye'], stars: ['Chòm sao', 'Constellations'],
  witches: ['Witches – tinh vân', 'Witches – nebula']
};

const CARD_BACK_ALIAS = { moon: 'triple', night: 'stars', plain: 'sacred' };

/** Các kiểu mặt lưng, theo thứ tự hiển thị. */
export const CARD_BACK_KEYS = CB.keys;
export const cardBackSvg = (/** @type {string} */ k) => CB.svg(k);
export const cardBackCss = (/** @type {string} */ k) => CB.css(k);
export { CARD_BACK_NAMES };

/** Giá trị đã lưu (localStorage 'cardBack') → kiểu hợp lệ: đổi tên cũ, không rõ thì 'zodiac'. */
export function normalizeCardBack(/** @type {string | null} */ saved) {
  const k = (saved && /** @type {Record<string, string>} */ (CARD_BACK_ALIAS)[saved]) || saved || 'zodiac';
  return CB.keys.includes(k) ? k : 'zodiac';
}
