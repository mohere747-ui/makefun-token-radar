#!/usr/bin/env python3
"""Regenerate the three radar JPEGs from the generated board and data script.

Reads out/board.json for every table/stat value and out/data.js for the fitted model,
validation and coverage manifest. Pillow only; no network, no hardcoded protocol data.
"""

import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "out")
SHOTS = os.path.join(ROOT, "screenshots")
W, H = 1440, 900

BG = (7, 13, 29)
PANEL = (13, 22, 48)
PANEL2 = (17, 29, 59)
LINE = (35, 50, 90)
TEXT = (232, 239, 255)
MUTED = (147, 164, 200)
ACCENT = (90, 217, 196)
BLUE = (138, 168, 255)
WARN = (255, 201, 120)
UP = (103, 223, 165)
DOWN = (255, 143, 156)


def font_path(name, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def font(size, bold=False):
    path = font_path("sans", bold)
    if path:
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F = {key: font(size, bold) for key, (size, bold) in {
    "title": (34, True), "sub": (17, False), "control": (17, False),
    "head": (14, True), "row": (16, False), "rowbold": (16, True),
    "small": (14, False), "chipkey": (11, True), "chipval": (17, True),
    "h2": (22, True), "h3": (16, True), "body": (17, False),
    "step": (16, False), "panel": (15, False), "foot": (14, False),
}.items()}


def load():
    with open(os.path.join(OUT, "board.json"), encoding="utf-8") as handle:
        board = json.load(handle)["rows"]
    with open(os.path.join(OUT, "data.js"), encoding="utf-8") as handle:
        script = handle.read().strip()
    prefix = "window.RADAR="
    if not script.startswith(prefix):
        raise SystemExit("gen_shots: out/data.js does not start with window.RADAR=")
    radar = json.loads(script[len(prefix):].rstrip().rstrip(";"))
    return board, radar


def usd(value):
    if value is None:
        return "—"
    value = float(value)
    absolute = abs(value)
    if absolute >= 1e9:
        return "${:.2f}B".format(value / 1e9)
    if absolute >= 1e6:
        return "${:.2f}M".format(value / 1e6)
    if absolute >= 1e3:
        return "${:.1f}K".format(value / 1e3)
    return "${:.0f}".format(value)


def pct(value):
    if value is None:
        return "—"
    value = float(value)
    return ("+" if value > 0 else "") + "{:.2f}%".format(value)


def fit(draw, text, fnt, width):
    if draw.textlength(text, font=fnt) <= width:
        return text
    out = text
    while out and draw.textlength(out + "…", font=fnt) > width:
        out = out[:-1]
    return out + "…"


def wrap(draw, text, fnt, width):
    lines, current = [], ""
    for word in str(text).split():
        candidate = (current + " " + word).strip()
        if current and draw.textlength(candidate, font=fnt) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def write_lines(draw, lines, x, y, fnt, fill, leading=24):
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += leading
    return y


def canvas():
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 5), fill=ACCENT)
    return image, draw


def header(draw, title, subtitle):
    draw.text((48, 32), title, font=F["title"], fill=TEXT)
    draw.text((50, 78), subtitle, font=F["sub"], fill=MUTED)


def control_strip(draw, text):
    draw.rounded_rectangle((48, 112, W - 48, 162), radius=9, fill=PANEL, outline=LINE, width=2)
    draw.text((70, 130), text, font=F["control"], fill=TEXT)
    draw.text((W - 160, 131), "◎ radar", font=F["small"], fill=ACCENT)


def footer(draw, text):
    draw.rectangle((0, H - 42, W, H), fill=PANEL)
    draw.line((0, H - 42, W, H - 42), fill=LINE, width=2)
    draw.text((50, H - 30), fit(draw, text, F["foot"], W - 100), font=F["foot"], fill=MUTED)


COLS = [
    (56, "#", "left", 34),
    (104, "Protocol", "left", 270),
    (392, "Sector", "left", 240),
    (652, "Chains", "left", 130),
    (900, "TVL", "right", 110),
    (1000, "7d", "right", 80),
    (1090, "Age", "right", 80),
    (1230, "Implied value", "right", 190),
]


def board_shot(rows, radar, path, title, control, ages, note):
    image, draw = canvas()
    validation = radar["validation"]
    coverage = radar["coverage"]
    header(draw, title, "as of {} · {} · fitted on {} labelled tokens".format(
        radar["as_of"], radar["model_version"], validation["labelled"]))
    control_strip(draw, control)

    draw.rounded_rectangle((48, 174, W - 48, 208), radius=5, fill=PANEL2)
    for x, label, align, _ in COLS:
        anchor = "la" if align == "left" else "ra"
        draw.text((x, 191), label, font=F["head"], fill=MUTED, anchor=anchor)

    start, row_h, limit = 214, 29, 22
    for i, row in enumerate(rows[:limit]):
        y = start + i * row_h
        if i % 2 == 0:
            draw.rectangle((48, y, W - 48, y + row_h - 1), fill=(11, 19, 42))
        if row.get("watchlisted"):
            draw.rectangle((48, y, 51, y + row_h - 1), fill=ACCENT)
        values = [
            str(row["rank"]),
            row["name"] + ("  ★" if row.get("watchlisted") else ""),
            row.get("category") or "—",
            ", ".join(row.get("chains") or []) or "—",
            usd(row["tvl_usd"]),
            pct(row.get("change_7d")),
            "{}d".format(ages.get(row["slug"])) if ages.get(row["slug"]) is not None else "—",
            usd(row["implied_value_usd"]),
        ]
        for (x, _label, align, width), value in zip(COLS, values):
            anchor = "lm" if align == "left" else "rm"
            colour = TEXT
            if x == 1000:
                change = row.get("change_7d")
                colour = MUTED if change is None else (UP if change > 0 else DOWN if change < 0 else MUTED)
            if x == 1230:
                colour = ACCENT
            draw.text((x, y + 14), fit(draw, value, F["row"], width), font=F["row"], fill=colour, anchor=anchor)
        draw.line((48, y + row_h - 1, W - 48, y + row_h - 1), fill=(23, 35, 68))

    footer(draw, "{} / {} rows · {} · LOO {:.6f} · WF {:.6f} · baseline {:.6f} · coverage {} labelled, {} excluded, {} watchlist · {}".format(
        len(rows[:limit]), len(rows), radar["model_version"], validation["loo_mae_log10"],
        validation["walk_mae_log10"], validation["baseline_mae_log10"],
        coverage["labelled"], coverage["excluded"], coverage["watchlist"], note))
    save(image, path)


def detail_shot(row, radar, path, ages):
    image, draw = canvas()
    validation = radar["validation"]
    coverage = radar["coverage"]
    header(draw, "#{} {}".format(row["rank"], row["slug"]),
           "{} · {} · {}".format(row["name"], row.get("category") or "unclassified",
                                 ", ".join(row.get("chains") or [])))

    evidence = row["evidence"]
    hold = max(0, round((row["hours"] - 3) / 24))
    capital = 500 if row["tvl_usd"] >= 5e9 else 250 if row["tvl_usd"] >= 1e9 else 100 if row["tvl_usd"] >= 1e8 else 50 if row["tvl_usd"] >= 2e7 else 25
    age_days = ages.get(row["slug"])
    chips = [
        ("Implied value", usd(row["implied_value_usd"])),
        ("TVL", usd(row["tvl_usd"])),
        ("7d change", pct(row.get("change_7d"))),
        ("Age", "{} days".format(age_days) if age_days is not None else "unknown"),
        ("Min capital", "${}".format(capital)),
        ("Hold", "{} days".format(hold)),
        ("Cost / hour", "${:.2f}".format(row["cost_per_hour_usd"])),
        ("Fitted log10", "{:.4f}".format(evidence["predicted_log10_mcap"])),
    ]
    chip_w, chip_h, gap = 320, 60, 12
    for i, (key, value) in enumerate(chips):
        x = 48 + (i % 4) * (chip_w + gap)
        y = 122 + (i // 4) * (chip_h + gap)
        draw.rounded_rectangle((x, y, x + chip_w, y + chip_h), radius=8, fill=PANEL2, outline=LINE, width=2)
        draw.text((x + 14, y + 9), key.upper(), font=F["chipkey"], fill=MUTED)
        draw.text((x + 14, y + 29), fit(draw, value, F["chipval"], chip_w - 28),
                  font=F["chipval"], fill=ACCENT if i in (0, 6, 7) else TEXT)

    draw.text((48, 272), "Why this value", font=F["h3"], fill=BLUE)
    y = write_lines(draw, wrap(draw, row["rationale"], F["body"], W - 100), 48, 300, F["body"], TEXT, 25)
    draw.text((48, y + 4), "{} TVL · {:.2f}x sector prior · {} comparable labelled tokens · median {}".format(
        usd(evidence["tvl_usd"]), evidence["sector_prior"], evidence["comparable_count"],
        usd(evidence.get("comparable_median_mcap_usd"))), font=F["small"], fill=MUTED)

    panel_y = max(y + 36, 382)
    draw.text((48, panel_y), "Model check", font=F["h3"], fill=BLUE)
    top, bottom = panel_y + 30, panel_y + 184
    draw.rounded_rectangle((48, top, W - 48, bottom), radius=8, fill=PANEL2, outline=LINE, width=2)
    draw.rectangle((48, top + 8, 52, bottom - 8), fill=BLUE)
    lines = [
        ("Method", validation["method"]),
        ("Labelled / used", "{} / {}".format(validation["labelled"], validation["used"])),
        ("Kept terms", ", ".join(validation["kept_terms"]) or "none"),
        ("Dropped terms", ", ".join(validation["dropped_terms"]) or "none"),
        ("Hold-out LOO MAE", "{:.6f}".format(validation["loo_mae_log10"])),
        ("Walk-forward MAE", "{:.6f}".format(validation["walk_mae_log10"])),
        ("Baseline LOO MAE", "{:.6f}".format(validation["baseline_mae_log10"])),
    ]
    for i, (key, value) in enumerate(lines):
        yy = top + 12 + i * 23
        draw.text((70, yy), key, font=F["panel"], fill=MUTED)
        draw.text((350, yy), fit(draw, value, F["panel"], W - 430), font=F["panel"], fill=TEXT)

    step_head = bottom + 22
    draw.text((48, step_head), "Farm plan · {} all-in over {} hours".format(
        usd(row["cost_usd"]), row["hours"]), font=F["h3"], fill=BLUE)
    yy = step_head + 30
    for step in row["farm_steps"]:
        wrapped = wrap(draw, step, F["step"], W - 130)
        draw.ellipse((52, yy + 2, 64, yy + 14), fill=ACCENT)
        yy = write_lines(draw, wrapped, 78, yy, F["step"], TEXT, 20) + 9

    footer(draw, "{} · {} · coverage: {} protocols, {} labelled, {} board, {} live · fitted from the snapshot's own tokens".format(
        radar["model_version"], radar["as_of"], coverage["total"], coverage["labelled"],
        coverage["board"], coverage["live"]))
    save(image, path)


def save(image, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, "JPEG", quality=92, optimize=True)
    print("{}: {}x{}, {} bytes".format(os.path.basename(path), W, H, os.path.getsize(path)))


def main():
    board, radar = load()
    if not board:
        raise SystemExit("gen_shots: out/board.json has no rows")
    ages = {}
    for row in radar.get("rows", []):
        ages[row["slug"]] = row.get("age_days")
    validation = radar["validation"]
    stats = "LOO {:.6f} / WF {:.6f}".format(validation["loo_mae_log10"], validation["walk_mae_log10"])

    board_shot(board, radar, os.path.join(SHOTS, "1-board.jpg"),
               "Token Launch Radar",
               "Sort: implied value ▾  Filter: All sectors ▾  Watchlist only ☐  Search: …",
               ages, stats)

    detail_shot(board[0], radar, os.path.join(SHOTS, "2-detail.jpg"), ages)

    target = board[0].get("category") or "Unclassified"
    filtered = [row for row in board if (row.get("category") or "Unclassified") == target]
    board_shot(filtered, radar, os.path.join(SHOTS, "3-filtered.jpg"),
               "Token Launch Radar · {}".format(target),
               "Sort: implied value ▾  Filter: {} ▾  Watchlist only ☐  Search: …".format(target),
               ages, "{} only · {}".format(target, stats))


if __name__ == "__main__":
    main()
