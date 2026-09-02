#!/usr/bin/env python3
"""Desenha o tileset do escritório em pixel art (tiles de 32px) em client/public/assets/tiles/office.png
e escreve office.json com o índice nome -> id e quais tiles colidem.

Estilo: contorno escuro, 3 tons por material, paleta quente/escura pra casar com o personagem da CraftPix.
Uso: python3 tools/build-tileset.py
"""
import json, os, random
from PIL import Image, ImageDraw

T = 32
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public", "assets", "tiles")
os.makedirs(OUT_DIR, exist_ok=True)

TILES = []  # (name, image, collides)
def tile(name, collides=False):
    def deco(fn):
        im = Image.new("RGBA", (T, T), (0, 0, 0, 0))
        fn(ImageDraw.Draw(im), im)
        TILES.append((name, im, collides))
        return fn
    return deco

def hexc(h, a=255):
    h = h.lstrip("#"); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
def shade(c, k):
    return (max(0, min(255, int(c[0] * k))), max(0, min(255, int(c[1] * k))), max(0, min(255, int(c[2] * k))), c[3])
def rect(d, x0, y0, x1, y1, c): d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)
def px(im, x, y, c):
    if 0 <= x < T and 0 <= y < T: im.putpixel((x, y), c)
def box(d, x0, y0, x1, y1, fill, outline, top=None):
    """caixa com contorno de 1px e brilho no topo"""
    rect(d, x0, y0, x1, y1, outline)
    rect(d, x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill)
    if top: rect(d, x0 + 1, y0 + 1, x1 - 1, y0 + 2, top)

OUT = hexc("#14100c")     # contorno
WOOD = hexc("#4a3423"); WOOD_D = shade(WOOD, 0.75); WOOD_L = shade(WOOD, 1.25)
FLOOR_WOOD = hexc("#2b1f16"); CARPET = hexc("#20222b"); TILEF = hexc("#262626"); DECK = hexc("#3a2a1c"); MARBLE = hexc("#2c2c2e")
CONCRETE = hexc("#1f1f22"); GRASS = hexc("#2f5a2c"); PATH = hexc("#4a4640"); STAGE = hexc("#3a3128")
WALL = hexc("#3a3a40"); WALL_TOP = hexc("#55555c"); METAL = hexc("#5a5d66"); FABRIC = hexc("#3b3a44"); INK = hexc("#e8e0d0")
GLASS = hexc("#243040")

rnd = random.Random(7)

# ---------- pisos ----------
@tile("floor_wood")
def _(d, im):
    rect(d, 0, 0, T, T, FLOOR_WOOD)
    for y in range(0, T, 8):
        rect(d, 0, y, T, y + 1, shade(FLOOR_WOOD, 0.6))
        rect(d, 0, y + 1, T, y + 2, shade(FLOOR_WOOD, 1.15))
        off = (y // 8 % 2) * 16
        px(im, (off + 5) % T, y + 4, shade(FLOOR_WOOD, 0.7)); px(im, (off + 21) % T, y + 5, shade(FLOOR_WOOD, 0.7))
@tile("floor_wood2")
def _(d, im):
    rect(d, 0, 0, T, T, shade(FLOOR_WOOD, 1.08))
    for y in range(0, T, 8):
        rect(d, 0, y, T, y + 1, shade(FLOOR_WOOD, 0.6)); rect(d, 0, y + 1, T, y + 2, shade(FLOOR_WOOD, 1.2))
        px(im, 12, y + 4, shade(FLOOR_WOOD, 0.75))
@tile("floor_carpet")
def _(d, im):
    rect(d, 0, 0, T, T, CARPET)
    for y in range(0, T, 2):
        for x in range((y // 2) % 2, T, 2): px(im, x, y, shade(CARPET, 1.12))
@tile("floor_carpet2")
def _(d, im):
    rect(d, 0, 0, T, T, shade(CARPET, 0.9))
    for y in range(0, T, 4):
        for x in range(0, T, 4): px(im, x + (y // 4 % 2) * 2, y, shade(CARPET, 1.2))
@tile("floor_tile")
def _(d, im):
    rect(d, 0, 0, T, T, TILEF)
    rect(d, 0, 0, 16, 16, shade(TILEF, 1.15)); rect(d, 16, 16, T, T, shade(TILEF, 1.15))
    for i in (0, 16): rect(d, i, 0, i + 1, T, shade(TILEF, 0.6)); rect(d, 0, i, T, i + 1, shade(TILEF, 0.6))
@tile("floor_deck")
def _(d, im):
    rect(d, 0, 0, T, T, DECK)
    for x in range(0, T, 8):
        rect(d, x, 0, x + 1, T, shade(DECK, 0.55)); rect(d, x + 1, 0, x + 2, T, shade(DECK, 1.15))
        px(im, x + 4, (x * 3) % T, shade(DECK, 0.7))
@tile("floor_marble")
def _(d, im):
    rect(d, 0, 0, T, T, MARBLE)
    rect(d, 0, 0, T, 1, shade(MARBLE, 1.3)); rect(d, 0, 0, 1, T, shade(MARBLE, 1.3))
    for i in range(6): px(im, (i * 7 + 3) % T, (i * 11 + 5) % T, shade(MARBLE, 1.35))
    d.line([(4, 28), (28, 4)], fill=shade(MARBLE, 1.18))
@tile("floor_concrete")
def _(d, im):
    rect(d, 0, 0, T, T, CONCRETE)
    for i in range(10): px(im, rnd.randrange(T), rnd.randrange(T), shade(CONCRETE, 1.2))
    rect(d, 0, 0, T, 1, shade(CONCRETE, 0.7))
@tile("floor_stage")
def _(d, im):
    rect(d, 0, 0, T, T, STAGE)
    for y in range(0, T, 8): rect(d, 0, y, T, y + 1, shade(STAGE, 0.6)); rect(d, 0, y + 1, T, y + 2, shade(STAGE, 1.15))
@tile("floor_stage_edge")
def _(d, im):
    rect(d, 0, 0, T, T, STAGE)
    for y in range(0, T, 8): rect(d, 0, y, T, y + 1, shade(STAGE, 0.6))
    rect(d, 0, 26, T, 28, INK); rect(d, 0, 28, T, T, OUT)
@tile("grass")
def _(d, im):
    rect(d, 0, 0, T, T, GRASS)
    for i in range(14): px(im, rnd.randrange(T), rnd.randrange(T), shade(GRASS, 1.25))
    for i in range(8): px(im, rnd.randrange(T), rnd.randrange(T), shade(GRASS, 0.8))
@tile("grass2")
def _(d, im):
    rect(d, 0, 0, T, T, shade(GRASS, 0.97))
    for i in range(6):
        x, y = rnd.randrange(2, 30), rnd.randrange(2, 30)
        px(im, x, y, shade(GRASS, 1.4)); px(im, x, y - 1, shade(GRASS, 1.3)); px(im, x + 1, y, shade(GRASS, 1.2))
    px(im, 8, 20, hexc("#e8d27a")); px(im, 22, 9, hexc("#f2efe9"))
@tile("path")
def _(d, im):
    rect(d, 0, 0, T, T, PATH)
    rect(d, 0, 0, T, 1, shade(PATH, 0.7)); rect(d, 0, 16, T, 17, shade(PATH, 0.7)); rect(d, 16, 0, 17, 16, shade(PATH, 0.7)); rect(d, 0, 16, 1, T, shade(PATH, 0.7))
    rect(d, 1, 1, 16, 2, shade(PATH, 1.15)); rect(d, 17, 17, T, 18, shade(PATH, 1.15))
@tile("path_edge")
def _(d, im):
    rect(d, 0, 0, T, T, GRASS); rect(d, 0, 8, T, T, PATH); rect(d, 0, 8, T, 9, shade(PATH, 1.3)); rect(d, 0, 7, T, 8, OUT)
    for i in range(5): px(im, rnd.randrange(T), rnd.randrange(0, 7), shade(GRASS, 1.25))
RUG = hexc("#2e2a2a")
@tile("rug")
def _(d, im):
    rect(d, 0, 0, T, T, RUG)
    for y in range(2, T, 4):
        for x in range((y // 4 % 2) * 2, T, 4): px(im, x, y, shade(RUG, 1.25))
@tile("rug_edge")
def _(d, im):
    rect(d, 0, 0, T, T, RUG); rect(d, 0, 0, T, 3, shade(RUG, 0.7)); rect(d, 0, 3, T, 4, hexc("#8a7a60"))
    for y in range(6, T, 4):
        for x in range((y // 4 % 2) * 2, T, 4): px(im, x, y, shade(RUG, 1.25))

# ---------- paredes ----------
@tile("wall_top", True)
def _(d, im):
    rect(d, 0, 0, T, T, WALL_TOP); rect(d, 0, 0, T, 2, shade(WALL_TOP, 1.3)); rect(d, 0, T - 2, T, T, shade(WALL_TOP, 0.7))
    rect(d, 0, 0, 1, T, shade(WALL_TOP, 1.15)); rect(d, T - 1, 0, T, T, shade(WALL_TOP, 0.75))
@tile("wall_front", True)
def _(d, im):
    rect(d, 0, 0, T, T, WALL); rect(d, 0, 0, T, 3, shade(WALL, 1.35))
    for y in range(6, 26, 6): rect(d, 0, y, T, y + 1, shade(WALL, 0.85))
    rect(d, 0, 26, T, T, shade(WALL, 0.55)); rect(d, 0, 26, T, 27, shade(WALL, 1.1))
@tile("wall_front_window", True)
def _(d, im):
    rect(d, 0, 0, T, T, WALL); rect(d, 0, 0, T, 3, shade(WALL, 1.35)); rect(d, 0, 26, T, T, shade(WALL, 0.55))
    box(d, 3, 5, 29, 23, GLASS, OUT); rect(d, 4, 6, 28, 8, shade(GLASS, 1.6)); rect(d, 15, 6, 17, 22, OUT); rect(d, 4, 13, 28, 14, OUT)
    px(im, 6, 10, hexc("#8fa8c8")); px(im, 7, 10, hexc("#8fa8c8")); px(im, 6, 11, hexc("#8fa8c8"))
@tile("wall_side", True)
def _(d, im):
    rect(d, 0, 0, T, T, WALL_TOP); rect(d, 0, 0, 3, T, shade(WALL_TOP, 1.3)); rect(d, T - 3, 0, T, T, shade(WALL_TOP, 0.7))
@tile("wall_lamp", True)
def _(d, im):
    rect(d, 0, 0, T, T, WALL); rect(d, 0, 0, T, 3, shade(WALL, 1.35)); rect(d, 0, 26, T, T, shade(WALL, 0.55))
    rect(d, 15, 6, 17, 12, OUT); d.polygon([(8, 20), (24, 20), (16, 11)], fill=shade(METAL, 0.8), outline=OUT); rect(d, 10, 19, 22, 21, hexc("#fff0c8"))
@tile("wall_graffiti_bg", True)
def _(d, im):
    rect(d, 0, 0, T, T, WALL); rect(d, 0, 0, T, 3, shade(WALL, 1.35)); rect(d, 0, 26, T, T, shade(WALL, 0.55))
    for y in range(5, 25, 5): rect(d, 0, y, T, y + 1, shade(WALL, 0.8)); rect(d, (y * 3) % 16, y + 1, (y * 3) % 16 + 1, y + 5, shade(WALL, 0.8))
@tile("door")
def _(d, im):
    rect(d, 0, 0, T, T, shade(WOOD, 0.75)); rect(d, 0, 0, T, 1, shade(WOOD, 1.1)); rect(d, 0, 31, T, T, shade(WOOD, 0.5))
    for y in range(0, T, 8): rect(d, 0, y, T, y + 1, shade(WOOD, 0.55))
@tile("door_outside")
def _(d, im):
    rect(d, 0, 0, T, T, PATH); rect(d, 0, 0, T, 2, shade(PATH, 1.3)); rect(d, 0, 2, 2, T, OUT); rect(d, 30, 2, T, T, OUT)

# ---------- móveis ----------
@tile("desk_l", True)
def _(d, im):
    box(d, 2, 6, T, 28, WOOD, OUT, WOOD_L); rect(d, 2, 28, 5, T, OUT)
    box(d, 12, 7, 26, 17, hexc("#101418"), OUT); rect(d, 13, 8, 25, 15, hexc("#2c3444")); rect(d, 14, 9, 22, 10, hexc("#6e7fa0")); rect(d, 18, 17, 20, 19, OUT)
    box(d, 10, 21, 26, 25, shade(METAL, 0.7), OUT)
@tile("desk_m", True)
def _(d, im):
    box(d, 0, 6, T, 28, WOOD, OUT, WOOD_L); rect(d, 0, 6, T, 7, OUT); rect(d, 0, 7, T, 8, WOOD_L)
    rect(d, 0, 7, 1, 27, WOOD); rect(d, 31, 7, T, 27, WOOD)
    box(d, 9, 7, 23, 17, hexc("#101418"), OUT); rect(d, 10, 8, 22, 15, hexc("#2c3444")); rect(d, 11, 9, 19, 10, hexc("#6e7fa0")); rect(d, 15, 17, 17, 19, OUT)
    box(d, 8, 21, 24, 25, shade(METAL, 0.7), OUT)
@tile("desk_r", True)
def _(d, im):
    box(d, 0, 6, 30, 28, WOOD, OUT, WOOD_L); rect(d, 0, 7, 1, 27, WOOD); rect(d, 27, 28, 30, T, OUT)
    box(d, 6, 7, 20, 17, hexc("#101418"), OUT); rect(d, 7, 8, 19, 15, hexc("#2c3444")); rect(d, 8, 9, 16, 10, hexc("#6e7fa0")); rect(d, 12, 17, 14, 19, OUT)
    box(d, 5, 21, 21, 25, shade(METAL, 0.7), OUT)
@tile("chair")
def _(d, im):
    rect(d, 9, 26, 24, 29, shade(OUT, 1.0)); box(d, 8, 8, 24, 16, FABRIC, OUT, shade(FABRIC, 1.3)); box(d, 7, 15, 25, 24, shade(FABRIC, 1.15), OUT)
    rect(d, 14, 24, 18, 27, OUT)
@tile("table_tl", True)
def _(d, im):
    rect(d, 4, 4, T, T, OUT); rect(d, 5, 5, T, T, WOOD); rect(d, 6, 5, T, 7, WOOD_L); rect(d, 8, 8, T, T, shade(WOOD, 1.08))
@tile("table_tr", True)
def _(d, im):
    rect(d, 0, 4, 28, T, OUT); rect(d, 0, 5, 27, T, WOOD); rect(d, 0, 5, 26, 7, WOOD_L); rect(d, 0, 8, 24, T, shade(WOOD, 1.08))
@tile("table_bl", True)
def _(d, im):
    rect(d, 4, 0, T, 28, OUT); rect(d, 5, 0, T, 27, WOOD); rect(d, 8, 0, T, 24, shade(WOOD, 1.08)); rect(d, 5, 24, T, 27, WOOD_D)
@tile("table_br", True)
def _(d, im):
    rect(d, 0, 0, 28, 28, OUT); rect(d, 0, 0, 27, 27, WOOD); rect(d, 0, 0, 24, 24, shade(WOOD, 1.08)); rect(d, 0, 24, 27, 27, WOOD_D)
@tile("table_t", True)
def _(d, im):
    rect(d, 0, 4, T, T, OUT); rect(d, 0, 5, T, T, WOOD); rect(d, 0, 5, T, 7, WOOD_L); rect(d, 0, 8, T, T, shade(WOOD, 1.08))
@tile("table_b", True)
def _(d, im):
    rect(d, 0, 0, T, 28, OUT); rect(d, 0, 0, T, 27, WOOD); rect(d, 0, 0, T, 24, shade(WOOD, 1.08)); rect(d, 0, 24, T, 27, WOOD_D)
@tile("table_ml", True)
def _(d, im):
    rect(d, 4, 0, T, T, OUT); rect(d, 5, 0, T, T, WOOD); rect(d, 8, 0, T, T, shade(WOOD, 1.08))
@tile("table_mr", True)
def _(d, im):
    rect(d, 0, 0, 28, T, OUT); rect(d, 0, 0, 27, T, WOOD); rect(d, 0, 0, 24, T, shade(WOOD, 1.08))
@tile("table_c", True)
def _(d, im):
    rect(d, 0, 0, T, T, shade(WOOD, 1.08)); rect(d, 8, 8, 24, 20, INK); rect(d, 10, 10, 22, 11, shade(INK, 0.6)); rect(d, 10, 13, 20, 14, shade(INK, 0.6))
@tile("table_l", True)
def _(d, im):
    rect(d, 4, 6, T, 26, OUT); rect(d, 5, 7, T, 25, WOOD); rect(d, 6, 7, T, 9, WOOD_L); rect(d, 8, 10, T, 22, shade(WOOD, 1.08)); rect(d, 5, 26, 8, 29, OUT)
@tile("table_m", True)
def _(d, im):
    rect(d, 0, 6, T, 26, OUT); rect(d, 0, 7, T, 25, WOOD); rect(d, 0, 7, T, 9, WOOD_L); rect(d, 0, 10, T, 22, shade(WOOD, 1.08))
    box(d, 8, 11, 24, 20, hexc("#151515"), OUT); rect(d, 9, 12, 23, 18, hexc("#2c3444"))
@tile("table_r", True)
def _(d, im):
    rect(d, 0, 6, 28, 26, OUT); rect(d, 0, 7, 27, 25, WOOD); rect(d, 0, 7, 26, 9, WOOD_L); rect(d, 0, 10, 24, 22, shade(WOOD, 1.08)); rect(d, 24, 26, 27, 29, OUT)
    rect(d, 6, 13, 16, 20, INK); rect(d, 8, 15, 14, 16, shade(INK, 0.6))
@tile("sofa_l", True)
def _(d, im):
    box(d, 3, 6, T, 26, FABRIC, OUT, shade(FABRIC, 1.35)); rect(d, 4, 13, T, 22, shade(FABRIC, 1.15)); rect(d, 4, 7, 7, 25, shade(FABRIC, 1.25))
@tile("sofa_m", True)
def _(d, im):
    box(d, 0, 6, T, 26, FABRIC, OUT, shade(FABRIC, 1.35)); rect(d, 0, 7, T, 25, FABRIC); rect(d, 0, 7, T, 9, shade(FABRIC, 1.35)); rect(d, 0, 13, T, 22, shade(FABRIC, 1.15)); rect(d, 15, 13, 16, 22, OUT)
@tile("sofa_r", True)
def _(d, im):
    box(d, 0, 6, 29, 26, FABRIC, OUT, shade(FABRIC, 1.35)); rect(d, 0, 7, 1, 25, FABRIC); rect(d, 0, 13, 28, 22, shade(FABRIC, 1.15)); rect(d, 25, 7, 28, 25, shade(FABRIC, 1.25))
@tile("bench", True)
def _(d, im):
    box(d, 0, 10, T, 22, WOOD, OUT, WOOD_L); rect(d, 0, 11, T, 21, WOOD); rect(d, 0, 11, T, 13, WOOD_L); rect(d, 0, 16, T, 17, OUT); rect(d, 3, 22, 6, 26, OUT); rect(d, 26, 22, 29, 26, OUT)
@tile("bench_park", True)
def _(d, im):
    box(d, 0, 8, T, 14, WOOD, OUT, WOOD_L); box(d, 0, 16, T, 22, WOOD, OUT, WOOD_L); rect(d, 2, 22, 5, 27, OUT); rect(d, 27, 22, 30, 27, OUT); rect(d, 2, 14, 5, 16, OUT); rect(d, 27, 14, 30, 16, OUT)
@tile("counter_l", True)
def _(d, im):
    box(d, 3, 4, T, 28, WOOD_D, OUT, WOOD_L); rect(d, 4, 5, T, 11, WOOD); rect(d, 4, 11, T, 12, OUT); rect(d, 10, 6, 14, 10, INK); rect(d, 18, 6, 22, 10, INK)
@tile("counter_m", True)
def _(d, im):
    box(d, 0, 4, T, 28, WOOD_D, OUT, WOOD_L); rect(d, 0, 5, T, 11, WOOD); rect(d, 0, 11, T, 12, OUT); rect(d, 0, 5, T, 6, WOOD_L)
    box(d, 8, 5, 24, 11, hexc("#151515"), OUT); rect(d, 10, 6, 22, 8, hexc("#2a2a2a")); px(im, 12, 9, hexc("#ff6a4a"))
@tile("counter_r", True)
def _(d, im):
    box(d, 0, 4, 29, 28, WOOD_D, OUT, WOOD_L); rect(d, 0, 5, 28, 11, WOOD); rect(d, 0, 11, 28, 12, OUT); rect(d, 8, 6, 12, 10, INK); rect(d, 14, 7, 18, 10, shade(INK, 0.8))
@tile("plant", True)
def _(d, im):
    box(d, 10, 20, 22, 30, hexc("#3a2a20"), OUT, hexc("#4d3a2c"))
    for (x, y, r, c) in [(16, 14, 7, "#3f6a3a"), (11, 11, 4, "#4f7f48"), (21, 12, 4, "#4f7f48"), (16, 8, 4, "#6a9a5e")]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=hexc(c), outline=OUT)
    px(im, 14, 7, hexc("#8fbf80"))
@tile("plant_small")
def _(d, im):
    box(d, 12, 22, 20, 29, hexc("#3a2a20"), OUT); d.ellipse([9, 12, 23, 24], fill=hexc("#4f7f48"), outline=OUT); px(im, 13, 14, hexc("#8fbf80"))
@tile("whiteboard", True)
def _(d, im):
    box(d, 2, 4, 30, 24, INK, OUT); rect(d, 3, 5, 29, 6, hexc("#ffffff")); rect(d, 6, 9, 20, 10, hexc("#333333")); rect(d, 6, 13, 24, 14, hexc("#333333")); rect(d, 6, 17, 14, 18, hexc("#b03030")); rect(d, 2, 24, 30, 27, shade(METAL, 0.8))
@tile("tv", True)
def _(d, im):
    box(d, 1, 3, 31, 21, hexc("#0d1018"), OUT); rect(d, 3, 5, 29, 19, hexc("#101a26")); rect(d, 5, 7, 14, 8, hexc("#3f5a80")); rect(d, 14, 21, 18, 25, OUT); rect(d, 8, 25, 24, 27, OUT)
@tile("bookshelf", True)
def _(d, im):
    box(d, 3, 2, 29, 30, hexc("#33241a"), OUT, WOOD_L)
    for y in (6, 14, 22):
        rect(d, 4, y + 6, 28, y + 7, WOOD_D)
        x = 5
        for c in ("#8a3a3a", "#3a5a8a", "#e8e0d0", "#5a7a3a", "#8a6a2a", "#3a3a3a"):
            w = 3 if (x + y) % 2 else 4
            rect(d, x, y, x + w, y + 6, hexc(c)); x += w + 1
            if x > 26: break
@tile("cooler", True)
def _(d, im):
    box(d, 10, 12, 22, 30, hexc("#d8dce4"), OUT); box(d, 11, 2, 21, 13, hexc("#7fb3d8"), OUT); rect(d, 12, 3, 16, 8, hexc("#a9d0ea")); px(im, 13, 22, hexc("#4aa0e0")); px(im, 18, 22, hexc("#e04a4a"))
@tile("coffee", True)
def _(d, im):
    box(d, 8, 6, 24, 28, hexc("#2a2a2e"), OUT, shade(METAL, 1.1)); rect(d, 10, 8, 22, 12, hexc("#101010")); px(im, 11, 9, hexc("#4ae04a")); rect(d, 13, 18, 19, 24, INK); rect(d, 14, 17, 18, 18, hexc("#5a3a1a"))
@tile("stage_light")
def _(d, im):
    rect(d, 15, 0, 17, 8, OUT); d.polygon([(8, 16), (24, 16), (16, 8)], fill=shade(METAL, 0.8), outline=OUT); rect(d, 10, 15, 22, 17, hexc("#fff0c8"))
@tile("screen_l", True)
def _(d, im):
    box(d, 2, 3, T, 23, hexc("#0d1018"), OUT); rect(d, 4, 5, T, 21, hexc("#101a26")); rect(d, 6, 7, 20, 8, hexc("#3f5a80")); rect(d, 2, 23, T, 26, shade(METAL, 0.7))
@tile("screen_m", True)
def _(d, im):
    rect(d, 0, 3, T, 23, OUT); rect(d, 0, 5, T, 21, hexc("#101a26")); rect(d, 0, 4, T, 5, hexc("#0d1018")); rect(d, 0, 21, T, 23, hexc("#0d1018")); rect(d, 0, 23, T, 26, shade(METAL, 0.7))
    rect(d, 4, 10, 28, 11, hexc("#243a5a")); rect(d, 4, 14, 20, 15, hexc("#243a5a"))
@tile("screen_r", True)
def _(d, im):
    box(d, 0, 3, 30, 23, hexc("#0d1018"), OUT); rect(d, 0, 5, 28, 21, hexc("#101a26")); rect(d, 0, 23, 30, 26, shade(METAL, 0.7)); px(im, 26, 19, hexc("#4ae04a"))
@tile("noticeboard", True)
def _(d, im):
    box(d, 2, 4, 30, 26, hexc("#7a5a3a"), OUT, hexc("#9a7a52"))
    for (x, y, c) in [(5, 7, "#e8e0d0"), (14, 8, "#e8d27a"), (21, 12, "#e86a8a"), (7, 16, "#8fbfd8"), (17, 17, "#e8e0d0")]:
        rect(d, x, y, x + 7, y + 6, hexc(c)); px(im, x + 3, y, hexc("#b03030"))
@tile("radio", True)
def _(d, im):
    box(d, 4, 10, 28, 28, hexc("#3a2a20"), OUT, hexc("#4d3a2c")); d.ellipse([7, 14, 15, 22], fill=hexc("#151515"), outline=OUT); d.ellipse([17, 14, 25, 22], fill=hexc("#151515"), outline=OUT)
    rect(d, 12, 6, 14, 10, OUT); px(im, 16, 24, hexc("#4ae04a"))
@tile("crate", True)
def _(d, im):
    box(d, 4, 6, 28, 28, WOOD, OUT, WOOD_L); d.line([(5, 7), (27, 27)], fill=WOOD_D); d.line([(27, 7), (5, 27)], fill=WOOD_D); rect(d, 4, 16, 28, 17, WOOD_D)
@tile("flowers")
def _(d, im):
    rect(d, 0, 0, T, T, GRASS)
    for (x, y, c) in [(6, 8, "#e86a8a"), (18, 6, "#f2efe9"), (24, 18, "#e8d27a"), (10, 22, "#e86a8a"), (26, 27, "#f2efe9")]:
        px(im, x, y, hexc(c)); px(im, x + 1, y, hexc(c)); px(im, x, y + 1, hexc(c)); px(im, x + 1, y + 1, hexc(c)); px(im, x, y + 2, shade(GRASS, 1.3))
@tile("fence", True)
def _(d, im):
    rect(d, 0, 0, T, T, GRASS)
    for x in (2, 12, 22): box(d, x, 6, x + 4, 26, hexc("#6a5a48"), OUT, hexc("#8a7a60"))
    rect(d, 0, 10, T, 12, hexc("#6a5a48")); rect(d, 0, 18, T, 20, hexc("#6a5a48"))
@tile("lamp_post", True)
def _(d, im):
    rect(d, 0, 0, T, T, GRASS); rect(d, 14, 6, 18, 30, OUT); rect(d, 15, 8, 17, 28, shade(METAL, 0.9)); box(d, 10, 1, 22, 8, hexc("#fff0c8"), OUT); rect(d, 8, 28, 24, 31, OUT)

# ---------- monta a imagem ----------
COLS = 8
rows = (len(TILES) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS * T, rows * T), (0, 0, 0, 0))
index = {}
for i, (name, im, col) in enumerate(TILES):
    sheet.alpha_composite(im, ((i % COLS) * T, (i // COLS) * T))
    index[name] = {"id": i, "collides": col}
sheet.save(os.path.join(OUT_DIR, "office.png"))
json.dump({"tilewidth": T, "columns": COLS, "count": len(TILES), "tiles": index}, open(os.path.join(OUT_DIR, "office.json"), "w"), indent=1, ensure_ascii=False)
print(f"{len(TILES)} tiles -> {OUT_DIR}/office.png ({sheet.width}x{sheet.height})")
