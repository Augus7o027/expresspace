#!/usr/bin/env python3
"""Tileset do escritório em client/public/assets/tiles/office.png (tiles de 32px) + office.json (nome -> id, colisão).

v0.11: tudo é desenhado/recortado em 16px e ampliado 2x, pra ter a mesma densidade de pixel do personagem
(que roda em escala 2). Pisos, paredes, grama, calçada e cerca vêm dos packs CraftPix (Main Characters Home,
Glassblower's Workshop, Top-Down Dungeon); mesas de trabalho, monitores, sofás, telão etc. são desenhados aqui em 16px.
Uso: PACKS=/caminho python3 tools/build-tileset.py   (a versão anterior, 32px procedural, está em build-tileset-v0.9.py)
"""
import json, os, random
from PIL import Image, ImageDraw

T = 16
PACKS = os.environ.get("PACKS", "/root/packs")
HOME = os.path.join(PACKS, "38ceaf74"); GLASS = os.path.join(PACKS, "5b9df23d"); DUNG = os.path.join(PACKS, "4ad188ac")
for var, alt in (("HOME", "home"), ("GLASS", "glass"), ("DUNG", "dungeon")):
    if not os.path.isdir(globals()[var]): globals()[var] = os.path.join(PACKS, alt)
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "public", "assets", "tiles")
os.makedirs(OUT_DIR, exist_ok=True)

def load(p): return Image.open(p).convert("RGBA")
home_walls = load(os.path.join(HOME, "PNG", "walls_floor.png")); glass_walls = load(os.path.join(GLASS, "PNG", "Walls_interior.png"))
dungeon = load(os.path.join(DUNG, "PNG", "walls_floor.png")); exterior = load(os.path.join(HOME, "PNG", "exterior.png"))
ground = load(os.path.join(HOME, "PNG", "ground_grass_details.png")); home_int = load(os.path.join(HOME, "PNG", "Interior.png"))
def cell(sheet, cx, cy): return sheet.crop((cx * T, cy * T, cx * T + T, cy * T + T))
def tint(im, k):
    out = im.copy(); p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]; p[x, y] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)), a)
    return out
def over(base, top): out = base.copy(); out.alpha_composite(top); return out

TILES = []  # (name, image16, collides)
def add(name, im, collides=False): TILES.append((name, im, collides))
def tile(name, collides=False, base=None):
    def deco(fn):
        im = base.copy() if base is not None else Image.new("RGBA", (T, T), (0, 0, 0, 0))
        fn(ImageDraw.Draw(im), im); add(name, im, collides); return fn
    return deco

def hexc(h, a=255): h = h.lstrip("#"); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
def shade(c, k): return (max(0, min(255, int(c[0] * k))), max(0, min(255, int(c[1] * k))), max(0, min(255, int(c[2] * k))), c[3])
def rect(d, x0, y0, x1, y1, c): d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)
def px(im, x, y, c):
    if 0 <= x < T and 0 <= y < T: im.putpixel((x, y), c)
def box(d, x0, y0, x1, y1, fill, outline, top=None):
    rect(d, x0, y0, x1, y1, outline); rect(d, x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill)
    if top: rect(d, x0 + 1, y0 + 1, x1 - 1, y0 + 2, top)

OUT = hexc("#1a1410"); WOOD = hexc("#8a5a3a"); WOOD_D = shade(WOOD, 0.7); WOOD_L = shade(WOOD, 1.25)
METAL = hexc("#6a6e78"); FABRIC = hexc("#4a4656"); INK = hexc("#e8e0d0"); SCREEN = hexc("#28343f")

# ---------- pisos e paredes (packs) ----------
GRASS_K = 0.8
# tábuas da casa (pack Home), escurecidas pra dentro do prédio
add("floor_wood", tint(cell(home_walls, 7, 4), 0.72)); add("floor_wood2", tint(cell(home_walls, 8, 4), 0.72))
add("floor_carpet", cell(home_int, 3, 16)); add("floor_carpet2", cell(home_int, 3, 20))
add("floor_tile", cell(dungeon, 0, 21)); add("floor_deck", cell(home_walls, 7, 4)); add("floor_marble", cell(dungeon, 1, 6))
add("floor_concrete", cell(dungeon, 1, 10)); add("floor_stage", tint(cell(home_walls, 8, 10), 0.8))
@tile("floor_stage_edge", base=tint(cell(home_walls, 8, 10), 0.8))
def _(d, im): rect(d, 0, 13, T, 14, INK); rect(d, 0, 14, T, T, OUT)
grass_base = Image.new("RGBA", (T, T), shade(hexc("#7aad55"), GRASS_K))
add("grass", grass_base)
add("grass2", over(grass_base, tint(cell(ground, 1, 9), GRASS_K)))
add("path", cell(exterior, 1, 9)); add("path_edge", over(grass_base, cell(exterior, 1, 8)))
RUG = hexc("#3a3440")
@tile("rug")
def _(d, im):
    rect(d, 0, 0, T, T, RUG)
    for y in range(1, T, 2):
        for x in range((y // 2 % 2), T, 2): px(im, x, y, shade(RUG, 1.2))
@tile("rug_edge")
def _(d, im):
    rect(d, 0, 0, T, T, RUG); rect(d, 0, 0, T, 1, shade(RUG, 0.7)); rect(d, 0, 1, T, 2, shade(RUG, 1.45))
    for y in range(3, T, 2):
        for x in range((y // 2 % 2), T, 2): px(im, x, y, shade(RUG, 1.2))
# paredes: topo = reboco com borda clara, face = pedra com rodapé
wall_top = cell(glass_walls, 2, 8); wall_face = cell(glass_walls, 2, 10)
add("wall_top", wall_top, True); add("wall_front", wall_face, True); add("wall_front_window", cell(glass_walls, 7, 9), True)
side = wall_top.rotate(90, expand=True)  # borda clara vira lateral esquerda
side_r = side.transpose(Image.FLIP_LEFT_RIGHT)
wall_side = side.copy(); wall_side.paste(side_r.crop((8, 0, 16, 16)), (8, 0))
add("wall_side", wall_side, True)
@tile("wall_lamp", True, base=wall_face)
def _(d, im): rect(d, 7, 2, 9, 6, OUT); d.polygon([(4, 10), (12, 10), (8, 5)], fill=shade(METAL, 0.8), outline=OUT); rect(d, 5, 9, 11, 11, hexc("#fff0c8"))
add("wall_graffiti_bg", wall_face, True)
add("door", tint(cell(glass_walls, 3, 5), 0.75)); add("door_outside", cell(exterior, 1, 9))

# ---------- mesas de trabalho com monitor, cadeiras ----------
def monitor(d, im, x, y):
    box(d, x, y, x + 7, y + 5, SCREEN, OUT); rect(d, x + 1, y + 1, x + 6, y + 2, shade(SCREEN, 1.6)); rect(d, x + 3, y + 5, x + 5, y + 7, OUT); rect(d, x + 2, y + 7, x + 6, y + 8, OUT)
def desk(d, im, left, right):
    rect(d, 0, 6, T, 15, WOOD); rect(d, 0, 6, T, 7, WOOD_L); rect(d, 0, 14, T, 15, WOOD_D); rect(d, 0, 15, T, T, OUT); rect(d, 0, 5, T, 6, OUT)
    if left: rect(d, 0, 5, 1, T, OUT); rect(d, 1, 7, 2, 14, WOOD_D)
    if right: rect(d, 15, 5, T, T, OUT); rect(d, 13, 7, 14, 14, WOOD_L)
@tile("desk_l", True)
def _(d, im): desk(d, im, True, False); monitor(d, im, 5, 0); rect(d, 3, 10, 5, 12, INK)
@tile("desk_m", True)
def _(d, im): desk(d, im, False, False); monitor(d, im, 4, 0); rect(d, 12, 9, 14, 11, hexc("#c8c8c8"))
@tile("desk_r", True)
def _(d, im): desk(d, im, False, True); monitor(d, im, 4, 0); px(im, 12, 10, hexc("#e86a8a")); px(im, 12, 11, shade(WOOD, 0.6))
@tile("chair")
def _(d, im): rect(d, 4, 13, 12, 15, OUT); box(d, 4, 3, 12, 8, FABRIC, OUT, shade(FABRIC, 1.3)); box(d, 3, 7, 13, 12, shade(FABRIC, 1.15), OUT); rect(d, 7, 12, 9, 14, OUT)
@tile("chair_back")
def _(d, im): box(d, 4, 2, 12, 7, shade(FABRIC, 1.15), OUT); box(d, 3, 6, 13, 13, FABRIC, OUT, shade(FABRIC, 1.3)); rect(d, 4, 13, 12, 15, OUT); rect(d, 7, 14, 9, 16, OUT)
# mesas de reunião (peças de tampo)
def top(d, im, l=False, r=False, t=False, b=False):
    rect(d, 0, 0, T, T, WOOD)
    if t: rect(d, 0, 0, T, 1, OUT); rect(d, 0, 1, T, 2, WOOD_L)
    if b: rect(d, 0, 14, T, 15, WOOD_D); rect(d, 0, 15, T, T, OUT)
    if l: rect(d, 0, 0, 1, T, OUT); rect(d, 1, 0, 2, T, WOOD_L)
    if r: rect(d, 15, 0, T, T, OUT); rect(d, 14, 0, 15, T, WOOD_D)
    px(im, 5, 6, WOOD_D); px(im, 10, 9, WOOD_D)
for name, args in [("table_tl", dict(l=1, t=1)), ("table_tr", dict(r=1, t=1)), ("table_bl", dict(l=1, b=1)), ("table_br", dict(r=1, b=1)), ("table_t", dict(t=1)), ("table_b", dict(b=1)),
                   ("table_ml", dict(l=1)), ("table_mr", dict(r=1)), ("table_c", {}), ("table_l", dict(l=1, t=1, b=1)), ("table_m", dict(t=1, b=1)), ("table_r", dict(r=1, t=1, b=1))]:
    tile(name, True)(lambda d, im, a=args: top(d, im, **a))
def sofa(d, im, l, r):
    rect(d, 0, 4, T, 13, FABRIC); rect(d, 0, 4, T, 6, shade(FABRIC, 1.25)); rect(d, 0, 3, T, 4, OUT); rect(d, 0, 13, T, 14, OUT)
    rect(d, 0, 9, T, 10, shade(FABRIC, 0.8)); rect(d, 2, 14, 4, 16, OUT); rect(d, 12, 14, 14, 16, OUT)
    if l: rect(d, 0, 3, 1, 14, OUT); rect(d, 1, 6, 3, 13, shade(FABRIC, 1.35))
    if r: rect(d, 15, 3, T, 14, OUT); rect(d, 13, 6, 15, 13, shade(FABRIC, 1.35))
@tile("sofa_l", True)
def _(d, im): sofa(d, im, True, False)
@tile("sofa_m", True)
def _(d, im): sofa(d, im, False, False)
@tile("sofa_r", True)
def _(d, im): sofa(d, im, False, True)
@tile("bench", True)
def _(d, im): rect(d, 0, 6, T, 11, WOOD); rect(d, 0, 6, T, 7, WOOD_L); rect(d, 0, 5, T, 6, OUT); rect(d, 0, 11, T, 12, OUT); rect(d, 2, 12, 4, 15, OUT); rect(d, 12, 12, 14, 15, OUT)
@tile("bench_park", True, base=grass_base)
def _(d, im): rect(d, 0, 5, T, 10, hexc("#7a6248")); rect(d, 0, 5, T, 6, hexc("#9a8060")); rect(d, 0, 4, T, 5, OUT); rect(d, 0, 10, T, 11, OUT); rect(d, 0, 7, T, 8, OUT); rect(d, 2, 11, 4, 15, OUT); rect(d, 12, 11, 14, 15, OUT)
def counter(d, im, l, r):
    rect(d, 0, 4, T, 15, WOOD_D); rect(d, 0, 4, T, 7, WOOD_L); rect(d, 0, 3, T, 4, OUT); rect(d, 0, 7, T, 8, OUT); rect(d, 0, 15, T, T, OUT)
    for x in range(3, T, 5): rect(d, x, 9, x + 1, 14, shade(WOOD_D, 0.7))
    if l: rect(d, 0, 3, 1, T, OUT)
    if r: rect(d, 15, 3, T, T, OUT)
@tile("counter_l", True)
def _(d, im): counter(d, im, True, False)
@tile("counter_m", True)
def _(d, im): counter(d, im, False, False)
@tile("counter_r", True)
def _(d, im): counter(d, im, False, True)
@tile("plant", True)
def _(d, im):
    box(d, 5, 10, 11, 15, hexc("#8a5a3a"), OUT); rect(d, 5, 10, 11, 11, hexc("#a87048"))
    for (x, y) in [(4, 5), (7, 3), (10, 5), (6, 7), (9, 7), (3, 8), (12, 8)]: rect(d, x, y, x + 3, y + 3, hexc("#3f7a3a")); px(im, x + 1, y + 1, hexc("#5aa04a"))
@tile("plant_small")
def _(d, im): box(d, 6, 11, 10, 15, hexc("#8a5a3a"), OUT); rect(d, 5, 6, 11, 11, hexc("#3f7a3a")); px(im, 7, 7, hexc("#5aa04a")); px(im, 9, 8, hexc("#5aa04a"))
@tile("whiteboard", True)
def _(d, im): box(d, 1, 1, 15, 12, hexc("#e6e2da"), OUT, hexc("#ffffff")); rect(d, 3, 4, 10, 5, hexc("#3a5a9a")); rect(d, 3, 7, 12, 8, hexc("#8a3a3a")); rect(d, 1, 12, 15, 14, METAL)
@tile("tv", True)
def _(d, im): box(d, 1, 2, 15, 12, SCREEN, OUT); rect(d, 2, 3, 14, 5, shade(SCREEN, 1.6)); rect(d, 6, 12, 10, 14, OUT); rect(d, 4, 14, 12, 15, OUT)
@tile("bookshelf", True)
def _(d, im):
    box(d, 1, 0, 15, 15, WOOD_D, OUT); rect(d, 2, 1, 14, 2, WOOD_L)
    for y in (2, 7, 12): rect(d, 2, y + 4, 14, y + 5, WOOD)
    for i, c in enumerate(["#c84a4a", "#4a7ac8", "#e8c84a", "#4aa070", "#f2efe9", "#a84ac8"]): rect(d, 3 + i * 2, 3 + (i % 2), 5 + i * 2, 6, hexc(c)); rect(d, 3 + i * 2, 8, 5 + i * 2, 11, hexc(c) if i % 2 else hexc("#d0c8b0"))
@tile("cooler", True)
def _(d, im): box(d, 4, 0, 12, 6, hexc("#9fd0e8"), OUT); rect(d, 5, 1, 11, 4, hexc("#c8e8f8")); box(d, 3, 6, 13, 15, hexc("#e0e0e0"), OUT); rect(d, 6, 9, 10, 11, hexc("#3a6aa0")); rect(d, 4, 13, 12, 14, hexc("#a0a0a0"))
@tile("coffee", True)
def _(d, im): box(d, 3, 2, 13, 14, hexc("#2a2a2e"), OUT, hexc("#4a4a50")); rect(d, 5, 4, 11, 6, hexc("#6ef0a3")); rect(d, 6, 8, 10, 12, hexc("#3a3a40")); rect(d, 7, 10, 9, 12, hexc("#c8a060")); rect(d, 2, 14, 14, 15, OUT)
@tile("stage_light")
def _(d, im): rect(d, 6, 2, 10, 4, OUT); box(d, 4, 4, 12, 9, hexc("#3a3a40"), OUT); rect(d, 5, 9, 11, 11, hexc("#fff0c8")); rect(d, 6, 11, 10, 13, hexc("#fff0c8", 120))
def screen(d, im, l, r):
    rect(d, 0, 1, T, 12, SCREEN); rect(d, 0, 0, T, 1, OUT); rect(d, 0, 12, T, 13, OUT); rect(d, 0, 2, T, 4, shade(SCREEN, 1.5))
    if l: rect(d, 0, 0, 1, 13, OUT); rect(d, 2, 13, 4, 16, OUT)
    if r: rect(d, 15, 0, T, 13, OUT); rect(d, 12, 13, 14, 16, OUT)
@tile("screen_l", True)
def _(d, im): screen(d, im, True, False)
@tile("screen_m", True)
def _(d, im): screen(d, im, False, False)
@tile("screen_r", True)
def _(d, im): screen(d, im, False, True)
@tile("noticeboard", True)
def _(d, im):
    box(d, 1, 1, 15, 13, hexc("#a87048"), OUT); rect(d, 2, 2, 14, 3, hexc("#c08858"))
    for (x, y, c) in [(3, 4, "#e8e0d0"), (8, 4, "#e8d27a"), (11, 6, "#e86a8a"), (4, 8, "#8fbfd8"), (9, 9, "#e8e0d0")]: rect(d, x, y, x + 3, y + 3, hexc(c)); px(im, x + 1, y, hexc("#b03030"))
@tile("radio", True)
def _(d, im): box(d, 2, 5, 14, 14, hexc("#3a2a20"), OUT, hexc("#4d3a2c")); d.ellipse([4, 7, 7, 10], fill=hexc("#151515"), outline=OUT); d.ellipse([9, 7, 12, 10], fill=hexc("#151515"), outline=OUT); rect(d, 6, 3, 7, 5, OUT); px(im, 8, 12, hexc("#4ae04a"))
@tile("crate", True)
def _(d, im): box(d, 2, 3, 14, 14, WOOD, OUT, WOOD_L); d.line([(3, 4), (13, 13)], fill=WOOD_D); d.line([(13, 4), (3, 13)], fill=WOOD_D)
@tile("flowers", base=grass_base)
def _(d, im):
    for (x, y, c) in [(3, 4, "#e86a8a"), (9, 3, "#f2efe9"), (12, 9, "#e8d27a"), (5, 11, "#e86a8a"), (13, 13, "#f2efe9")]: px(im, x, y, hexc(c)); px(im, x + 1, y, hexc(c)); px(im, x, y + 1, shade(hexc("#7aad55"), 1.1))
add("fence", over(grass_base, cell(exterior, 11, 1)), True)
@tile("lamp_post", True, base=grass_base)
def _(d, im): rect(d, 7, 3, 9, 15, OUT); rect(d, 8, 4, 9, 14, shade(METAL, 0.9)); box(d, 5, 0, 11, 4, hexc("#fff0c8"), OUT); rect(d, 4, 14, 12, 16, OUT)
add("floor_wood3", tint(cell(home_walls, 7, 5), 0.7)); add("floor_concrete2", cell(dungeon, 11, 21))
wte = wall_top.copy(); wte.paste(side_r.crop((8, 0, 16, 16)), (8, 0)); add("wall_top_end", wte, True)
# v0.11: variações e peças novas
add("floor_wood4", tint(cell(home_walls, 8, 5), 0.72)); add("grass3", over(grass_base, tint(cell(ground, 4, 9), GRASS_K))); add("grass_dirt", over(grass_base, tint(cell(ground, 1, 5), GRASS_K)))
add("fence_v", over(grass_base, cell(exterior, 10, 2)), True); add("floor_sand", cell(exterior, 13, 5))
for n, (cx, cy) in {"path_l": (0, 9), "path_r": (2, 9), "path_tl": (0, 8), "path_tr": (2, 8), "path_bl": (0, 10), "path_b": (1, 10), "path_br": (2, 10)}.items(): add(n, over(grass_base, cell(exterior, cx, cy)))

# ---------- monta a imagem em 32px (2x) ----------
COLS = 8
rows = (len(TILES) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS * 32, rows * 32), (0, 0, 0, 0))
index = {}
for i, (name, im, col) in enumerate(TILES):
    sheet.alpha_composite(im.resize((32, 32), Image.NEAREST), ((i % COLS) * 32, (i // COLS) * 32))
    index[name] = {"id": i, "collides": col}
sheet.save(os.path.join(OUT_DIR, "office.png"))
json.dump({"tilewidth": 32, "columns": COLS, "count": len(TILES), "tiles": index}, open(os.path.join(OUT_DIR, "office.json"), "w"), indent=1, ensure_ascii=False)
print(f"{len(TILES)} tiles -> {OUT_DIR}/office.png ({sheet.width}x{sheet.height})")
