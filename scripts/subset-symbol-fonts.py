# Tạo font ký hiệu siêu nhỏ (chỉ đúng các glyph app dùng) từ gói @fontsource — chạy một lần, file woff2 được commit.
# Thay cho link Google Fonts cũ `Noto Sans Symbols + Symbols 2 &text=…`: bản fontsource đầy đủ quá nặng
# (Symbols ~58 KB, Symbols 2 ~382 KB) cho ~46 ký tự chiêm tinh / ngôi sao.
# Cần: pip install fonttools brotli; npm i (để có node_modules/@fontsource/noto-sans-symbols*)
# Chạy: python scripts/subset-symbol-fonts.py   → src/assets/fonts/*.woff2 + in unicode-range cho @font-face.
# Thêm ký tự mới: sửa TEXT, chạy lại, cập nhật unicode-range trong src/styles/fonts.css theo dòng in ra.
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# Đúng danh sách `text=` của link Google Fonts cũ trong index.html
TEXT = '☉☽☾☿♀♂♃♄♅♆♇♈♉♊♋♌♍♎♏♐♑♒♓🜂🜄🜁🜃✦✧✶✴★☆⚙⇩☍☌☊✕⌖☼♫♪⚹⚝⇧'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'fonts')
FAMILIES = ['noto-sans-symbols', 'noto-sans-symbols-2']


def ranges(cps):
    cps = sorted(cps)
    out, start, prev = [], cps[0], cps[0]
    for c in cps[1:] + [None]:
        if c is not None and c == prev + 1:
            prev = c
            continue
        out.append(f'U+{start:X}' if start == prev else f'U+{start:X}-{prev:X}')
        if c is not None:
            start = prev = c
    return ', '.join(out)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    os.makedirs(OUT, exist_ok=True)
    for fam in FAMILIES:
        src = os.path.join(ROOT, 'node_modules', '@fontsource', fam, 'files', f'{fam}-symbols-400-normal.woff2')
        cmap = TTFont(src).getBestCmap()
        cps = [ord(c) for c in TEXT if ord(c) in cmap]
        dst = os.path.join(OUT, f'{fam}-subset.woff2')
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.desubroutinize = True
        font = subset.load_font(src, opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=cps)
        sub.subset(font)
        subset.save_font(font, dst, opts)
        print(f'{fam}: {len(cps)} glyph, {os.path.getsize(dst)} byte → {os.path.relpath(dst, ROOT)}')
        print(f'  unicode-range: {ranges(cps)};')


if __name__ == '__main__':
    main()
