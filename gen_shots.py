#!/usr/bin/env python3
"""Render the three entry screenshots from the generated board.json as clean JPEGs."""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'out')
SHOTS = os.path.join(ROOT, 'screenshots')

BG = (11, 15, 20); PANEL = (18, 25, 34); LINE = (31, 42, 55)
INK = (230, 237, 243); MUTED = (139, 155, 176); ACCENT = (57, 208, 255)
GOLD = (255, 209, 102); GOOD = (61, 220, 151); BAD = (255, 107, 107)

F = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'


def font(size, bold=False, mono=False):
    return ImageFont.truetype(FB if bold else (MONO if mono else F), size)


def usd(n):
    if n >= 1e9: return f'${n/1e9:.2f}B'
    if n >= 1e6: return f'${n/1e6:.0f}M'
    if n >= 1e3: return f'${n/1e3:.0f}K'
    return f'${n}'


def pct(v):
    if v is None: return '—'
    return f'{v:+.1f}%'


def wrap(d, text, fnt, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=fnt) <= maxw:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


def header(d, W, title, sub):
    d.rectangle([0, 0, W, 92], fill=PANEL)
    d.line([0, 92, W, 92], fill=LINE, width=2)
    d.text((40, 22), title, font=font(30, True), fill=INK)
    d.text((40, 60), sub, font=font(16), fill=MUTED)


def save(img, name, quality):
    path = os.path.join(SHOTS, name)
    img.save(path, 'JPEG', quality=quality, optimize=True)
    print(name, img.size, os.path.getsize(path), 'bytes')


def board(rows, name, subtitle, quality, limit=22):
    W, H = 1440, 900
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    header(d, W, 'Token Launch Radar', subtitle)
    cols = [40, 70, 400, 600, 720, 850, 960, 1090]
    heads = ['#', 'Protocol', 'Sector', 'Chains', 'TVL', '7d', 'Age', 'Implied value']
    y = 120
    d.rectangle([32, y - 8, W - 32, y + 26], fill=PANEL)
    for x, htxt in zip(cols, heads):
        d.text((x, y), htxt, font=font(15, True), fill=MUTED)
    y += 40
    for r in rows[:limit]:
        d.text((cols[0], y), str(r['rank']), font=font(16), fill=MUTED)
        d.text((cols[1], y), r['name'][:34], font=font(18, True), fill=INK)
        d.text((cols[2], y), (r.get('category') or '—')[:26], font=font(15), fill=MUTED)
        d.text((cols[3], y), ', '.join(r.get('chains') or [])[:30], font=font(14), fill=MUTED)
        d.text((cols[4], y), usd(r['tvl_usd']), font=font(17, False, True), fill=INK)
        c = GOOD if (r.get('change_7d') or 0) > 0.5 else BAD if (r.get('change_7d') or 0) < -0.5 else MUTED
        d.text((cols[5], y), pct(r.get('change_7d')), font=font(16, False, True), fill=c)
        d.text((cols[6], y), '—' if r.get('age_days') is None else f"{r['age_days']}d", font=font(16, False, True), fill=MUTED)
        d.text((cols[7], y), usd(r['implied_value_usd']), font=font(18, True, True), fill=GOLD)
        barw = min(300, int(r['implied_value_usd'] / rows[0]['implied_value_usd'] * 300))
        d.rounded_rectangle([cols[7] + 120, y + 4, cols[7] + 120 + barw, y + 18], 4, fill=ACCENT)
        d.line([32, y + 30, W - 32, y + 30], fill=(22, 32, 43))
        y += 42
    d.text((40, H - 34), f"showing {min(limit, len(rows))} of {len(rows)} ranked pre-token protocols · model radar-2",
           font=font(14), fill=MUTED)
    save(img, name, quality)


def detail(row, name, quality):
    W, H = 1440, 900
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    header(d, W, row['name'], f"#{row['rank']} · {row['slug']} · {(row.get('category') or 'uncategorised')} · "
                               f"{', '.join(row.get('chains') or []) or '—'}")
    x, y = 40, 130
    stats = [('Implied value', usd(row['implied_value_usd'])), ('TVL', usd(row['tvl_usd'])),
             ('7d change', pct(row.get('change_7d'))),
             ('Age', 'unknown' if row.get('age_days') is None else f"{row['age_days']} days"),
             ('Scale multiple', '×%.2f' % row['model']['scale_multiple']),
             ('Growth multiple', '×%.2f' % row['model']['growth_multiplier']),
             ('Maturity multiple', '×%.2f' % row['model']['maturity_multiplier']),
             ('Sector multiple', '×%.2f' % row['model'].get('sector_multiplier', 1))]
    for k, v in stats:
        d.rounded_rectangle([x, y, x + 330, y + 54], 8, fill=PANEL)
        d.text((x + 14, y + 8), k, font=font(13), fill=MUTED)
        d.text((x + 14, y + 26), v, font=font(20, True, True), fill=INK)
        y += 62
    d.text((420, 130), 'Why this value', font=font(20, True), fill=ACCENT)
    yy = 164
    for line in wrap(d, row['rationale'], font(16), 980):
        d.text((420, yy), line, font=font(16), fill=INK)
        yy += 26
    d.text((420, yy + 22), 'Farm plan', font=font(20, True), fill=ACCENT)
    yy += 56
    for i, s in enumerate(row['farm_steps'], 1):
        for j, line in enumerate(wrap(d, f"{i}. {s}", font(15), 980)):
            d.text((420, yy), line, font=font(15), fill=MUTED if j else INK)
            yy += 23
        yy += 6
    save(img, name, quality)


def filtered(rows, name, sector, quality, limit=30):
    subset = [r for r in rows if (r.get('category') or '') == sector] or rows
    subset = sorted(subset, key=lambda r: -r['implied_value_usd'])[:limit]
    board(subset, name, f"filtered to {sector} · {len(subset)} protocols shown", quality, limit=len(subset))


if __name__ == '__main__':
    rows = json.load(open(os.path.join(OUT, 'board.json')))['rows']
    snap_path = os.path.join(ROOT, '..', 'inputs', 'snapshot.json')
    if not os.path.exists(snap_path):
        snap_path = os.path.join(ROOT, 'input', 'snapshot.json')
    snap = json.load(open(snap_path))
    os.makedirs(SHOTS, exist_ok=True)
    for old in os.listdir(SHOTS):
        if old.endswith('.png'):
            os.remove(os.path.join(SHOTS, old))
    board(rows, '1-board.jpg', f"pre-token board · snapshot {snap['as_of']}", 88)
    detail(rows[0], '2-detail.jpg', 88)
    cats = sorted({(r.get('category') or '') for r in rows if r.get('category')})
    pick = next((c for c in cats if 'DEX' in c), cats[0])
    filtered(rows, '3-filtered.jpg', pick, 92)
