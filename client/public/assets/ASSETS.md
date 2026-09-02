# Assets

`tiles/office.png` (v0.11): pisos, paredes, grama, calçada e cerca recortados dos packs abaixo (16px ampliados 2x); mesas de trabalho, monitores, sofás, telão etc. desenhados por código em `tools/build-tileset.py`.

Pixel art dos packs gratuitos da CraftPix (https://craftpix.net), licença: https://craftpix.net/file-licenses/
- Free Base 4-Direction Male Character (personagem base; roupa, cabelo e pele são pintados em tempo real pelo app)
- Free Top-Down Hunt Animals Pixel Sprite Pack (raposa, lebre, cervo, javali, tetraz)
- Free Top-Down Trees Pixel Art (árvores do terraço)
- Free Graffiti Constructor Pixel Art (fonte e decorações dos grafites; textos compostos por tools/build-assets.py)
- Main Characters Home – Free Top-Down Pixel Art Asset (paredes/pisos de madeira, móveis, tapetes, árvores animadas, arbustos)
- Free Glassblower's Workshop Top-Down Pixel Art Asset (paredes de reboco e pedra, balcões, estantes de vidro, vitrais, vasos; NPCs "seller" e "customer")
- Free 2D Top-Down Pixel Dungeon Asset Pack (pisos de pedra, fogueira animada)
- Free Top-Down Orc Game Character Pixel Art (corpo Orc, skin premium: idle/walk/run)

Pra regenerar: extraia os zips em tools/src/ e rode `python3 tools/build-assets.py` (packs antigos) e, com os 4 packs novos numa pasta, `PACKS=/pasta python3 tools/build-assets2.py && PACKS=/pasta python3 tools/build-tileset.py && python3 tools/build-map.py`.
