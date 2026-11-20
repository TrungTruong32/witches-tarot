# Plan 2c — parity with legacy

Run on 2026-11-20 against the frozen legacy file, using real data.

## Screenshots (`node scripts/parity-screens.mjs sky-`)
The canvas is hidden because the sky is drawn from the live clock, so only the controls are compared.

| Screen | Range | Verdict |
|---|---|---|
| Sky (controls, info) | 0.00–1.59% over 8 variants | Identical. The diffs are the known 1 px `<select>` shift that comes from web-font timing. |

## Background, compared by eye (900×600, Hà Nội, deco and real)
- **Real sky:** star, label, Moon (with phase) and Saturn positions match legacy pixel for pixel. Compass letters B/N/Đ/T sit in the same places.
  - **Difference (intentional fix):** React also draws the constellation lines. Legacy read `sky.json` `lines` the wrong way, so it never drew them (inventory §4.1).
- **Deco:** same density, size, colour and aura; star positions are random.

## Real-browser flows (`node scripts/smoke-flows.mjs`): 12/12 pass
Covers the Plan 2b steps plus two new ones:
- **Sky map:** it draws (the canvas has pixels), switching location to Đà Nẵng updates `#skyInfo`, and zoom and grid toggle work.
- **Site settings:** real-sky background on and off, and ambient music cycling through mystic → candle → off, with no JS errors.

## Rulings (details in the Plan 2c ledger)
- **Background loop:** stops when fx is off and pauses while the tab is hidden. Bursts are dropped while fx is off.
- **Constellation lines:** now drawn in the real-sky background (legacy bug fixed).
- **Sky map:**
  - A pinch never ends up picking a star.
  - The last GPS fix is kept for the session.
  - When `sky.json` fails to load, the map shows an error message (legacy failed silently).
- **Ambient music:**
  - An unknown stored mode plays nothing.
  - All of its oscillators and noise sources are stopped (legacy stopped only the candle bed).
