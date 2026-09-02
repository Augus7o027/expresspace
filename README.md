# Sede (nome provisório)

Ambiente 2D próprio da comunidade. Híbrido entre Gather e Discord: um mapa onde o avatar anda, entra em salas e cai em calls, mais canais de texto e voz que funcionam sem depender da posição no mapa.

## O que já funciona (v0.1)

- Mapa 2D (Phaser) com Lobby, Café, Salas A/B/C, Auditório com palco, Foco (silêncio) e Praça
- Avatar com WASD/setas, colisão com paredes e móveis, portas
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
server/src/map.js       definição do mapa (zonas, paredes, móveis). Servido em GET /api/map
server/src/db/          schema.sql, migrate.js e store.js (Postgres ou memória)
client/src/main.js      login, sidebar, chat, integração socket
client/src/game.js      cena Phaser: mapa, avatares, movimento, balões
client/src/voice.js     WebRTC mesh com "perfect negotiation"
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

## Editar o mapa

Tudo em `server/src/map.js`. Coordenadas em tiles de 32px. Zonas têm `kind` (`open`, `meeting`, `silent`, `stage`). Paredes com `door: true` viram passagem. A mesma definição desenha o mapa no cliente, então não precisa mexer em dois lugares.

## Próximos passos sugeridos

- Login de verdade (magic link ou OAuth) e perfis persistentes
- SFU (LiveKit ou mediasoup) quando as salas passarem de ~6 pessoas: mesh não escala além disso
- Compartilhar tela e vídeo nas salas de reunião
- Sprites de avatar animados e mapas em Tiled (o WorkAdventure usa esse formato)
- Objetos interativos (quadro, link, embed) ao apertar uma tecla perto deles
- Moderação: cargos, silenciar, expulsar
- TURN server próprio (coturn) para redes restritas
