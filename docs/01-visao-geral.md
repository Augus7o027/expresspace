# 1. Visão geral

## O que é

ExpresSpace é o ambiente próprio de uma comunidade paga: um espaço 2D em pixel art onde cada membro anda com um avatar, entra em salas, cai em chamadas de voz por proximidade e assiste aulas no palco. Junto vêm canais de texto e voz no estilo Discord, uma biblioteca de conteúdos (aulas, prompts, skills, templates) e agentes de IA que circulam pelo mapa.

Não depende de nenhum serviço de terceiros pra funcionar: Node, Postgres e um servidor. Roda hoje numa VPS com Coolify.

## Pra quem

Três perfis, três cargos no sistema:

| Cargo | Quem | O que pode |
|---|---|---|
| `admin` | dono da comunidade | tudo: painel completo, contas, mapa, agentes, provedores de LLM, configurações |
| `professor` | os experts que dão aula | entra em salas trancadas, posta em #anúncios, edita conteúdos da biblioteca, marca eventos, modera membros, troca links do telão |
| `member` | quem paga | usa o espaço, a biblioteca, a agenda; personaliza o avatar; escolhe música nas caixas de som |
| visitante | sem conta (opcional, o admin liga ou desliga) | anda, fala e escreve; não acessa biblioteca, push nem skins premium |

## Módulos

**Espaço 2D.** Mapa de 58×50 tiles gerado a partir do Tiled (`client/public/maps/sede.json`): Recepção, Open Space, Café, Lounge, Foco, três salas de reunião, Diretoria, Auditório com palco, Terraço e Jardim. Colisão, zonas e objetos vêm do mesmo arquivo. Móveis e paredes têm profundidade, dá pra sentar nas cadeiras, correr com Shift, e o mapa pode ser trocado pelo painel sem deploy.

**Voz e vídeo.** WebRTC em malha (cada navegador conecta direto com cada outro). O servidor só decide quem ouve quem: canal de voz, sala de reunião, palco, ou proximidade em área aberta. Áudio espacial (volume e lado pela distância), porta de ruído, câmera e compartilhamento de tela em janelas arrastáveis. STUN do Google e relay TURN configurável.

**Chat.** Canais de texto (#geral, #anúncios, #ajuda), chat por sala, menções com @, emojis próprios em SVG, balões de fala sobre o avatar. Menção vira push quando a pessoa não está olhando.

**Objetos interativos.** Tecla E perto de: quadros compartilhados (texto sincronizado), mural, telão e links (iframe; a equipe troca o link ao vivo), caixas de som por sala (YouTube sincronizado pra todo mundo na sala, com busca e ajuda de IA) e agentes.

**Agentes de IA.** Personagens no mapa ligados a um provedor OpenAI-compatível (NVIDIA NIM, OpenRouter, Groq, Ollama, OpenAI). Têm system prompt, ferramentas (busca web, leitura de página, RSS) e agenda pra postar sozinhos num canal.

**Biblioteca (`/membros`).** Aulas com vídeo, skills, prompts com botão copiar, automações, templates e links, organizados por módulo, com busca, progresso por membro e upload de arquivos hospedados no próprio servidor (servidos só pra quem tem conta).

**Agenda.** Eventos no palco com data, duração e link. Lembrete 15 min antes (push e e-mail), o link entra no telão na hora e todo mundo no espaço recebe o aviso.

**Painel (`/admin`).** Visão geral, conteúdos, agenda, moderação, agentes, provedores, mundo (trancar salas, mover objetos, bichos, enviar mapa), usuários (cargo, premium, senha) e configurações (nome, visitantes, cadastro livre).

**Celular.** Layout próprio: mapa em tela cheia, joystick, gavetas laterais, barra de ações. Instalável como app (PWA) com notificações push.

## Estado atual

Versão `v0.15`. Funcionalidades completas e testadas ponta a ponta por uma suíte Playwright com dois navegadores (voz, câmera, chat, objetos, biblioteca, painel, agenda, moderação, segurança). Rodando em produção em `https://expressspace.improveyourlifedaily.com`.

O que ainda não existe e importa pra escala: recuperação de senha, pagamento criando contas, servidor de mídia (SFU) pra grupos grandes, backup automatizado, monitoramento. Detalhes e ordem sugerida em [05-infraestrutura.md](05-infraestrutura.md) e [04-seguranca.md](04-seguranca.md).
