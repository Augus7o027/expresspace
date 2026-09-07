# Changelog

Uma entrada por versão. O detalhe de cada feature está na seção correspondente do `README.md`.

## v0.18 · editor do espaço

- Editor WYSIWYG no app (admin): móveis, decoração, árvores, fogueira, objetos, ponto de entrada, gente parada; propriedades por item; salas (nome, tipo, piso) e bichos; desfazer; salvar com checagem de alcançabilidade; voltar ao padrão.
- `server/src/mapgen.js` gera o Tiled a partir de um layout JSON (`world/layout` em docs); `layout-default.json` é a fonte do espaço padrão.
- Rotas `GET/PUT /api/admin/layout`, `POST /api/admin/layout/check`, `POST /api/admin/layout/reset`.
- Cena: modo editor (câmera livre, esconde o que é editável).

## v0.17 · rádio, fila e movimento

- Caixa de som: sincronia pelo relógio do servidor, sem seek em transmissões ao vivo, recarga só quando a música muda, fila com pular/tirar/tocar agora, avanço automático ao terminar (`speaker:skip`, `speaker:remove`, `speaker:ended`).
- Jogadores remotos com interpolação de amostras (120 ms de atraso) e teleporte em trocas de sala.
- Orc alinhado com a sombra (origem por direção).

## v0.16 · aula ao vivo de verdade

- LiveKit (SFU) como transporte de voz, câmera e tela quando configurado; malha WebRTC continua como padrão sem configuração.
- Salas por grupo de voz (`open`, `zone-<id>`, `ch-<id>`); na sala aberta o cliente assina só quem está no grupo de proximidade.
- Permissão de publicar no palco vem do token e é atualizada ao vivo (`updateParticipant`).
- Gravação da aula por Egress pra S3, com webhook assinado que cria a aula na biblioteca.
- Arquivos de deploy do LiveKit (`deploy/`), variáveis novas, docs de infraestrutura atualizados.
- Kick/ban também removem a pessoa da sala de mídia.

## v0.15 · blindagem e documentação

- Camada de segurança no servidor (`security.js`): CSP, HSTS, nosniff, frame, permissions; rate limit por IP na API e por evento no socket; checagem de origem (CSRF); limites de corpo; validadores centrais; bloqueio de SSRF nas ferramentas dos agentes.
- Contas: senha mínima de 8 com bloqueio de senhas óbvias; versão de sessão (trocar senha ou cargo derruba sessões antigas); conta banida não faz login; brute force no login limitado.
- Uploads: só imagem, vídeo, áudio e PDF abrem inline; o resto baixa como anexo.
- Push só pra contas (o id de visitante é público).
- Links de objetos montados por DOM (sem interpolação em HTML).
- Express 5 e `npm audit` limpo.
- Documentação em `docs/` (visão geral, arquitetura, dados, segurança, infraestrutura, operação, desenvolvimento) e `CLAUDE.md` com o contexto vivo do projeto.
- Suíte e2e ganhou as checagens de segurança.

## v0.14 · parecer produto

- Phaser separado do bundle (120 KB no primeiro carregamento), tela de carregamento com progresso.
- Tour de boas-vindas em 4 passos.
- Configurações: microfone, saída e câmera, medidor, teste de eco, notificações.
- Moderação: silenciar, expulsar, banir; aba no painel com registro.
- Agenda de eventos no palco com lembrete (push e e-mail) e link automático no telão.
- PWA instalável e Web Push (menção e aula).
- Velocidade do personagem independente do fps.

## v0.13 · mapa, áudio e caixas de som

- Telão fora da porta da Reunião 2; deslize em cantos; mapa 100% alcançável.
- Checagem de microfone na tela de login com medidor e instruções por navegador.
- ICE configurável (TURN por env, OpenRelay como fallback); estado da conexão por pessoa na lista.
- Caixas de som por sala com YouTube sincronizado, busca sem chave e refinamento por IA.
- Links do telão e do palco editáveis pela equipe ao vivo.
- Avatar: mais peles, cabelos, roupas em 4 modelos, calça, sapato, acessórios novos, botão aleatório.

## v0.12 · celular

- Layout responsivo: mapa em tela cheia, gavetas, joystick, barra de ações, HUD compacto, iOS/Android.

## v0.11 · packs CraftPix de 16px

- Mapa inteiro em 16px×2 com os packs Home, Glassblower, Dungeon e Orc; props, árvores animadas, fogueira, NPCs.
- Correr com Shift; 9 cabelos; skin premium Orc; cache-busting de assets.

## v0.10 · áudio

- Voz por proximidade ligada por padrão; áudio espacial; porta de ruído; janelas de câmera e tela arrastáveis.

## v0.9 · sentar, paredes, foco

- Sentar em cadeiras; paredes com altura; escurecimento das outras salas; nomes e títulos sem sobreposição; idle de costas corrigido.

## v0.8 · pixel-perfect

- Renderização sem antialias, zoom inteiro, oclusão correta de móveis, sombras, balões e efeitos em pixel.

## v0.7 · biblioteca

- Área de membros `/membros` com aulas, skills, prompts, automações, templates, uploads e progresso; aba Conteúdos no painel; professores no painel.

## v0.6 · contas, painel e agentes

- Login por e-mail e senha com cargos; painel `/admin`; provedores de LLM; agentes no mapa com ferramentas e agenda; salas trancadas.

## v0.5 · Tiled

- Mapa em Tiled (`sede.json`), tileset próprio, Jardim externo.

## v0.1 a v0.4 · base

- Servidor Node + Socket.io + Postgres/memória, Phaser, WebRTC em malha, canais de texto e voz, mapa inicial, objetos interativos, chat com menções e emojis, câmera, avatar personalizável, deploy no Coolify.
