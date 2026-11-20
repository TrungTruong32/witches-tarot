#!/usr/bin/env python3
"""Sinh các trang HTML tĩnh cho SEO từ tarot.db (chạy lại mỗi khi đổi tarot.db):

    python scripts/build_seo_pages.py

Tạo ra (KHÔNG sửa tay; la-bai/ là git-ignored vì chứa dữ liệu bài — không commit, chỉ deploy từ máy như file tĩnh;
sitemap.xml, robots.txt được commit):
  la-bai/index.html                    — trang tổng: danh sách các bộ bài
  la-bai/<bo-bai>/index.html           — danh sách 78 lá của một bộ
  la-bai/<bo-bai>/<la-bai>/index.html  — ý nghĩa từng lá (xuôi, ngược, từ khóa…)
  sitemap.xml, robots.txt
App chính (bản React, src/) không phụ thuộc vào các file này; vite build chép chúng vào dist/ (scripts/copy-static.mjs).
"""
import html
import json
import re
import shutil
import sqlite3
from datetime import date
from pathlib import Path

SITE = 'https://tt-witches-tarot.vercel.app'
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'la-bai'
TODAY = date.today().isoformat()

DECKS = {  # tên bộ trong tarot.db → (slug URL, tên hiển thị, mô tả ngắn)
    'Witches Tarot': ('witches-tarot', 'Witches Tarot',
                      'Bộ Witches Tarot của Ellen Dugan, minh họa Mark Evans — tarot dành cho phù thủy hiện đại, gắn với thảo dược, nguyên tố và phép thuật tự nhiên.'),
    'Rider-Waite': ('rider-waite', 'Rider-Waite',
                    'Bộ Rider-Waite-Smith (1909) — bộ tarot kinh điển và phổ biến nhất, nền tảng biểu tượng cho hầu hết các bộ bài hiện đại.'),
}
SUITS = {
    'Bo An Chinh': 'Ẩn Chính (Major Arcana)', 'Bo Wands': 'Bộ Gậy (Wands)', 'Bo Cups': 'Bộ Cốc (Cups)',
    'Bo Swords': 'Bộ Kiếm (Swords)', 'Bo Pentacles': 'Bộ Tiền (Pentacles)',
}

e = lambda s: html.escape(s or '', quote=True)


def slugify(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def clip(text, n=155):
    text = re.sub(r'\s+', ' ', text or '').strip()
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(' ', 1)[0].rstrip(',.;:–- ')
    return cut + '…'


def paras(text):
    """Văn bản nhiều dòng → các <p>; dòng 'Nhãn ngắn: …' thì in đậm phần nhãn."""
    out = []
    for line in (text or '').split('\n'):
        line = line.strip()
        if not line:
            continue
        m = re.match(r'^([^:.!?]{2,40}):\s*(.*)$', line)
        if m:
            body = f' {e(m.group(2))}' if m.group(2) else ''
            out.append(f'<p><strong>{e(m.group(1))}:</strong>{body}</p>')
        else:
            out.append(f'<p>{e(line)}</p>')
    return '\n'.join(out)


def page(title, desc, path, body, jsonld, og_image=None, og_type='website'):
    url = SITE + path
    img = og_image or SITE + '/og-image.jpg'
    ld = '\n'.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in jsonld)
    return f'''<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}" />
<link rel="canonical" href="{e(url)}" />
<meta name="theme-color" content="#1f1b2f" />
<link rel="icon" href="/icon-192.png" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta property="og:type" content="{og_type}" />
<meta property="og:site_name" content="Witches Tarot" />
<meta property="og:locale" content="vi_VN" />
<meta property="og:title" content="{e(title)}" />
<meta property="og:description" content="{e(desc)}" />
<meta property="og:url" content="{e(url)}" />
<meta property="og:image" content="{e(img)}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Be+Vietnam+Pro:wght@400;600;700&display=swap" />
<link rel="stylesheet" href="/la-bai/seo.css" />
{ld}
</head>
<body>
<header class="top"><a class="brand" href="/">✧ Witches Tarot</a><nav><a href="/la-bai/">Ý nghĩa lá bài</a><a class="cta" href="/">Trải bài AI</a></nav></header>
<main>
{body}
</main>
<footer><p>Witches Tarot · tra cứu 78 lá bài, trải bài &amp; diễn giải bằng AI · chỉ mang tính tham khảo &amp; giải trí.</p><p><a href="/">Trang chủ</a> · <a href="/la-bai/">Ý nghĩa lá bài</a></p></footer>
</body>
</html>
'''


def crumbs(items):
    """items: [(tên, path)] → (HTML, JSON-LD BreadcrumbList)."""
    links = ' › '.join(f'<a href="{e(p)}">{e(n)}</a>' if i < len(items) - 1 else f'<span>{e(n)}</span>'
                       for i, (n, p) in enumerate(items))
    ld = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + p} for i, (n, p) in enumerate(items)]}
    return f'<nav class="crumbs" aria-label="Breadcrumb">{links}</nav>', ld


def section(h, text):
    return f'<section><h2>{e(h)}</h2>\n{paras(text)}\n</section>' if (text or '').strip() else ''


def main():
    db = sqlite3.connect(ROOT / 'tarot.db')
    db.row_factory = sqlite3.Row
    if OUT.exists():  # chỉ xoá các thư mục do script tạo, giữ seo.css
        for d in OUT.iterdir():
            if d.is_dir():
                shutil.rmtree(d)
            elif d.name == 'index.html':
                d.unlink()
    urls = ['/', '/la-bai/']
    deck_cards_html = []

    for deck, (dslug, dname, ddesc) in DECKS.items():
        cards = [dict(r) for r in db.execute('SELECT * FROM cards WHERE deck = ? ORDER BY id', (deck,))]
        if not cards:
            continue
        dpath = f'/la-bai/{dslug}/'
        slugs = [slugify(c['ten']) for c in cards]
        assert len(set(slugs)) == len(slugs), f'trùng slug trong {deck}'

        # --- từng lá ---
        for i, c in enumerate(cards):
            path = f'{dpath}{slugs[i]}/'
            suit = SUITS.get(c['bo'], c['bo'] or '')
            title = f"{c['ten']} – Ý nghĩa lá bài {dname} (xuôi & ngược)"
            desc = clip(f"Ý nghĩa lá {c['ten']} trong bộ {dname}: {c['tu_khoa'] or c['y_nghia_xuoi']}")
            nav_html, nav_ld = crumbs([('Trang chủ', '/'), ('Ý nghĩa lá bài', '/la-bai/'), (dname, dpath), (c['ten'], path)])
            prev_c, next_c = cards[i - 1], cards[(i + 1) % len(cards)]
            facts = ''.join(f'<li><strong>{lbl}:</strong> {e(c[k])}</li>' for lbl, k in
                            (('Chiêm tinh học', 'chiem_tinh_hoc'), ('Thần thánh', 'than_thanh'),
                             ('Nguyên tố liên quan', 'cac_nguyen_to_lien_quan')) if (c[k] or '').strip())
            img = (f'<img class="card" src="{e(c["image_url"])}" alt="Lá bài {e(c["ten"])} – {e(dname)}" '
                   f'width="300" height="520" loading="eager" referrerpolicy="no-referrer" />') if c['image_url'] else ''
            kw = f'<p class="kw"><strong>Từ khóa:</strong> {e(c["tu_khoa"])}</p>' if c['tu_khoa'] else ''
            facts_html = f'<ul class="facts">{facts}</ul>' if facts else ''
            detail = section('Mô tả chi tiết', re.sub(r'^Mô tả chi tiết:\s*', '', c['content'] or '')) if deck == 'Rider-Waite' else ''
            src = f'<p class="src">Nguồn tham khảo: <a href="{e(c["url"])}" rel="noopener" target="_blank">tarot.vn</a></p>' if c['url'] else ''
            prev_href, next_href = dpath + slugify(prev_c['ten']) + '/', dpath + slugify(next_c['ten']) + '/'
            body = f'''{nav_html}
<article>
<div class="hero">{img}
<div>
<p class="kicker">{e(dname)} · {e(suit)} · {e(c['so'])}</p>
<h1>Ý nghĩa lá {e(c['ten'])}</h1>
{kw}
{facts_html}
<p><a class="cta" href="/">✧ Trải bài &amp; hỏi AI ngay</a></p>
</div>
</div>
{section(f"{c['ten']} xuôi", c['y_nghia_xuoi'])}
{section(f"{c['ten']} ngược", c['nghia_nguoc'])}
{section('Mô tả hình ảnh & biểu tượng', c['mo_ta_hinh_anh'])}
{detail}
{src}
</article>
<nav class="pager"><a href="{prev_href}">‹ {e(prev_c['ten'])}</a><a href="{dpath}">Tất cả lá {e(dname)}</a><a href="{next_href}">{e(next_c['ten'])} ›</a></nav>'''
            art_ld = {'@context': 'https://schema.org', '@type': 'Article', 'headline': f"Ý nghĩa lá {c['ten']} – {dname}",
                      'description': desc, 'inLanguage': 'vi', 'mainEntityOfPage': SITE + path,
                      'dateModified': TODAY, 'author': {'@type': 'Organization', 'name': 'Witches Tarot'}}
            if c['image_url']:
                art_ld['image'] = c['image_url']
            f = OUT / dslug / slugs[i] / 'index.html'
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(page(title, desc, path, body, [nav_ld, art_ld], c['image_url'] or None, 'article'), encoding='utf-8')
            urls.append(path)

        # --- danh sách lá của bộ ---
        groups = {}
        for c, s in zip(cards, slugs):
            q = ' '.join(x for x in (c['so'], c['ten'], c['tu_khoa'], SUITS.get(c['bo'], '')) if x)
            groups.setdefault(c['bo'], []).append(
                f'<li data-q="{e(q)}"><a href="{dpath}{s}/"><img src="{e(c["image_url"])}" alt="{e(c["ten"])}" loading="lazy" '
                f'width="120" height="208" referrerpolicy="no-referrer" /><span>{e(c["ten"])}</span></a></li>')
        grid = '\n'.join(f'<section class="suit"><h2>{e(SUITS.get(bo, bo))}</h2><ul class="grid">{"".join(items)}</ul></section>'
                         for bo, items in groups.items())
        # ô tìm kiếm + nút lọc bộ phụ (la-bai/finder.js) — giống trang Tra cứu trong app
        chips = ''.join(f'<button type="button" data-suit="{i}">{e(SUITS.get(bo, bo).split(" (")[0])} ({len(items)})</button>'
                        for i, (bo, items) in enumerate(groups.items()))
        tools = (f'<div class="finder"><input type="search" id="q" placeholder="Tìm theo tên, số, từ khóa… (vd: tình yêu, cups, 10)" '
                 f'aria-label="Tìm lá bài" autocomplete="off" />'
                 f'<div class="chips"><button type="button" data-suit="all" class="on">Tất cả ({len(cards)})</button>{chips}</div>'
                 f'<p id="none" hidden>Không có lá nào khớp — thử từ khóa khác.</p></div>')
        nav_html, nav_ld = crumbs([('Trang chủ', '/'), ('Ý nghĩa lá bài', '/la-bai/'), (dname, dpath)])
        title = f'Ý nghĩa 78 lá bài {dname} – xuôi, ngược & từ khóa'
        desc = clip(f'Tra cứu ý nghĩa đầy đủ 78 lá bài {dname}: 22 lá Ẩn Chính và 56 lá Ẩn Phụ (Gậy, Cốc, Kiếm, Tiền), nghĩa xuôi, ngược, từ khóa và biểu tượng.')
        body = (f'{nav_html}\n<h1>Ý nghĩa 78 lá bài {e(dname)}</h1>\n<p class="lead">{e(ddesc)}</p>\n'
                f'{tools}\n{grid}\n<script src="/la-bai/finder.js" defer></script>')
        (OUT / dslug / 'index.html').write_text(page(title, desc, dpath, body, [nav_ld]), encoding='utf-8')
        urls.insert(2, dpath)
        # ảnh đại diện bộ: quạt 3 lá Ẩn Chính
        by_name = {c['ten']: c for c in cards}
        cover = [by_name.get(n) for n in ('The Fool', 'The Star', 'The World')]
        fan = ''.join(f'<img src="{e(c["image_url"])}" alt="Lá {e(c["ten"])} – bộ {e(dname)}" width="120" height="208" '
                      f'loading="lazy" referrerpolicy="no-referrer" />' for c in cover if c and c['image_url'])
        deck_cards_html.append(f'<li><a href="{dpath}"><div class="fan">{fan}</div><div><strong>{e(dname)}</strong>'
                               f'<span>{e(ddesc)}</span><em>Xem 78 lá ›</em></div></a></li>')

    # --- trang tổng ---
    nav_html, nav_ld = crumbs([('Trang chủ', '/'), ('Ý nghĩa lá bài', '/la-bai/')])
    body = (f'{nav_html}\n<h1>Ý nghĩa các lá bài Tarot</h1>\n'
            f'<p class="lead">Chọn bộ bài để xem ý nghĩa xuôi, ngược, từ khóa và biểu tượng của từng lá. '
            f'Mỗi bộ giữ đúng cách diễn giải riêng của nó.</p>\n<ul class="decks">{"".join(deck_cards_html)}</ul>')
    (OUT / 'index.html').write_text(page('Ý nghĩa các lá bài Tarot – Witches Tarot & Rider-Waite',
                                         'Tra cứu ý nghĩa 78 lá bài của bộ Witches Tarot và Rider-Waite: nghĩa xuôi, ngược, từ khóa, biểu tượng — kèm trải bài và diễn giải bằng AI.',
                                         '/la-bai/', body, [nav_ld]), encoding='utf-8')

    # --- sitemap + robots ---
    sm = '\n'.join(f'  <url><loc>{SITE}{u}</loc><lastmod>{TODAY}</lastmod></url>' for u in urls)
    (ROOT / 'sitemap.xml').write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{sm}\n</urlset>\n', encoding='utf-8')
    (ROOT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {SITE}/sitemap.xml\n', encoding='utf-8')
    print(f'✓ {len(urls)} URL → la-bai/, sitemap.xml, robots.txt')


if __name__ == '__main__':
    main()
