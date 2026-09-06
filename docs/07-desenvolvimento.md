# 7. Desenvolvimento

## Rodar local

```bash
npm install
npm run dev          # servidor em :3000 e Vite em :5173 (proxy pra /api, /files e socket)
```

Abra `http://localhost:5173`. Sem `DATABASE_URL` roda em memória (`data/state.json`). Pra ter admin: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run dev`. Microfone funciona em `localhost` sem https.

Build e teste completos:

```bash
npm run build        # client/dist
npm test             # build + Playwright com dois navegadores (~5 min)
```

O teste sobe o servidor em `:3100` com um provedor de LLM falso em `:3199`, cria admin, membro e professor, e percorre voz, câmera, chat, objetos, caixa de som, tour, configurações, agenda, moderação, biblioteca, painel e as checagens de segurança. Screenshots ficam em `test/shots/`.

## Estrutura

```
client/
  index.html · admin.html · membros.html     páginas
  src/main.js · game.js · voice.js · …        espaço (ver 02-arquitetura.md)
  src/admin.js · admin.css                    painel
  src/membros.js · membros.css · md.js        biblioteca
  public/assets/                              sprites, tileset, props, ícones (gerados por tools/)
  public/maps/sede.json                       mapa Tiled
  public/sw.js · manifest.webmanifest         PWA
server/src/
  index.js · world.js · map.js · auth.js · security.js · library.js · agents.js · events.js · notify.js · speaker.js
  db/store.js · schema.sql · migrate.js
tools/
  build-tileset.py · build-assets.py · build-assets2.py   geram os PNGs a partir dos packs CraftPix (16px → 2x)
  build-map.py                                             gera sede.json (zonas, paredes, móveis, objetos, NPCs)
test/e2e.mjs
docs/
```

## Convenções

- JavaScript moderno sem transpilar (ES2022, módulos), sem TypeScript, sem framework de UI: DOM direto e Phaser pro mapa. Comentários em português, curtos, explicando o porquê.
- Tudo que vem do cliente é validado no servidor (`security.js → v`). Nunca confiar em id, cargo ou dono vindo do corpo: usar a sessão.
- Interface montada com `textContent`/`createElement`; `innerHTML` só com templates fixos.
- Novo campo persistente: coleção em `docs` via `store.putDoc`; sem migração. Nova tabela: `schema.sql` com `IF NOT EXISTS`.
- Assets novos: subir `ASSET_V` em `sprites.js` (cache-busting).
- Versão: `client/index.html` (`vX.Y · beta`), seção nova no `README.md`, entrada em `docs/CHANGELOG.md`, e o que mudou de arquitetura ou dados nos docs correspondentes. Tudo no mesmo commit.

## Como adicionar

**Um objeto interativo novo.** `tools/build-map.py` → `OBJECTS` (id, kind, posição, label) e o tile de móvel embaixo; regenerar o mapa; `main.js → openObject` trata o `kind`; se precisar de estado, handler no socket em `index.js` e coleção em `docs`.

**Uma rota REST.** Em `index.js`, com o middleware certo (`admin`, `staff`, `member`), `wrap(async …)` pra erros virarem 400, validação com `v.*`. Documentar no catálogo em `02-arquitetura.md`.

**Um evento de socket.** Handler em `index.js` com `if (!user) return`, limitador `lim.*` se for algo que dá pra spammar, validação de tipos. Emitir pra sala `world` ou pro socket da pessoa via `socketsByUser`.

**Uma peça no mapa (prop, árvore, NPC).** Recortar do pack com `build-assets2.py` (precisa de `PACKS=` apontando pras pastas dos packs), listar em `PACK_PROPS`/`TREES2`/`STATIC_NPCS` no `build-map.py`, regenerar. Créditos em `client/public/assets/ASSETS.md`.

**Um cabelo, roupa ou acessório.** `sprites.js`: lista correspondente + regra de pintura em `paintSheet`; `avatar-editor.js` mostra sozinho; `AVATAR_MAX` em `index.js` precisa acompanhar.

## Testes

Um caso novo entra em `test/e2e.mjs` no bloco da feature, com `console.log` do resultado esperado. O processo termina com código 1 se houver erro de página. Pra depurar visualmente, `?canvas=1` força renderização por canvas (o headless não tem WebGL) e `?notour=1` pula o tour.

## Licenças de assets

Packs CraftPix (personagem base, animais, árvores, grafites, Main Characters Home, Glassblower's Workshop, Top-Down Dungeon, Orc) sob a licença gratuita da CraftPix: uso em projetos próprios permitido, redistribuição dos arquivos originais não. Créditos em `client/public/assets/ASSETS.md`.
