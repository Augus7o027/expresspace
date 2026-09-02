#!/usr/bin/env python3
"""Converte os packs CraftPix (zips extraídos em tools/src/) para client/public/assets/.

Uso: python3 tools/build-assets.py [pasta-com-os-packs-extraidos]

Gera:
  assets/char/walk.png, idle.png        personagem base 64x64 (4 linhas: frente, esquerda, direita, costas)
  assets/animals/<bicho>_{idle,walk}.png 32x32 (4 linhas: frente, costas, esquerda, direita)
  assets/trees/<nome>.png               árvores com sombra
  assets/graffiti/*.png                 grafites (compostos com a fonte do pack + exemplos)
"""
import glob, os, sys, shutil
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "src")
OUT = os.path.join(os.path.dirname(__file__), "..", "client", "public", "assets")

def find(pattern):
    hits = [p for p in glob.glob(os.path.join(SRC, "**", pattern), recursive=True) if "__MACOSX" not in p]
    if not hits: raise SystemExit(f"não achei {pattern} em {SRC}")
    return hits[0]

def out(*parts):
    p = os.path.join(OUT, *parts); os.makedirs(os.path.dirname(p), exist_ok=True); return p

# ---------- personagem ----------
shutil.copy(find("Unarmed_Walk_without_shadow.png"), out("char", "walk.png"))
shutil.copy(find("Unarmed_Idle_without_shadow.png"), out("char", "idle.png"))

# ---------- animais ----------
ANIMALS = {
    "fox":    ("Fox_Idle_with_shadow.png", "Fox_walk_with_shadow.png"),
    "hare":   ("Hare_Idle_with_shadow.png", "Hare_Walk_with_shadow.png"),
    "deer":   ("Deer_Idle_with_shadow.png", "Deer_Walk_with_shadow.png"),
    "boar":   ("Boar_Idle_with_shadow.png", "Boar_Walk_with_shadow.png"),
    "grouse": ("Black_grouse_Idle_with_shadow.png", "Black_grouse_Walk_with_shadow.png"),
}
for name, (idle, walk) in ANIMALS.items():
    shutil.copy(find(idle), out("animals", f"{name}_idle.png"))
    shutil.copy(find(walk), out("animals", f"{name}_walk.png"))

# ---------- árvores (versão com sombra em textura) ----------
TREES = {
    "tree1": "Tree1.png", "tree2": "Tree2.png", "tree3": "Tree3.png",
    "palm1": "Palm_tree1_1.png", "palm2": "Palm_tree2_1.png",
    "flower1": "Flower_tree1.png", "flower2": "Flower_tree2.png",
    "fruit1": "Fruit_tree1.png", "autumn1": "Autumn_tree1.png", "moss1": "Moss_tree1.png",
}
for name, f in TREES.items():
    shutil.copy(find(os.path.join("Trees_texture_shadow", f)), out("trees", f"{name}.png"))

# ---------- grafite: compõe texto com a fonte do pack ----------
FONT_DIR = os.path.dirname(find(os.path.join("1 Font", "A1.png")))
def letter(ch, variant):
    if ch == " ": return None
    p = os.path.join(FONT_DIR, f"{ch}{variant}.png" if ch.isalpha() else f"{ch}.png")
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None

def tint(im, fill, outline):
    """Fonte vem branca com contorno escuro: recolore preservando alpha."""
    px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            px[x, y] = (fill if r > 128 else outline) + (a,)
    return im

def compose(text, variant=2, fill=(242, 239, 233), outline=(20, 20, 20), spacing=1, scale=1):
    glyphs = [letter(c, variant) for c in text.upper()]
    W = sum((g.width if g else 4) + spacing for g in glyphs) + 6
    H = max(g.height for g in glyphs if g) + 6
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = 3
    for i, g in enumerate(glyphs):
        if g is None: x += 4 + spacing; continue
        g = tint(g.copy(), fill, outline)
        # leve ondulação vertical pra dar cara de tag
        dy = [0, 1, 0, -1][i % 4]
        canvas.alpha_composite(g, (x, 3 + dy))
        x += g.width + spacing
    if scale != 1: canvas = canvas.resize((W * scale, H * scale), Image.NEAREST)
    return canvas

def recolor(im, color):
    """Pinta uma decoração (que vem branca) numa cor, mantendo o alpha."""
    im = im.copy(); px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a: px[x, y] = color + (a,)
    return im

def piece(text, variant=2, fill=(242, 239, 233), outline=(20, 20, 20), blob=(70, 70, 76), decos=()):
    """Texto com um "spray" escuro atrás (mancha de tinta), sombra deslocada e decorações."""
    txt = compose(text, variant, fill, outline)
    pad = 16
    W, H = txt.width + pad * 2, txt.height + pad * 2
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # mancha de fundo: círculos do pack espalhados atrás do texto
    circles = sorted(glob.glob(os.path.join(DECO, "2 Decoratoins", "6 Circles", "*.png")))
    big = [c for c in circles if Image.open(c).size[0] >= 12]
    import random; rnd = random.Random(len(text))
    for i in range(0, txt.width + 8, 9):
        c = recolor(Image.open(rnd.choice(big)).convert("RGBA"), blob)
        base.alpha_composite(c, (pad + i - c.width // 2 - 2, pad + txt.height // 2 - c.height // 2 + rnd.randint(-3, 3)))
    # sombra do texto
    sh = recolor(txt, (10, 10, 10))
    base.alpha_composite(sh, (pad + 1, pad + 2))
    base.alpha_composite(txt, (pad, pad))
    for path, color, (dx, dy) in decos:
        d = recolor(Image.open(path).convert("RGBA"), color) if color else Image.open(path).convert("RGBA")
        base.alpha_composite(d, (pad + dx, pad + dy))
    return base

DECO = os.path.dirname(os.path.dirname(os.path.dirname(find(os.path.join("2 Decoratoins", "1 Spray", "1.png")))))
def deco(folder, i):
    files = sorted(glob.glob(os.path.join(DECO, "2 Decoratoins", folder, "*.png")))
    return files[i % len(files)]

INK = (242, 239, 233)
piece("EXPRESSPACE", decos=[(deco("16 Stars", 2), INK, (-12, -10)), (deco("16 Stars", 1), INK, (78, 12)), (deco("1 Spray", 0), (120, 120, 120), (-8, 12)), (deco("14 Nimbus", 2), INK, (26, -12))]).save(out("graffiti", "expresspace.png"))
piece("N7", variant=1, fill=(255, 255, 255), decos=[(deco("12 Crowns", 3), (240, 199, 110), (3, -9))]).save(out("graffiti", "n7.png"))
piece("SEU PROPRIO ESPACO", fill=(200, 200, 200), blob=(58, 58, 62)).save(out("graffiti", "slogan.png"))
piece("FOCO", variant=1, fill=(240, 199, 110), blob=(80, 68, 40), decos=[(deco("3 Rays", 0), (240, 199, 110), (-10, -4))]).save(out("graffiti", "foco.png"))
piece("CAFE", fill=(232, 224, 208), blob=(86, 70, 56), decos=[(deco("7 Waves", 3), (232, 224, 208), (30, -10))]).save(out("graffiti", "cafe.png"))

# exemplos prontos do pack (coloridos, pra dar vida no terraço)
EX = os.path.dirname(find(os.path.join("4 Examples", "1Band.png")))
for f, name in [("5Greenteam.png", "greenteam"), ("6Benice.png", "benice"), ("8Loot.png", "loot"), ("4Shortway.png", "shortway")]:
    p = os.path.join(EX, f)
    if not os.path.exists(p):
        cands = glob.glob(os.path.join(EX, "*" + name.replace("greenteam", "Green").replace("benice", "BeNice").replace("loot", "Loot").replace("shortway", "Shortway") + "*.png"))
        p = cands[0] if cands else None
    if p: shutil.copy(p, out("graffiti", f"{name}.png"))

with open(out("ASSETS.md"), "w") as f:
    f.write("""# Assets

Pixel art dos packs gratuitos da CraftPix (https://craftpix.net), licença: https://craftpix.net/file-licenses/
- Free Base 4-Direction Male Character (personagem base; roupa, cabelo e pele são pintados em tempo real pelo app)
- Free Top-Down Hunt Animals Pixel Sprite Pack (raposa, lebre, cervo, javali, tetraz)
- Free Top-Down Trees Pixel Art (árvores do terraço)
- Free Graffiti Constructor Pixel Art (fonte e decorações dos grafites; textos compostos por tools/build-assets.py)

Pra regenerar: extraia os zips em tools/src/ e rode `python3 tools/build-assets.py`.
""")
print("ok ->", os.path.abspath(OUT))
for root, _, files in os.walk(OUT):
    for fn in sorted(files): print("  ", os.path.relpath(os.path.join(root, fn), OUT))
