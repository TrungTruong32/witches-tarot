# -*- coding: utf-8 -*-
"""
Build tarot.db (SQLite) from one or more deck JSON files.

Decks:
  - Base deck "Witches Tarot" from witches_tarot_with_images.json (in this folder).
  - Any extra deck: drop a file at  Data/decks/<TenBo>.json  -> deck name = "<TenBo>".
    (create the decks/ folder if it doesn't exist)

Field mapping is LENIENT: each card object is matched to the known columns by name;
missing fields become ''. If y_nghia_xuoi still contains the "Ý nghĩa" marker (the
tarot.vn scrape format), it is split -> description goes to mo_ta_hinh_anh, meaning
stays in y_nghia_xuoi. Clean decks without the marker are left untouched.

Output: ../tarot.db (project root) with a `deck` column, so the static HTML can
filter by deck on Vercel.
"""
import glob
import json
import os
import re
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
BASE_JSON = os.path.join(HERE, "witches_tarot_with_images.json")
DECKS_DIR = os.path.join(HERE, "decks")
OUT = os.path.join(HERE, "..", "tarot.db")

FIELDS = [
    "bo", "so", "ten", "url",
    "mo_ta_hinh_anh", "y_nghia_xuoi", "tu_khoa",
    "than_thanh", "chiem_tinh_hoc", "cac_nguyen_to_lien_quan",
    "nghia_nguoc", "content", "image_url",
]

MARKER = "\nÝ nghĩa\n"
TITLE_RE = re.compile(r"^\s*lá\b.*tarot\s*$", re.IGNORECASE)


def s(v):
    """Coerce any value to a stripped-safe string ('' for None)."""
    return "" if v is None else str(v)


def map_card(obj):
    """Lenient map of an arbitrary card object to the known columns."""
    row = {f: s(obj.get(f)) for f in FIELDS}
    # Split the scrape-format "Ý nghĩa" marker only if present.
    xuoi = row["y_nghia_xuoi"]
    idx = xuoi.find(MARKER)
    if idx >= 0:
        desc = xuoi[:idx]
        meaning = xuoi[idx + len(MARKER):]
        lines = desc.split("\n")
        if lines and TITLE_RE.match(lines[0]):
            lines = lines[1:]
        desc = "\n".join(lines).strip()
        if desc and not row["mo_ta_hinh_anh"].strip():
            row["mo_ta_hinh_anh"] = desc
        row["y_nghia_xuoi"] = meaning.strip()
    return row


def load_deck(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path}: JSON phải là một mảng (list) các lá bài.")
    return [map_card(o) for o in data]


def collect_decks():
    decks = [("Witches Tarot", load_deck(BASE_JSON))]
    if os.path.isdir(DECKS_DIR):
        for path in sorted(glob.glob(os.path.join(DECKS_DIR, "*.json"))):
            name = os.path.splitext(os.path.basename(path))[0]
            decks.append((name, load_deck(path)))
    return decks


def main():
    decks = collect_decks()

    if os.path.exists(OUT):
        os.remove(OUT)
    conn = sqlite3.connect(OUT)
    cur = conn.cursor()
    cols_ddl = ",\n  ".join(f"{c} TEXT" for c in FIELDS)
    cur.execute(f"""
        CREATE TABLE cards (
          id INTEGER PRIMARY KEY,
          deck TEXT,
          {cols_ddl}
        )
    """)
    cur.execute("CREATE INDEX idx_cards_deck ON cards(deck)")
    cur.execute("CREATE INDEX idx_cards_deck_bo ON cards(deck, bo)")

    insert_cols = ["deck"] + FIELDS
    placeholders = ", ".join(["?"] * (len(insert_cols) + 1))
    insert_sql = f"INSERT INTO cards (id, {', '.join(insert_cols)}) VALUES ({placeholders})"

    next_id = 0
    for deck_name, cards in decks:
        for card in cards:
            row = [next_id, deck_name] + [card.get(f, "") for f in FIELDS]
            cur.execute(insert_sql, row)
            next_id += 1

    conn.commit()
    print(f"Wrote {os.path.abspath(OUT)}  ({os.path.getsize(OUT)/1024:.1f} KB)")
    for deck_name, cards in decks:
        print(f"  deck '{deck_name}': {len(cards)} lá")
    conn.close()


if __name__ == "__main__":
    main()
