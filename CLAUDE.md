# ExpresSpace · contexto do projeto

Leia isto antes de mexer em qualquer coisa. É o resumo operacional; o detalhe está em `docs/`.

## O que é

Ambiente 2D próprio de uma comunidade paga (mapa em pixel art, voz por proximidade, salas, palco, canais de texto, biblioteca de conteúdos, agentes de IA, agenda de aulas). Um processo Node serve tudo. Produção em `https://expressspace.improveyourlifedaily.com` numa VPS Hostinger com Coolify; repositório `Augus7o027/expresspace`; deploy automático no push.

Versão atual: **v0.19**. Histórico em `docs/CHANGELOG.md`.

## Mapa do código

- `server/src/index.js`: rotas REST, handlers de socket, relógios. É o arquivo central; leia `docs/02-arquitetura.md` pro catálogo de rotas e eventos.
- `server/src/security.js`: cabeçalhos, rate limit, origem, validadores `v.*`, SSRF. Toda entrada nova passa por aqui.
- `server/src/world.js`: estado dos jogadores e grupos de voz. `map.js`: leitura do Tiled.
- `client/src/main.js`: UI do espaço. `game.js`: Phaser. `voice.js`: malha WebRTC; `voice-live.js`: LiveKit com a mesma interface (escolhido no boot pelo `live` do join). `sprites.js`: pintura do avatar.
- `server/src/live.js`: LiveKit (tokens por sala, permissão no palco, gravação, webhook). Ligado só com `LIVEKIT_*` no env.
- `server/src/mapgen.js` + `layout-default.json`: o mapa é gerado no servidor a partir do layout (o editor do app salva em `world/layout`). `tools/build-map.py` só regenera o `sede.json` do build a partir das mesmas constantes.
- `client/src/editor.js`: editor do espaço (admin). Composição de móveis duplicada com `mapgen.js`: mudou uma, muda a outra.
- `server/src/packs.js`: packs de sprites importados pelo painel (zip → peças em `DATA_DIR/packs/`). O índice `propIndex()` entra no catálogo do editor e no `mapgen`. Interações de avatar (sentar, deitar, usar, portal, placa, trabalho) são propriedades da peça no Tiled gerado; o cliente resolve em `game.js → registerInteractive`.
- `test/e2e.mjs`: suíte Playwright com dois navegadores. `npm test`.

## Decisões que não mudam sem conversa

- Sem framework de UI e sem TypeScript. DOM direto, Phaser só pro mapa, Web Audio pro som.
- Voz: LiveKit quando configurado, malha como fallback. As duas classes têm a mesma interface; feature nova de voz entra nas duas ou só na LiveKit com aviso na UI. A malha não recebe otimização.
- Store com duas implementações (Postgres e memória) e a mesma interface. Dados novos vão em `docs` (coleção JSON), não em tabela nova, a menos que precisem de índice.
- Servidor autoritativo em movimento, colisão, trancas, cargos e tudo que muda estado. O cliente nunca decide permissão.
- Assets vêm dos packs CraftPix em 16px ampliados 2x. Nada de misturar densidade de pixel.
- Identidade visual: preto, vidro fosco, serif display + script, grão. Sem cores de marca fortes fora dos acentos azul-claro e verde.
- Textos da interface em português do Brasil, curtos, sem tom corporativo.

## Regras de trabalho

1. Toda entrada de usuário é validada no servidor. Rota nova usa o middleware de cargo certo e `wrap()`; evento de socket novo começa com `if (!user) return` e ganha um limitador se der pra spammar.
2. Interface monta com `textContent`/`createElement`. `innerHTML` só com template fixo.
3. Feature nova entra com teste no `e2e.mjs`.
4. **Versão nova = mesmo commit atualiza:** `client/index.html` (número), `README.md` (seção no topo), `docs/CHANGELOG.md`, e o doc afetado em `docs/` (rota nova → `02-arquitetura.md`; dado novo → `03-dados.md`; controle de segurança → `04-seguranca.md`; env nova → `05-infraestrutura.md` e `.env.example`). Este arquivo muda quando muda uma decisão ou o estado abaixo.
5. Segredos nunca no repositório. Só em env do Coolify ou no banco (provedores).

## Estado e pendências (atualizar a cada versão)

Feito e testado: tudo listado no `README.md` até a v0.19. O modo LiveKit é testado no e2e com o binário `livekit-server` local (`LIVEKIT_BIN`); a gravação (Egress) está implementada mas só foi validada até a chamada da API, porque depende do serviço com Chrome headless e de um bucket.

Próximas fatias pedidas pelo dono, em ordem:
1. Integração de pagamento criando e desativando contas (Hotmart/Kiwify/Stripe via webhook, flag premium).
2. Recuperação de senha por e-mail (SMTP já existe) e verificação de e-mail.
3. Subir o LiveKit em produção (arquivos em `deploy/`, passo a passo em `docs/05-infraestrutura.md`) e validar a gravação com um bucket real.
4. Integração com OpenCode CLI (agentes).
5. Backup automatizado, Sentry, staging e CI (ver `docs/05-infraestrutura.md`, estágio 1).

Editor do espaço ainda não desenha salas novas, paredes, portas nem pinta piso (próxima versão do editor). Portais só teleportam dentro do mesmo mapa; vários cenários (mapas) com portal entre eles é a rodada seguinte. Peças de pack do tipo `floor` hoje são desenhadas como uma peça só (não repetem pela sala).

Conhecidos e aceitos por enquanto: rate limit por processo (não distribuído); sem 2FA no admin; sem expurgo de mensagens; push no iPhone só com o app instalado; escolha de saída de áudio só em Chrome/Edge.

## Como rodar

`npm install && npm run dev` (Vite em :5173, servidor em :3000, memória). `npm run build && npm test` antes de entregar. Variáveis em `.env.example`.

## Quem decide

Dono do produto e da infraestrutura: Augusto (commita e faz push ele mesmo; o assistente entrega arquivos na pasta `n7 comunidade`). Três professores usam o painel com cargo `professor`.
