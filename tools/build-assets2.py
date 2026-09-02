#!/usr/bin/env python3
"""v0.11: adapta os packs CraftPix de 16px (Main Characters Home, Glassblower's Workshop, Top-Down Dungeon, Orc)
pra client/public/assets. Tudo em 16px é ampliado 2x (vizinho mais próximo) pra casar com a densidade de pixel
do personagem base (que já roda em escala 2). Uso: PACKS=/caminho/dos/packs python3 tools/build-assets2.py
Espera dentro de PACKS as pastas: home/ (Main Characters Home), glass/ (Glassblower), dungeon/, orc/ (Orc pack).
"""
import os, sys, json
from PIL import Image

PACKS = os.environ.get("PACKS", "/root/packs")
HOME = os.path.join(PACKS, "38ceaf74"); GLASS = os.path.join(PACKS, "5b9df23d"); DUNG = os.path.join(PACKS, "4ad188ac"); ORC = os.path.join(PACKS, "63486bec")
for d, alt in ((HOME, "home"), (GLASS, "glass"), (DUNG, "dungeon"), (ORC, "orc")):
    if not os.path.isdir(d): globals()[["HOME", "GLASS", "DUNG", "ORC"][["home", "glass", "dungeon", "orc"].index(alt)]] = os.path.join(PACKS, alt)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "public", "assets")
C = 16

def load(p): return Image.open(p).convert("RGBA")
def x2(im): return im.resize((im.width * 2, im.height * 2), Image.NEAREST)
def cells(im, x0, y0, x1, y1): return im.crop((x0 * C, y0 * C, (x1 + 1) * C, (y1 + 1) * C))
def save(im, sub, name):
    os.makedirs(os.path.join(OUT, sub), exist_ok=True); im.save(os.path.join(OUT, sub, name + ".png"))

# ---------- props (móveis grandes, plantas, tapetes) ----------
home_int = load(os.path.join(HOME, "PNG", "Interior.png"))
glass_obj = load(os.path.join(GLASS, "PNG", "Interior_objects.png"))
exterior = load(os.path.join(HOME, "PNG", "exterior.png"))
PROPS = {
    # nome: (sheet, x0, y0, x1, y1, células bloqueadas w,h contadas de baixo — o resto é "altura" que não bloqueia)
    "bookshelf":     (home_int, 10, 5, 11, 7, 2, 2),
    "shelf_empty":   (home_int, 4, 5, 6, 7, 3, 2),
    "shelf_items":   (home_int, 0, 5, 3, 8, 4, 2),
    "table_round_set": (home_int, 0, 9, 4, 12, 5, 3),
    "table_small":   (home_int, 7, 3, 8, 4, 2, 2),
    "table_oval":    (home_int, 7, 11, 9, 12, 3, 2),
    "chair_front":   (home_int, 0, 13, 0, 14, 1, 1),
    "chair_back":    (home_int, 0, 15, 0, 16, 1, 1),
    "chair_right":   (home_int, 1, 13, 1, 14, 1, 1),
    "chair_left":    (home_int, 3, 13, 3, 14, 1, 1),
    "rug_red":       (home_int, 2, 15, 6, 16, 0, 0),
    "rug_fringe":    (home_int, 8, 16, 9, 17, 0, 0),
    "rug_blue_oval": (home_int, 1, 17, 6, 22, 0, 0),
    "rug_red_round": (home_int, 8, 18, 10, 22, 0, 0),
    "plant_pot":     (home_int, 0, 23, 0, 24, 1, 1),
    "plant_pot2":    (home_int, 2, 23, 2, 24, 1, 1),
    "flower_pot":    (home_int, 4, 23, 4, 24, 1, 1),
    "crate_big":     (home_int, 5, 0, 6, 1, 2, 1),
    "crate_small":   (home_int, 8, 0, 8, 1, 1, 1),
    "barrel":        (home_int, 10, 0, 10, 1, 1, 1),
    "herbs":         (home_int, 5, 13, 6, 14, 0, 0),
    "counter_vases": (glass_obj, 1, 0, 5, 1, 5, 1),
    "counter_plain": (glass_obj, 1, 2, 5, 3, 5, 1),
    "counter_short": (glass_obj, 8, 2, 10, 3, 3, 1),
    "shelf_glass":   (glass_obj, 1, 8, 2, 10, 2, 2),
    "shelf_glass2":  (glass_obj, 4, 8, 5, 10, 2, 2),
    "art_dragon":    (glass_obj, 7, 16, 10, 18, 4, 1),
    "art_tulip":     (glass_obj, 2, 16, 3, 19, 2, 1),
    "lantern":       (glass_obj, 0, 16, 1, 18, 2, 1),
    "planter":       (glass_obj, 11, 16, 12, 18, 2, 1),
    "planter2":      (glass_obj, 1, 20, 3, 22, 3, 1),
    "rug_blue":      (glass_obj, 0, 24, 3, 26, 0, 0),
    "table_wood":    (glass_obj, 0, 29, 1, 30, 2, 2),
    "table_glass":   (glass_obj, 2, 29, 3, 30, 2, 2),
    "table_glass2":  (glass_obj, 6, 29, 7, 30, 2, 2),
    "barrel2":       (glass_obj, 8, 27, 8, 28, 1, 1),
    "bush_big":      (exterior, 0, 11, 2, 13, 3, 2),
    "bush_round":    (exterior, 11, 12, 13, 14, 3, 2),
    "stump":         (exterior, 11, 15, 12, 15, 2, 1),
    "rocks":         (exterior, 12, 7, 13, 7, 2, 1),
}
index = {}
for name, (sheet, x0, y0, x1, y1, bw, bh) in PROPS.items():
    im = x2(cells(sheet, x0, y0, x1, y1))
    save(im, "props", name)
    index[name] = {"w": x1 - x0 + 1, "h": y1 - y0 + 1, "bw": bw, "bh": bh}
json.dump(index, open(os.path.join(OUT, "props", "index.json"), "w"), indent=1)
print("props:", len(index))

# ---------- animações: árvores (13 quadros), fogueira (6), NPCs humanos (12) ----------
trees = load(os.path.join(HOME, "PNG", "Trees_animation.png"))  # 9 colunas de 64x80 (3 espécies x 3 tamanhos), 13 linhas = quadros
TREE_NAMES = ["green_l", "green_m", "green_s", "apple_l", "apple_m", "apple_s", "oak_l", "oak_m", "oak_s"]
for i, n in enumerate(TREE_NAMES):
    frames = [x2(trees.crop((i * 64, r * 80, i * 64 + 64, r * 80 + 80))) for r in range(13)]
    sheet = Image.new("RGBA", (128 * 13, 160), (0, 0, 0, 0))
    for r, f in enumerate(frames): sheet.alpha_composite(f, (r * 128, 0))
    save(sheet, "trees2", n)
fire = load(os.path.join(DUNG, "PNG", "fire_animation.png"))  # 4 colunas de 44px, 6 linhas de 48px; coluna 2 = fogueira grande
sheet = Image.new("RGBA", (88 * 6, 96), (0, 0, 0, 0))
for r in range(6): sheet.alpha_composite(x2(fire.crop((88, r * 48, 132, r * 48 + 48))), (r * 88, 0))
save(sheet, "fx", "campfire")
for name, src, fw, fh in (("customer", os.path.join(GLASS, "PNG", "Customer_without_shadow.png"), 32, 32), ("seller", os.path.join(GLASS, "PNG", "Seller.png"), 32, 32)):
    im = load(src); n = im.width // fw
    sheet = Image.new("RGBA", (fw * 2 * n, fh * 2), (0, 0, 0, 0))
    for c in range(n): sheet.alpha_composite(x2(im.crop((c * fw, 0, c * fw + fw, fh))), (c * fw * 2, 0))
    save(sheet, "npc", name)

# ---------- orc (skin premium): idle 4, walk 6, run 8 quadros de 64x64; linhas 0 frente, 1 costas, 2 esquerda, 3 direita ----------
for st in ("idle", "walk", "run"):
    im = load(os.path.join(ORC, "PNG", "Orc1", "Without_shadow", f"orc1_{st}_without_shadow.png"))
    save(im, "char", f"orc_{st}")
print("ok ->", OUT)
