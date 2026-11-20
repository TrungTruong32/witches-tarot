// Vòng hoàng đạo SVG (12 cung + 7 hành tinh cổ điển) — nền khi xào/chọn bài. Chép nguyên văn từ bản cũ (L5330).
export function zodiacWheelHTML(): string {
  const SIGNS = [...'♈♉♊♋♌♍♎♏♐♑♒♓'], PLAN = [...'☉☾☿♀♂♃♄'], VS = '︎';
  const pt = (r: number, deg: number): [string, string] => { const t = (deg - 90) * Math.PI / 180; return [(r * Math.cos(t)).toFixed(2), (r * Math.sin(t)).toFixed(2)]; };
  let ticks = '', signs = '', divs = '', plan = '', rays = '';
  for (let i = 0; i < 72; i++) { const [x1, y1] = pt(i % 6 ? 89 : 86, i * 5), [x2, y2] = pt(92, i * 5); ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = pt(62, i * 30), [x2, y2] = pt(82, i * 30); divs += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    const [x, y] = pt(72, i * 30 + 15); signs += `<text x="${x}" y="${y}" font-size="11" transform="rotate(${i * 30 + 15} ${x} ${y})">${SIGNS[i]}${VS}</text>`;
  }
  PLAN.forEach((g, i) => { const [x, y] = pt(48, i * (360 / 7)); plan += `<text x="${x}" y="${y}" font-size="9" opacity=".85">${g}${VS}</text>`; });
  for (let i = 0; i < 16; i++) { const [x1, y1] = pt(i % 2 ? 16 : 12, i * 22.5), [x2, y2] = pt(i % 2 ? 26 : 34, i * 22.5); rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }
  return '<div class="zwheel" aria-hidden="true"><svg viewBox="-100 -100 200 200">' +
    '<defs><radialGradient id="zwGlow"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>' +
    '<circle class="zw-glow" r="40"/>' +
    '<g class="zw-outer" fill="none" stroke="currentColor"><circle r="97" stroke-width=".5" stroke-dasharray="3 2" opacity=".55"/>' +
      '<g stroke-width=".45" opacity=".6">' + ticks + '</g><circle r="92" stroke-width=".4" opacity=".5"/></g>' +
    '<g class="zw-signs"><g fill="none" stroke="currentColor" stroke-width=".45" opacity=".55"><circle r="82"/><circle r="62"/>' + divs + '</g>' + signs + '</g>' +
    '<g class="zw-core"><circle r="56" fill="none" stroke="currentColor" stroke-width=".35" stroke-dasharray="1 2.5" opacity=".6"/>' + plan +
      '<g stroke="currentColor" stroke-width=".6" opacity=".7">' + rays + '</g><circle r="8" fill="none" stroke="currentColor" stroke-width=".6"/><circle r="2.2" fill="currentColor"/></g>' +
    '</svg></div>';
}
