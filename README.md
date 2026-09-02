# ExpresSpace

Ambiente 2D próprio da comunidade. Híbrido entre Gather e Discord: um mapa onde o avatar anda, entra em salas e cai em calls, mais canais de texto e voz que funcionam sem depender da posição no mapa.

## O que já funciona (v0.4)

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

## Deploy no Coolify (VPS Hostinger)

1. Sobe o projeto num repositório Git (GitHub/GitLab). O Coolify puxa de lá.
2. No Coolify: **Projects → New Resource → Postgres**. Copia a URL interna de conexão (formato `postgres://usuario:senha@host:5432/banco`).
3. **New Resource → Application → Git repository**, Build Pack **Dockerfile**. Porta exposta: `3000`.
4. Em Environment Variables:
   - `DATABASE_URL` = a URL do passo 2
   - `CLIENT_ORIGIN` = `https://seu-dominio.com`
5. Em Domains coloca o domínio. O Coolify gera o certificado sozinho. **HTTPS é obrigatório**: o navegador só libera microfone em página segura.
6. Deploy. O schema do banco é aplicado na primeira subida, sem passo manual.

WebSocket passa pelo proxy do Coolify sem configuração extra. Se preferir subir app e banco juntos, use `docker-compose.yml` como recurso "Docker Compose" e defina `POSTGRES_PASSWORD` e `CLIENT_ORIGIN`.

Se alguém da comunidade estiver em rede muito fechada (empresa, 4G com CGNAT) e a voz não conectar, o próximo passo é um TURN (coturn) na mesma VPS; hoje só tem STUN público.

## Estrutura

```
server/src/index.js     Express + Socket.io: entrada, movimento, chat, canais, sinalização WebRTC
server/src/world.js     estado do mundo e cálculo dos grupos de voz (proximidade, sala, palco, canal)
server/src/map.js       definição do mapa (zonas, paredes, móveis, objetos interativos). Servido em GET /api/map
server/src/db/          schema.sql, migrate.js e store.js (Postgres ou memória)
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

## Editar o mapa

Tudo em `server/src/map.js`. Coordenadas em tiles de 32px. Zonas têm `kind` (`open`, `meeting`, `silent`, `stage`). Paredes com `door: true` viram passagem. A mesma definição desenha o mapa no cliente, então não precisa mexer em dois lugares.

Árvores ficam em `decor` (x,y = tile do tronco, w/h = tiles bloqueados), grafites em `graffiti` (tile da parede onde o centro fica) e bichos em `npcs` (tipo + zona onde passeiam). Sprites disponíveis: árvores `tree1..3, palm1, palm2, flower1, flower2, fruit1, autumn1, moss1`; bichos `fox, hare, deer, boar, grouse`.

Objetos interativos ficam em `objects`: `board` (quadro de texto compartilhado, salvo no banco), `link` e `video` (abrem a `url` num iframe; use links de embed, ex. `youtube.com/embed/ID`), `info` (mostra `text`). Pra trocar o vídeo do Telão ou o link de Documentos é só editar a `url`.

## Próximos passos sugeridos

- Login de verdade (magic link ou OAuth) e perfis persistentes
- SFU (LiveKit ou mediasoup) quando as salas passarem de ~6 pessoas: mesh não escala além disso
- Mapas em Tiled com tilesets desenhados (o WorkAdventure usa esse formato)
- Moderação: cargos, silenciar, expulsar
- Editor de mapa dentro do app
- TURN server próprio (coturn) para redes restritas
