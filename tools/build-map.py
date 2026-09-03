#!/usr/bin/env python3
"""Monta o mapa da sede no formato do Tiled (JSON) em client/public/maps/sede.json.

Depois de gerado, o arquivo abre no Tiled (mapeditor.org) e pode ser editado à vontade:
camadas de tiles (ground, walls, furniture) + camadas de objetos (zones, objects, decor, npcs, graffiti, meta).
O app lê este JSON tanto no servidor (colisão, zonas) quanto no cliente (desenho).

Uso: python3 tools/build-map.py   (roda build-tileset.py antes se precisar)
"""
import json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
TS = json.load(open(os.path.join(ROOT, "client", "public", "assets", "tiles", "office.json")))
PROPIDX = json.load(open(os.path.join(ROOT, "client", "public", "assets", "props", "index.json")))
TILE = TS["tilewidth"]; COLS = TS["columns"]
def gid(name): return TS["tiles"][name]["id"] + 1   # Tiled: gid = id + firstgid(1)

W, H = 58, 50
rnd = random.Random(3)

# ---------- definição da sede (mesma planta da v0.4 + Jardim) ----------
ZONES = [
    dict(id="recepcao", name="Recepção", kind="open", x=1, y=1, w=12, h=9, floor="floor_marble"),
    dict(id="openspace", name="Open Space", kind="open", x=1, y=11, w=22, h=14, floor="floor_wood"),
    dict(id="cafe", name="Café", kind="open", x=1, y=26, w=12, h=11, floor="floor_tile"),
    dict(id="lounge", name="Lounge", kind="open", x=14, y=26, w=9, h=11, floor="floor_wood2"),
    dict(id="foco", name="Foco", kind="silent", x=14, y=1, w=9, h=9, floor="floor_carpet2"),
    dict(id="reuniao-1", name="Reunião 1", kind="meeting", x=24, y=1, w=10, h=8, floor="floor_carpet"),
    dict(id="reuniao-2", name="Reunião 2", kind="meeting", x=35, y=1, w=10, h=8, floor="floor_carpet"),
    dict(id="diretoria", name="Diretoria", kind="meeting", x=46, y=1, w=11, h=8, floor="floor_carpet"),
    dict(id="auditorio", name="Auditório", kind="stage", x=24, y=10, w=33, h=14, floor="floor_concrete", stage=dict(x=26, y=11, w=29, h=2)),
    dict(id="reuniao-3", name="Reunião 3", kind="meeting", x=24, y=25, w=10, h=12, floor="floor_carpet"),
    dict(id="terraco", name="Terraço", kind="open", x=35, y=25, w=22, h=12, floor="floor_deck"),
    dict(id="jardim", name="Jardim", kind="open", x=1, y=38, w=56, h=11, floor="grass"),
]
SPAWN = (5, 6)
WALLS = [  # (x, y, w, h, door)
    (13, 0, 1, 11, False), (13, 4, 1, 2, True),
    (0, 10, 24, 1, False), (5, 10, 2, 1, True), (17, 10, 2, 1, True),
    (23, 0, 1, 38, False), (23, 5, 1, 2, True), (23, 16, 1, 3, True), (23, 30, 1, 2, True),
    (34, 0, 1, 10, False), (45, 0, 1, 10, False),
    (24, 9, 34, 1, False), (28, 9, 2, 1, True), (39, 9, 2, 1, True), (50, 9, 2, 1, True),
    (24, 24, 34, 1, False), (28, 24, 2, 1, True), (44, 24, 3, 1, True),
    (34, 25, 1, 13, False), (34, 30, 1, 2, True),
    (0, 25, 24, 1, False), (5, 25, 2, 1, True), (17, 25, 2, 1, True),
    (13, 26, 1, 12, False), (13, 31, 1, 2, True),
    (0, 37, 58, 1, False), (6, 37, 2, 1, True), (18, 37, 2, 1, True), (45, 37, 2, 1, True),   # parede de fundo do prédio
    (0, 0, 58, 1, False), (0, 0, 1, 38, False), (57, 0, 1, 38, False),                           # paredes externas
]
PROPS = [  # (kind, x, y, w, h) — móveis feitos de tiles (mesas de trabalho, mesas de reunião, sofás, bancos)
    ("sofa", 8, 7, 3, 1), ("cooler", 1, 8, 1, 1),
    ("desk", 15, 3, 2, 1), ("desk", 19, 3, 2, 1), ("desk", 15, 6, 2, 1), ("desk", 19, 6, 2, 1), ("bookshelf", 14, 2, 1, 1),
    ("desk", 3, 13, 3, 1), ("desk", 3, 15, 3, 1), ("desk", 9, 13, 3, 1), ("desk", 9, 15, 3, 1), ("desk", 15, 13, 3, 1), ("desk", 15, 15, 3, 1),
    ("desk", 3, 19, 3, 1), ("desk", 3, 21, 3, 1), ("desk", 9, 19, 3, 1), ("desk", 9, 21, 3, 1), ("desk", 15, 19, 3, 1), ("desk", 15, 21, 3, 1),
    ("cooler", 21, 23, 1, 1),
    ("coffee", 8, 27, 1, 1),
    ("sofa", 15, 28, 3, 1), ("sofa", 19, 28, 3, 1), ("sofa", 15, 33, 3, 1), ("sofa", 19, 33, 3, 1),
    ("table", 26, 3, 6, 2), ("table", 37, 3, 6, 2), ("table", 48, 3, 7, 2), ("bookshelf", 56, 2, 1, 1),
    ("table", 27, 29, 4, 3),
    ("bench", 27, 16, 10, 1), ("bench", 42, 16, 10, 1), ("bench", 27, 19, 10, 1), ("bench", 42, 19, 10, 1),
    ("table", 42, 29, 2, 2), ("table", 48, 29, 2, 2), ("sofa", 42, 33, 3, 1), ("sofa", 47, 33, 3, 1),
    # jardim
    ("bench_park", 10, 42, 2, 1), ("bench_park", 30, 42, 2, 1), ("bench_park", 46, 42, 2, 1), ("bench_park", 20, 46, 2, 1),
    ("lamp_post", 5, 40, 1, 1), ("lamp_post", 52, 40, 1, 1), ("lamp_post", 28, 47, 1, 1),
]
OBJECTS = [
    dict(id="mural", kind="info", x=9, y=2, w=3, h=1, label="Mural", text="Bem-vindo ao ExpresSpace.\n\nAnde com WASD ou setas. Chegue perto de alguém para conversar por voz. Entre numa sala de reunião para cair na call dela. Aperte E perto de objetos como este.\n\nCanais de texto e voz ficam na barra da esquerda. M liga e desliga o microfone."),
    dict(id="quadro-open", kind="board", x=20, y=17, w=1, h=2, label="Quadro do time"),
    dict(id="quadro-r1", kind="board", x=24, y=2, w=1, h=2, label="Quadro"),
    dict(id="quadro-r2", kind="board", x=35, y=2, w=1, h=2, label="Quadro"),
    dict(id="quadro-dir", kind="board", x=46, y=2, w=1, h=2, label="Quadro"),
    dict(id="quadro-r3", kind="board", x=24, y=27, w=1, h=2, label="Quadro"),
    dict(id="telao", kind="video", x=30, y=10, w=9, h=1, label="Telão", url="https://www.youtube.com/embed/jfKfPfyJRdk"),
    dict(id="docs", kind="link", x=8, y=12, w=2, h=1, label="Biblioteca", url="/membros"),
    dict(id="palco-link", kind="link", x=52, y=11, w=2, h=1, label="Palco · link", url="https://www.youtube.com/embed/jfKfPfyJRdk"),
    # caixas de som: cada uma toca (YouTube) pra quem está na sala dela; qualquer um pode escolher a música (E)
    dict(id="som-cafe", kind="speaker", x=11, y=27, w=1, h=1, label="Caixa de som"),
    dict(id="som-lounge", kind="speaker", x=22, y=27, w=1, h=1, label="Caixa de som"),
    dict(id="som-auditorio", kind="speaker", x=25, y=11, w=1, h=1, label="Caixa de som"),
    dict(id="som-terraco", kind="speaker", x=36, y=26, w=1, h=1, label="Caixa de som"),
    dict(id="som-jardim", kind="speaker", x=2, y=40, w=1, h=1, label="Caixa de som"),
]
# Props dos packs CraftPix (client/public/assets/props): x,y = canto superior esquerdo da imagem em tiles.
# A base (últimas bh linhas) bloqueia; tapetes (bh=0) ficam no chão.
PACK_PROPS = [
    # recepção
    ("counter_plain", 3, 2), ("planter", 1, 2), ("rug_blue", 5, 5), ("lantern", 11, 4), ("plant_pot2", 12, 2),
    # open space
    ("bookshelf", 8, 10), ("planter2", 20, 12), ("rug_red", 7, 16), ("shelf_items", 18, 12), ("plant_pot", 1, 22), ("herbs", 1, 11),
    # foco
    ("plant_pot", 21, 7), ("shelf_empty", 14, 6),
    # reuniões e diretoria
    ("plant_pot2", 33, 1), ("plant_pot", 44, 1), ("table_wood", 46, 6), ("shelf_glass2", 55, 5),
    # auditório
    ("plant_pot", 25, 21), ("plant_pot", 55, 21),
    # café
    ("counter_vases", 2, 26), ("shelf_glass", 9, 26), ("table_round_set", 2, 29), ("table_round_set", 7, 29), ("table_small", 3, 34), ("table_small", 8, 34), ("barrel", 12, 34),
    # lounge
    ("rug_red_round", 17, 29), ("table_small", 17, 30), ("bookshelf", 21, 30), ("art_dragon", 16, 25), ("herbs", 14, 26), ("plant_pot2", 14, 34),
    # reunião 3
    ("art_tulip", 31, 25), ("plant_pot", 33, 34),
    # terraço
    ("crate_big", 55, 34), ("bush_round", 37, 33), ("rocks", 50, 35), ("stump", 40, 35), ("barrel2", 36, 26),
    # jardim
    ("bush_big", 17, 44), ("bush_round", 40, 40), ("rocks", 10, 47), ("rocks", 33, 41), ("stump", 20, 41), ("bush_round", 53, 45),
]
# árvores animadas (client/public/assets/trees2, 13 quadros): x,y = canto superior esquerdo (imagem de 4x5 tiles); base = 2 tiles no meio da última linha
TREES2 = [
    ("apple_m", 35, 26), ("oak_s", 52, 31), ("green_m", 50, 25),
    ("green_l", 2, 38), ("apple_l", 12, 39), ("oak_l", 24, 38), ("green_l", 36, 39), ("apple_m", 50, 38), ("oak_m", 8, 44), ("green_s", 30, 44), ("oak_s", 44, 44),
]
FIRES = [(44, 26)]  # fogueira animada (3x3 tiles, base 2x1)
STATIC_NPCS = [  # gente do lugar (idle animado), parada num ponto
    dict(kind="seller", x=5.5, y=2.7, zone="recepcao"), dict(kind="customer", x=4.5, y=26.7, zone="cafe"),
]
DECOR = []  # árvores estáticas antigas (substituídas pelas animadas)
GRAFFITI = [
    dict(sprite="expresspace", x=40, y=24), dict(sprite="slogan", x=30, y=24), dict(sprite="shortway", x=50, y=24),
    dict(sprite="n7", x=3, y=10), dict(sprite="cafe", x=4, y=25), dict(sprite="foco", x=18, y=1),
    dict(sprite="benice", x=6, y=1), dict(sprite="greenteam", x=29, y=1), dict(sprite="loot", x=51, y=1),
    dict(sprite="expresspace", x=12, y=37),
]
NPCS = [
    dict(kind="fox", zone="terraco"), dict(kind="hare", zone="terraco"), dict(kind="grouse", zone="terraco"),
    dict(kind="deer", zone="jardim"), dict(kind="deer", zone="jardim"), dict(kind="boar", zone="jardim"), dict(kind="hare", zone="jardim"), dict(kind="grouse", zone="jardim"),
]
JARDIM_PATHS = [  # caminhos de pedra (x, y, w, h)
    (6, 38, 2, 12), (18, 38, 2, 12), (45, 38, 2, 12), (6, 43, 41, 2),
]

# ---------- camadas ----------
ground = [0] * (W * H); walls = [0] * (W * H); furn = [0] * (W * H)
def put(layer, x, y, name):
    if 0 <= x < W and 0 <= y < H: layer[y * W + x] = gid(name)
def get(layer, x, y): return layer[y * W + x] if 0 <= x < W and 0 <= y < H else 0

for z in ZONES:
    for y in range(z["y"], z["y"] + z["h"]):
        for x in range(z["x"], z["x"] + z["w"]):
            name = z["floor"]
            if name == "grass" and rnd.random() < 0.18: name = "grass2"
            if name == "grass" and rnd.random() < 0.04: name = "flowers"
            if name == "floor_wood" and rnd.random() < 0.15: name = "floor_wood2"
            if name == "floor_wood" and rnd.random() < 0.1: name = "floor_wood3"
            if name == "floor_wood" and rnd.random() < 0.1: name = "floor_wood4"
            if name == "grass" and rnd.random() < 0.12: name = "grass3"
            if name == "grass" and rnd.random() < 0.05: name = "grass_dirt"
            if name == "floor_concrete" and rnd.random() < 0.12: name = "floor_concrete2"
            put(ground, x, y, name)
    if "stage" in z:
        s = z["stage"]
        for y in range(s["y"], s["y"] + s["h"]):
            for x in range(s["x"], s["x"] + s["w"]): put(ground, x, y, "floor_stage_edge" if y == s["y"] + s["h"] - 1 else "floor_stage")
        for x in range(s["x"] + 3, s["x"] + s["w"] - 2, 7): put(furn, x, s["y"] - 1, "stage_light")
# tapetes
for (x, y, w, h) in []:  # tapetes agora são props dos packs
    for yy in range(y, y + h):
        for xx in range(x, x + w): put(ground, xx, yy, "rug_edge" if yy == y else "rug")
# caminhos do jardim
for (x, y, w, h) in JARDIM_PATHS:
    for yy in range(y, y + h):
        for xx in range(x, x + w): put(ground, xx, yy, "path")
for x in range(6, 48):  # borda superior do caminho horizontal
    if get(ground, x, 43) == gid("path") and get(ground, x, 42) in (gid("grass"), gid("grass2"), gid("flowers")): put(ground, x, 42, "path_edge")

# paredes
for (x, y, w, h, door) in WALLS:
    if door:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                walls[yy * W + xx] = 0
                put(ground, xx, yy, "door_outside" if yy >= 37 else "door")
        continue
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            put(walls, xx, yy, "wall_side" if (w == 1 and h > 1) else "wall_front")
# paredes horizontais ganham altura: uma linha de topo (vista de cima) acima da face.
# A parede externa de cima (linha 0) vira topo, com a face na linha 1.
for x in range(W):
    if get(walls, x, 0) == gid("wall_front"): put(walls, x, 0, "wall_top"); put(walls, x, 1, "wall_front")
for y in range(2, H):
    for x in range(W):
        if get(walls, x, y) == gid("wall_front") and not get(walls, x, y - 1): put(walls, x, y - 1, "wall_top")
# canto: topo de parede encostando em parede vertical à direita ganha aresta
for y in range(H):
    for x in range(W):
        if get(walls, x, y) == gid("wall_top") and get(walls, x + 1, y) == gid("wall_side") and get(walls, x + 1, y + 1) != gid("wall_side"):
            put(walls, x, y, "wall_top_end")
# janelas na parede externa de cima e na parede de fundo (vista do jardim)
for x in range(2, 56, 3):
    if get(walls, x, 1) == gid("wall_front"): put(walls, x, 1, "wall_front_window")
    if get(walls, x, 37) == gid("wall_front"): put(walls, x, 37, "wall_front_window")
# luminárias no meio das paredes de cima das salas de reunião e do café
for (x, y) in [(29, 1), (40, 1), (51, 1), (6, 25), (29, 24), (18, 25)]:
    if get(walls, x, y): put(walls, x, y, "wall_lamp")
# fundo de grafite
for g in GRAFFITI:
    for dx in (-1, 0, 1):
        if get(walls, g["x"] + dx, g["y"]) == gid("wall_front"): put(walls, g["x"] + dx, g["y"], "wall_graffiti_bg")
# cerca em volta do jardim
for x in range(0, W): put(walls, x, H - 1, "fence")
for y in range(38, H): put(walls, 0, y, "fence"); put(walls, W - 1, y, "fence")

# móveis
def table(x, y, w, h):
    if h == 1:
        for i in range(w): put(furn, x + i, y, "table_l" if i == 0 else "table_r" if i == w - 1 else "table_m")
        return
    for yy in range(h):
        for xx in range(w):
            top, bot, left, right = yy == 0, yy == h - 1, xx == 0, xx == w - 1
            name = ("table_tl" if top and left else "table_tr" if top and right else "table_bl" if bot and left else "table_br" if bot and right
                    else "table_t" if top else "table_b" if bot else "table_ml" if left else "table_mr" if right else "table_c")
            put(furn, x + xx, y + yy, name)
for (kind, x, y, w, h) in PROPS:
    if kind == "desk":
        for i in range(w):
            put(furn, x + i, y, "desk_l" if i == 0 else "desk_r" if i == w - 1 else "desk_m")
            if not get(furn, x + i, y + 1): put(furn, x + i, y + 1, "chair")
    elif kind == "table":
        table(x, y, w, h)
        if h == 2 and w >= 3:
            for i in range(w):
                if not get(furn, x + i, y - 1) and not get(walls, x + i, y - 1): put(furn, x + i, y - 1, "chair_back")
                if not get(furn, x + i, y + h): put(furn, x + i, y + h, "chair")
    elif kind == "sofa":
        for i in range(w): put(furn, x + i, y, "sofa_l" if i == 0 else "sofa_r" if i == w - 1 else "sofa_m")
    elif kind == "counter":
        for i in range(w): put(furn, x + i, y, "counter_l" if i == 0 else "counter_r" if i == w - 1 else "counter_m")
    elif kind in ("bench", "bench_park"):
        for i in range(w): put(furn, x + i, y, kind)
    else:
        put(furn, x, y, kind)
# objetos interativos têm um tile de móvel embaixo
for o in OBJECTS:
    if o["kind"] == "board":
        for yy in range(o["h"]): put(furn, o["x"], o["y"] + yy, "whiteboard")
    elif o["kind"] == "info":
        for xx in range(o["w"]): put(furn, o["x"] + xx, o["y"], "noticeboard")
    elif o["kind"] == "video":
        for xx in range(o["w"]): put(furn, o["x"] + xx, o["y"], "screen_l" if xx == 0 else "screen_r" if xx == o["w"] - 1 else "screen_m")
    elif o["kind"] == "speaker": put(furn, o["x"], o["y"], "radio")
    elif o["kind"] == "link" and o["id"] != "docs":
        for xx in range(o["w"]): put(furn, o["x"] + xx, o["y"], "screen_l" if xx == 0 else "screen_r" if xx == o["w"] - 1 else "screen_m")

# ---------- objetos do Tiled ----------
oid = [1]
def obj(name, typ, x, y, w=0, h=0, props=None, point=False):
    o = {"id": oid[0], "name": name, "type": typ, "x": x * TILE, "y": y * TILE, "width": w * TILE, "height": h * TILE, "rotation": 0, "visible": True}
    if point: o["point"] = True
    if props: o["properties"] = [{"name": k, "type": ("bool" if isinstance(v, bool) else "int" if isinstance(v, int) else "string"), "value": v} for k, v in props.items()]
    oid[0] += 1
    return o

# zonas: tira as linhas que viraram parede (face na linha 1 e topo na última linha de cada sala)
def row_is_wall(z, yy): return all(get(walls, xx, yy) for xx in range(z["x"], z["x"] + z["w"]))
for z in ZONES:
    while z["h"] > 1 and row_is_wall(z, z["y"]): z["y"] += 1; z["h"] -= 1
    while z["h"] > 1 and row_is_wall(z, z["y"] + z["h"] - 1): z["h"] -= 1
    if "stage" in z and z["stage"]["y"] < z["y"]: z["stage"]["y"] = z["y"]
zone_objs = []
for z in ZONES:
    zone_objs.append(obj(z["name"], "zone", z["x"], z["y"], z["w"], z["h"], {"id": z["id"], "kind": z["kind"]}))
    if "stage" in z:
        s = z["stage"]; zone_objs.append(obj(z["name"] + " palco", "stage", s["x"], s["y"], s["w"], s["h"], {"zone": z["id"]}))
inter_objs = [obj(o["label"], "interactive", o["x"], o["y"], o["w"], o["h"], {k: v for k, v in o.items() if k not in ("x", "y", "w", "h")}) for o in OBJECTS]
decor_objs = [obj(d["sprite"], "tree", d["x"], d["y"], d["w"], d["h"], {"sprite": d["sprite"]}) for d in DECOR]
for (name, x, y) in PACK_PROPS:
    pi = PROPIDX[name]
    decor_objs.append(obj(name, "prop", x, y, pi["w"], pi["h"], {"sprite": name, "bw": pi["bw"], "bh": pi["bh"]}))
for (name, x, y) in TREES2:
    decor_objs.append(obj(name, "tree2", x, y, 4, 5, {"sprite": name, "bw": 2, "bh": 1}))
for (x, y) in FIRES:
    decor_objs.append(obj("campfire", "fire", x, y, 3, 3, {"sprite": "campfire", "bw": 2, "bh": 1}))
graf_objs = [obj(g["sprite"], "graffiti", g["x"] + 0.5, g["y"] + 0.5, 0, 0, {"sprite": g["sprite"]}, point=True) for g in GRAFFITI]
npc_objs = [obj(n["kind"], "npc", 0, 0, 0, 0, {"kind": n["kind"], "zone": n["zone"]}, point=True) for n in NPCS]
npc_objs += [obj(n["kind"], "npc", n["x"], n["y"], 0, 0, {"kind": n["kind"], "zone": n["zone"], "static": True}, point=True) for n in STATIC_NPCS]
meta_objs = [obj("spawn", "spawn", SPAWN[0] + 0.5, SPAWN[1] + 0.5, 0, 0, point=True)]

def tilelayer(lid, name, data): return {"id": lid, "name": name, "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 1, "visible": True, "data": data}
def objlayer(lid, name, objs): return {"id": lid, "name": name, "type": "objectgroup", "draworder": "topdown", "x": 0, "y": 0, "opacity": 1, "visible": True, "objects": objs}

tileset = {
    "firstgid": 1, "name": "office", "tilewidth": TILE, "tileheight": TILE, "tilecount": TS["count"], "columns": COLS,
    "image": "../assets/tiles/office.png", "imagewidth": COLS * TILE, "imageheight": ((TS["count"] + COLS - 1) // COLS) * TILE, "margin": 0, "spacing": 0,
    "tiles": [{"id": t["id"], "type": name, "properties": [{"name": "collides", "type": "bool", "value": bool(t["collides"])}]} for name, t in TS["tiles"].items()],
}
tmap = {
    "type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down", "infinite": False,
    "width": W, "height": H, "tilewidth": TILE, "tileheight": TILE, "compressionlevel": -1,
    "nextlayerid": 10, "nextobjectid": oid[0],
    "properties": [{"name": "name", "type": "string", "value": "ExpresSpace"}, {"name": "proximityRadius", "type": "float", "value": 3.2}],
    "tilesets": [tileset],
    "layers": [
        tilelayer(1, "ground", ground), tilelayer(2, "walls", walls), tilelayer(3, "furniture", furn),
        objlayer(4, "zones", zone_objs), objlayer(5, "objects", inter_objs), objlayer(6, "decor", decor_objs),
        objlayer(7, "graffiti", graf_objs), objlayer(8, "npcs", npc_objs), objlayer(9, "meta", meta_objs),
    ],
}
out = os.path.join(ROOT, "client", "public", "maps", "sede.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(tmap, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
print("ok ->", out, f"{W}x{H}")
