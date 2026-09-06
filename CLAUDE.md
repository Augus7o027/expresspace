# ExpresSpace · contexto do projeto

Leia isto antes de mexer em qualquer coisa. É o resumo operacional; o detalhe está em `docs/`.

## O que é

Ambiente 2D próprio de uma comunidade paga (mapa em pixel art, voz por proximidade, salas, palco, canais de texto, biblioteca de conteúdos, agentes de IA, agenda de aulas). Um processo Node serve tudo. Produção em `https://expressspace.improveyourlifedaily.com` numa VPS Hostinger com Coolify; repositório `Augus7o027/expresspace`; deploy automático no push.

Versão atual: **v0.15**. Histórico em `docs/CHANGELOG.md`.

## Mapa do código

- `server/src/index.js`: rotas REST, handlers de socket, relógios. É o arquivo central; leia `docs/02-arquitetura.md` pro catálogo de rotas e eventos.
- `server/src/security.js`: cabeçalhos, rate limit, origem, validadores `v.*`, SSRF. Toda entrada nova passa por aqui.
- `server/src/world.js`: estado dos jogadores e grupos de voz. `map.js`: leitura do Tiled.
- `client/src/main.js`: UI do espaço. `game.js`: Phaser. `voice.js`: WebRTC. `sprites.js`: pintura do avatar.
- `tools/build-map.py`: gera `client/public/maps/sede.json`. Mudou o mapa? roda ele e confere alcançabilidade.
- `test/e2e.mjs`: suíte Playwright com dois navegadores. `npm test`.

## Decisões que não mudam sem conversa

- Sem framework de UI e sem TypeScript. DOM direto, Phaser só pro mapa, Web Audio pro som.
- Voz em malha WebRTC até o estágio 2 da infraestrutura (LiveKit). Não otimizar a malha além do que existe.
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

Feito e testado: tudo listado no `README.md` até a v0.15.

Próximas fatias pedidas pelo dono, em ordem:
1. Integração de pagamento criando e desativando contas (Hotmart/Kiwify/Stripe via webhook, flag premium).
2. Recuperação de senha por e-mail (SMTP já existe) e verificação de e-mail.
3. LiveKit (SFU) no lugar da malha pra aulas com muita gente; TURN próprio antes disso.
4. Integração com OpenCode CLI (agentes).
5. Backup automatizado, Sentry, staging e CI (ver `docs/05-infraestrutura.md`, estágio 1).

Conhecidos e aceitos por enquanto: rate limit por processo (não distribuído); sem 2FA no admin; sem expurgo de mensagens; push no iPhone só com o app instalado; escolha de saída de áudio só em Chrome/Edge.

## Como rodar

`npm install && npm run dev` (Vite em :5173, servidor em :3000, memória). `npm run build && npm test` antes de entregar. Variáveis em `.env.example`.

## Quem decide

Dono do produto e da infraestrutura: Augusto (commita e faz push ele mesmo; o assistente entrega arquivos na pasta `n7 comunidade`). Três professores usam o painel com cargo `professor`.
