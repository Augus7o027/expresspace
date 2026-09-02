# ExpresSpace

Ambiente 2D próprio da comunidade. Híbrido entre Gather e Discord: um mapa onde o avatar anda, entra em salas e cai em calls, mais canais de texto e voz que funcionam sem depender da posição no mapa.

## O que já funciona (v0.8)

- **Renderização pixel-perfect**: Phaser em modo `pixelArt` (sem antialias, vizinho mais próximo), zoom só inteiro (1x, 2x, 3x pela roda do mouse, padrão 2x) e personagens em escala 2 — cada pixel da arte vira um bloco inteiro na tela, sem tremer ao andar
- **Oclusão correta dos móveis**: a camada de móveis do Tiled vira sprites ordenados pela base; quem passa atrás de uma mesa, balcão ou estante fica atrás; parar numa cadeira "senta" (a cadeira cobre as pernas). Tiles rentes ao chão (tapetes, flores, luz de palco) ficam no piso
- **Sombra de contato** em pixels sob pessoas, bichos e árvores; **anel de proximidade pontilhado**, **balões de fala estilo RPG** (borda, canto chanfrado, rabicho) e **onda sonora animada** em vez das formas vetoriais lisas
- Luz ambiente e spots do palco com **dithering** (xadrez em pixels) em vez de elipses suaves; poste do jardim com halo
- Micro-animações: vapor na cafeteira, brilho pulsando em monitores e telão, copa das árvores balançando

- **Biblioteca / área de membros em `/membros`**: aulas (vídeo do YouTube, Vimeo, Loom ou .mp4 hospedado no seu servidor), skills, prompts (com botão copiar), automações, templates e links, organizados em módulos, com busca, tags, progresso por membro ("marcar como concluído") e navegação anterior/próximo. Só entra quem tem conta. Dentro do espaço, o objeto **Biblioteca** na Recepção e o link na barra lateral abrem a área
- **Aba Conteúdos no painel**: editor em Markdown com prévia, upload de arquivos direto pro servidor (`DATA_DIR/uploads`, servidos só pra quem tem conta em `/files/…`), visibilidade (membros ou só professores), rascunho/publicado, ordem. **Professores entram no painel** e veem só essa aba
- Arquivos podem ter até 500 MB por padrão (`MAX_UPLOAD_MB`)

- **Contas**: login por e-mail e senha, cargos `admin`, `professor`, `member`; visitantes (só nome) e cadastro livre são opções que o admin liga ou desliga
- **Painel /admin** (só admin): visão geral de quem está online, **provedores de LLM** (qualquer API OpenAI-compatível: NVIDIA NIM, OpenRouter, Groq, Ollama, OpenAI) com teste de conexão, **agentes** (nome, papel, system prompt, modelo, temperatura, ferramentas, fontes RSS, aparência, posição no mapa, agenda), **mundo** (trancar salas, mover objetos e árvores, bichos, enviar mapa do Tiled sem deploy), **usuários** e **configurações**
- **Agentes no mapa**: cada agente é um personagem com selo IA; chega perto, aperta E e conversa. Ferramentas: busca na web (DuckDuckGo), leitura de página e RSS. Histórico por pessoa. Com agenda, o agente pesquisa e posta sozinho num canal a cada N horas (ex.: briefing diário de tech)
- **Salas trancadas** bloqueiam quem não é admin/professor, com aviso no mapa; `#anúncios` só professores postam
- Persistência sem Postgres: `DATA_DIR/state.json` (monte um volume no Coolify)

- Mapa inteiro em pixel art no formato **Tiled** (`client/public/maps/sede.json`): abre no Tiled (mapeditor.org) e edita à vontade, o app lê direto
- Tileset próprio de escritório em 32px (`client/public/assets/tiles/office.png`, 65 tiles): pisos, paredes com janela e luminária, mesas com monitor, cadeiras, sofás, balcão, bebedouro, cafeteira, estante, quadro branco, telão, rádio, mural, e exterior (grama, calçada, cerca, poste, banco de praça)
- Jardim externo atrás do prédio, com caminhos de pedra, bancos, postes, árvores e bichos (cervos, javali, lebre, tetraz)
- Colisão vem dos tiles (propriedade `collides`) e dos objetos; zonas, palco, objetos interativos, árvores, grafites, bichos e spawn vêm das camadas de objetos do Tiled

- Pixel art de verdade: personagem base da CraftPix (64x64, 4 direções, 6 quadros de andar + 12 de respiração) pintado em tempo real com a config do avatar (pele, cabelo, roupa, acessório)
- Bichos passeando no Terraço (raposa, lebre, cervo, tetraz), simulados no servidor e iguais pra todo mundo
- Árvores do pack no Terraço (palmeiras, florida, frutífera, musgo) com colisão no tronco e ordenação de profundidade
- Grafites nas paredes compostos com a fonte do pack (EXPRESSPACE, N7, CAFE, FOCO, slogan) mais peças prontas
- `tools/build-assets.py` converte os packs originais pra `client/public/assets/`; créditos em `client/public/assets/ASSETS.md`

- Avatar personalizável: pele, 5 cabelos, cor do cabelo, roupa e acessório (óculos, boné, fone), com preview no login e botão de editar dentro do app; todo mundo vê a mudança na hora
- Câmera nas salas de reunião e canais de voz (botão ou tecla C), aparece em tiles sobre o mapa junto com as telas compartilhadas
- Biblioteca própria de emojis em traço monocromático (32 ícones em SVG, `:fire:`, `:rocket:`, `:coffee:` etc.), picker no chat, mensagem só de emoji fica grande; ícones da interface no mesmo traço
- Ambiente mais detalhado: piso por área (madeira, carpete, ladrilho, deck, mármore), paredes com rodapé e sombra, janelas, luminárias, cadeiras nas mesas, monitores, tapetes, palco com spots
- Personagem com sombreamento, gola, sapatos, cabelo com volume
- Negociação WebRTC mais robusta: o lado de id menor inicia, o outro entra depois de responder (evita colisão que travava a conexão), com watchdog que renegocia e recria a conexão se ficar parada

- Mapa 2D (Phaser) de 58x38 tiles: Recepção, Open Space com ilhas de mesas, Foco (silêncio), Reunião 1/2/3, Diretoria, Auditório com palco, Café, Lounge e Terraço
- Avatar em pixel art animado (4 direções), cor escolhida no login
- Anda com WASD/setas ou clicando no mapa; colisão com paredes e móveis, portas
- Objetos interativos (chega perto e aperta E): Mural, Quadros compartilhados (texto sincronizado entre todos), Telão com vídeo, Documentos e Rádio (iframe)
- Status de presença: Disponível, Ocupado, Foco (modo foco corta a voz por proximidade) e frase de status
- Indicador de quem está falando (anel no avatar e na lista), sons de mensagem, menção e alguém chegando perto (botão 🔔 desliga)
- Compartilhar tela em salas de reunião e canais de voz (botão 🖥), com as telas aparecendo sobre o mapa
- Chat com @menções (autocompletar, destaque e som quando te mencionam), emojis e contador de não lidas por canal
- Reconexão automática: se a conexão cair, volta pro mesmo lugar sem recarregar
- Voz por proximidade nas áreas abertas (raio de 3,2 tiles, anel visível ao redor de você)
- Salas de reunião: entrou, está na call da sala
- Auditório: quem está no palco fala, plateia só ouve
- Área Foco: sem voz
- Canais de voz estilo Discord (Voz livre, Coworking), independentes do mapa
- Canais de texto (#geral, #anúncios, #ajuda) com histórico
- Chat da sala (só quem está dentro vê) com balão sobre o avatar
- Lista de quem está online e onde cada um está
- Clique numa sala na sidebar para ir direto
- Voz via WebRTC em malha (mesh), sinalização pelo servidor

## Rodar

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para testar com duas pessoas, abra duas abas (cada aba vira um usuário diferente).

Sem `DATABASE_URL` o servidor roda em memória (mensagens somem ao reiniciar). Para Postgres:

```bash
cp .env.example .env   # preencha DATABASE_URL
npm run db:migrate
npm run dev
```

Produção: `npm run build && npm start` (o servidor serve o build do cliente na porta 3000).

Teste ponta a ponta (dois navegadores, chat, proximidade, WebRTC): `npm test`.

## Contas, admin e agentes

Primeiro acesso: defina `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `SESSION_SECRET` nas variáveis de ambiente e suba. O admin é criado na primeira subida. Entre em `/admin`.

Fluxo pra ter um agente no ar:
1. **Provedores**: escolha um preset (NVIDIA NIM em build.nvidia.com dá chave gratuita), cole a chave, clique em Testar.
2. **Agentes → Novo agente**: nome, papel, system prompt (a "personalidade" e a bagagem do professor), provedor + modelo, ferramentas (busca, páginas, RSS), aparência, zona e tile onde ele fica. Salvar e testar.
3. Opcional, **Agenda**: ligada, a cada 24h, canal `#geral`, tarefa "Pesquise as notícias mais relevantes de IA e marketing das últimas 24h e escreva um resumo comentado com links". Rodar agenda agora pra ver.

Pra comunidade paga: em Configurações desligue visitantes e cadastro livre; crie as contas dos membros em Usuários (integração com pagamento vem depois).

Sem Postgres tudo fica em `DATA_DIR/state.json` (contas, agentes, chaves, mensagens). No Coolify, em Persistent Storage, monte um volume em `/app/data`. Com `DATABASE_URL`, vai pra tabela `docs` do Postgres — mas os arquivos enviados na biblioteca continuam em disco (`DATA_DIR/uploads`), então o volume em `/app/data` é necessário de qualquer jeito.

## Biblioteca (conteúdo pros membros)

No painel, aba **Conteúdos → Novo conteúdo**. Tipos: aula, skill, prompt, automação, template, link. O corpo é Markdown (títulos, listas, `código`, tabelas, links, imagens). Pra vídeo, cole o link do YouTube/Vimeo/Loom ou envie um `.mp4` no campo de arquivos (vira o player). Anexos (zip, pdf, json, planilha) ficam em `DATA_DIR/uploads` e só abrem logado. Publique quando estiver pronto; rascunho não aparece pros membros.

Cada professor pode ter conta com cargo `professor`: entra em `/admin`, vê só Conteúdos, e o que ele publica sai com o nome dele.

## Deploy no Coolify (VPS Hostinger)

1. Sobe o projeto num repositório Git (GitHub/GitLab). O Coolify puxa de lá.
2. No Coolify: **Projects → New Resource → Postgres**. Copia a URL interna de conexão (formato `postgres://usuario:senha@host:5432/banco`).
3. **New Resource → Application → Git repository**, Build Pack **Dockerfile**. Porta exposta: `3000`.
4. Em Environment Variables:
   - `DATABASE_URL` = a URL do passo 2 (ou pule e monte um volume em `/app/data`)
   - `CLIENT_ORIGIN` = `https://seu-dominio.com`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`
5. Em Domains coloca o domínio. O Coolify gera o certificado sozinho. **HTTPS é obrigatório**: o navegador só libera microfone em página segura.
6. Deploy. O schema do banco é aplicado na primeira subida, sem passo manual.

WebSocket passa pelo proxy do Coolify sem configuração extra. Se preferir subir app e banco juntos, use `docker-compose.yml` como recurso "Docker Compose" e defina `POSTGRES_PASSWORD` e `CLIENT_ORIGIN`.

Se alguém da comunidade estiver em rede muito fechada (empresa, 4G com CGNAT) e a voz não conectar, o próximo passo é um TURN (coturn) na mesma VPS; hoje só tem STUN público.

## Estrutura

```
server/src/index.js     Express + Socket.io: entrada, movimento, chat, canais, sinalização WebRTC
server/src/library.js   Biblioteca: conteúdos, progresso, uploads (DATA_DIR/uploads)
client/src/pixelfx.js   Texturas em pixel art geradas em canvas: sombra, luz com dithering, onda de voz, vapor, balão
client/membros.html     Área de membros (client/src/membros.js, membros.css, md.js = markdown)
server/src/world.js     estado do mundo e cálculo dos grupos de voz (proximidade, sala, palco, canal)
server/src/map.js       carrega o Tiled (sede.json), monta grid de colisão, zonas e objetos. Servido em GET /api/map
client/public/maps/     sede.json (mapa Tiled)
tools/build-tileset.py  desenha o tileset de escritório; tools/build-map.py gera o sede.json
server/src/db/          schema.sql, migrate.js e store.js (Postgres ou memória + state.json)
server/src/auth.js      contas, senhas (scrypt), sessões por cookie, cargos
server/src/agents.js    agentes: provedores OpenAI-compatíveis, tools (busca, página, RSS), agenda
client/admin.html       painel admin (client/src/admin.js, admin.css)
client/src/main.js      login, sidebar, chat, integração socket
client/src/game.js      cena Phaser: mapa, avatares, movimento, balões
client/src/voice.js     WebRTC mesh (voz + tela) com "perfect negotiation" e detecção de fala
client/src/sprites.js   pinta o personagem base da CraftPix conforme a config (pele, cabelo, roupa, acessório)
client/public/assets/   sprites (personagem, bichos, árvores, grafites) gerados por tools/build-assets.py
client/src/avatar-editor.js  editor de avatar com preview (login e modal)
client/src/icons.js     biblioteca de emojis e ícones em SVG monocromático
client/src/sounds.js    sons de notificação sintetizados (sem arquivos)
client/src/style.css    identidade visual (preto, vidro fosco, serif + script, grão)
test/e2e.mjs            teste Playwright com dois usuários
Dockerfile              imagem única (build do cliente + servidor) pro Coolify
docker-compose.yml      app + Postgres, alternativa ao Postgres gerenciado do Coolify
```

## Como o servidor decide quem ouve quem

A cada movimento o servidor recalcula um "grupo de voz" por pessoa, nesta ordem:

1. Está num canal de voz da sidebar: grupo = o canal
2. Está numa sala `meeting`: grupo = a sala
3. Está no Auditório (`stage`): grupo = auditório, mas só quem pisa no palco pode falar
4. Está em `silent`: sem voz
5. Área aberta: agrupa por proximidade (transitivo: se A perto de B e B perto de C, os três se ouvem)

O cliente recebe `voice:group` com a lista de peers e abre/fecha conexões WebRTC para bater com a lista.

## Emojis próprios

Estão em `client/src/icons.js`, no objeto `EMOJI`: cada chave vira `:chave:` no chat. Pra adicionar um novo, desenha um SVG 24x24 em traço (stroke) seguindo os existentes e coloca lá; o picker e a renderização pegam sozinhos.

## Editar o mapa (Tiled)

O mapa é `client/public/maps/sede.json`, formato Tiled 1.10 (mapeditor.org, grátis). Abre lá e edita; ao salvar, o servidor lê no próximo restart e o cliente no próximo build. O tileset é `client/public/assets/tiles/office.png` (referenciado pelo JSON).

Camadas de tiles: `ground`, `walls`, `furniture`. Tiles marcados com a propriedade `collides` bloqueiam o avatar (paredes, mesas, plantas...). Portas são só tiles sem colisão no lugar da parede.

Camadas de objetos (tipo do objeto = campo Class/Type no Tiled):
- `zones`: retângulos `zone` com propriedades `id` e `kind` (`open`, `meeting`, `silent`, `stage`); retângulo `stage` com propriedade `zone` marca o palco
- `objects`: retângulos `interactive` com `id`, `kind` (`board`, `info`, `video`, `link`), `label`, `url` ou `text`
- `decor`: retângulos `tree` com `sprite` (`tree1..3, palm1, palm2, flower1, flower2, fruit1, autumn1, moss1`); o retângulo é a área bloqueada do tronco
- `graffiti`: pontos `graffiti` com `sprite`
- `npcs`: pontos `npc` com `kind` (`fox, hare, deer, boar, grouse`) e `zone`
- `meta`: ponto `spawn`

Se preferir gerar por código, `tools/build-map.py` monta o JSON a partir de listas em Python (foi assim que a primeira versão saiu) e `tools/build-tileset.py` desenha o tileset. Rode os dois e o mapa é regenerado.

Objetos interativos ficam em `objects`: `board` (quadro de texto compartilhado, salvo no banco), `link` e `video` (abrem a `url` num iframe; use links de embed, ex. `youtube.com/embed/ID`), `info` (mostra `text`). Pra trocar o vídeo do Telão ou o link de Documentos é só editar a `url`.

## Próximos passos sugeridos

- Pagamento (Stripe/Hotmart) criando contas de membro automaticamente
- Área de membros: biblioteca de conteúdos, tutoriais, skills, prompts e templates hospedados no próprio servidor
- SFU (LiveKit ou mediasoup) quando as salas passarem de ~6 pessoas: mesh não escala além disso
- Moderação: cargos, silenciar, expulsar
- Editor de mapa dentro do app
- TURN server próprio (coturn) para redes restritas
