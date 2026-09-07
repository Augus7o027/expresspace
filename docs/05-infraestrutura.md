# 5. Infraestrutura

## O que está no ar hoje

```mermaid
flowchart LR
  U[Membros] -->|https| CF[DNS Hostinger]
  CF --> T[Traefik do Coolify · TLS]
  T --> APP[Container ExpresSpace · Node]
  APP --> PG[(Postgres do Coolify)]
  APP --> VOL[(volume DATA_DIR)]
  U <-->|WebRTC · P2P| U
  U -.-> STUN[STUN Google + relay OpenRelay]
```

Uma VPS Hostinger (`187.77.61.47`) com Coolify (`painel.improveyourlifedaily.com`). O app é um recurso "Dockerfile" ligado ao repositório `Augus7o027/expresspace`; cada push na branch principal faz build e deploy. O Traefik do Coolify termina TLS e passa WebSocket sem configuração extra. Postgres é um recurso do próprio Coolify. Domínio `expressspace.improveyourlifedaily.com`.

Isso atende bem até algumas dezenas de pessoas simultâneas. Os limites reais são a voz em malha (cada pessoa conecta com cada outra do grupo) e o fato de tudo viver numa máquina só.

## Estágios recomendados

### Estágio 1: fechar o básico (agora, custo quase zero)

O que falta pra produção segura na topologia atual:

| Item | Como |
|---|---|
| Backup do Postgres | Coolify tem backup agendado por recurso: diário, retenção 14 dias, destino S3-compatível (Hostinger Object Storage, Backblaze B2 ou Cloudflare R2). Testar uma restauração |
| Backup do `DATA_DIR` | job diário `tar` do volume pro mesmo bucket (script em [06-operacao.md](06-operacao.md)) |
| Cloudflare na frente | DNS proxied: WAF, proteção DDoS, cache dos assets, rate limit de borda. Ligar "Full (strict)". WebSocket passa |
| TURN próprio | coturn na mesma VPS (portas 3478 udp/tcp e 5349 tls), credenciais em `TURN_URL/USER/PASS`. Resolve voz em rede de empresa e 4G |
| Monitoramento | Sentry no cliente e no servidor (DSN por env), UptimeRobot ou Better Stack batendo em `/api/health` a cada minuto, alerta no WhatsApp/e-mail |
| Staging | segundo recurso no Coolify apontando pra branch `staging`, com Postgres próprio. Deploy em produção só depois do e2e passar |
| CI | GitHub Actions rodando `npm test` (Playwright) a cada PR |

Tamanho da VPS: 2 vCPU e 4 GB bastam pro app e Postgres. O coturn consome banda, não CPU: cada pessoa atrás de relay usa ~100 kbps por peer.

### Estágio 2: aula ao vivo de verdade (LiveKit) e réplicas

O gargalo da malha é a aula: com 30 pessoas no Auditório cada navegador manteria 29 conexões. Desde a v0.16 o app fala com um SFU (LiveKit): cada pessoa manda um fluxo e recebe só os que precisa. O código já está pronto; falta subir o servidor de mídia.

**Subir o LiveKit no Coolify (uma hora de trabalho)**

1. DNS: `live.seudominio.com` apontando pro IP da VPS (registro A, sem proxy do Cloudflare: UDP não passa pelo proxy).
2. Firewall da VPS (Hostinger → Firewall): liberar `7881/tcp`, `3478/udp`, `5349/tcp` e `50000-50200/udp`.
3. Gerar chaves: `docker run --rm livekit/livekit-server generate-keys`. Trocar `TROQUE_API_KEY`/`TROQUE_API_SECRET` em `deploy/livekit.yaml` e `deploy/docker-compose.livekit.yml`; trocar o domínio e a URL do webhook.
4. No Coolify, novo recurso "Docker Compose" apontando pra `deploy/docker-compose.livekit.yml` (os três serviços rodam em `network_mode: host`). Domínio `live.seudominio.com` → porta `7880` (o Traefik termina o TLS do sinal em wss).
5. No recurso do app: `LIVEKIT_URL=wss://live.seudominio.com`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Redeploy. A tela de login não muda; o HUD passa a contar "conectados" pela sala.
6. Teste: duas abas em redes diferentes (uma no 4G) no Auditório. Quem está no palco fala, a plateia só ouve.

TURN embutido: o `livekit.yaml` liga o TURN próprio do LiveKit em `5349/tls` e `3478/udp`, usando o certificado do domínio. Pra isso o LiveKit precisa do certificado em disco (`turn.cert_file`/`key_file`) ou de um Caddy/Traefik repassando o TLS; se preferir não configurar agora, deixe `turn.enabled: false` e mantenha o `TURN_URL` do coturn ou do OpenRelay pro fallback (a malha só entra quando `LIVEKIT_URL` está vazio).

**Gravar as aulas**

O serviço `egress` do compose grava a sala em MP4 e sobe pra um bucket S3-compatível (Cloudflare R2 é o mais barato e sem custo de saída). Variáveis no app: `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_KEY`, `S3_SECRET`, `S3_PUBLIC_URL` (domínio público do bucket). O webhook em `livekit.yaml` precisa apontar pra `https://app.seudominio.com/api/live/webhook`. Com isso a equipe vê "gravar aula" no palco e o vídeo entra na biblioteca ao terminar. O egress consome CPU (Chrome headless renderizando a sala): numa VPS de 2 vCPU, grave uma sala por vez; com mais uso, mova o egress pra uma máquina própria.

**Capacidade.** LiveKit numa VPS de 4 vCPU/8 GB atende centenas de participantes em áudio; vídeo pede mais banda que CPU (conte ~1,5 Mbps por câmera ativa por espectador, reduzido pelo simulcast). Quando passar disso, o LiveKit escala horizontalmente com o mesmo Redis (vários nós, mesmo `livekit.yaml`).

**Depois do LiveKit: réplicas do app**

```mermaid
flowchart LR
  U[Membros] --> CF[Cloudflare]
  CF --> LB[Traefik]
  LB --> APP1[App réplica 1]
  LB --> APP2[App réplica 2]
  APP1 & APP2 --> REDIS[(Redis · adapter do Socket.io, rate limit)]
  APP1 & APP2 --> PG[(Postgres gerenciado)]
  APP1 & APP2 --> S3[(Object storage · uploads)]
  U <-->|mídia| LK[LiveKit · SFU + TURN]
  APP1 -.token.-> LK
```

| Mudança | Por quê | O que muda no código |
|---|---|---|
| Uploads em object storage | réplicas não compartilham disco; backup vira nativo | `library.js` grava via S3 SDK e serve por URL assinada |
| Redis | Socket.io entre réplicas (`@socket.io/redis-adapter`), rate limit compartilhado, estado do mundo | `index.js` e `security.js` |
| Postgres gerenciado ou réplica | falha da VPS não leva o banco junto | nada, só `DATABASE_URL` |
| Sessões | continuam stateless (cookie assinado); nada muda | |



### Estágio 3: várias comunidades ou milhares de pessoas

Multi-tenant (uma instância por comunidade em contêineres separados é o caminho mais simples e mais seguro), Kubernetes ou Nomad no lugar do Coolify, CDN pros assets do mapa, LiveKit Cloud ou cluster próprio, observabilidade completa (traces, métricas, logs centralizados). Não vale desenhar isso antes do estágio 2 estar rodando.

## Variáveis de ambiente

| Variável | Obrigatória | Função |
|---|---|---|
| `PORT` | não (3000) | porta do servidor |
| `CLIENT_ORIGIN` | sim em produção | URL pública com https; define cookie `Secure`, HSTS e a checagem de origem |
| `SESSION_SECRET` | sim | assinatura das sessões; sem ele todo mundo desloga a cada restart |
| `DATABASE_URL` | sim em produção | Postgres; sem ele roda em memória |
| `DATA_DIR` | sim | volume com uploads, mapa enviado e `state.json` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | primeira subida | cria o primeiro admin se não houver nenhum |
| `MAX_UPLOAD_MB` | não (500) | teto de upload na biblioteca |
| `TURN_URL`, `TURN_USER`, `TURN_PASS` | recomendado | relay próprio; várias URLs separadas por vírgula |
| `SMTP_URL`, `MAIL_FROM` | opcional | lembretes de aula por e-mail |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | opcional | fixar as chaves de push (senão geradas e guardadas no banco) |
| `TZ_DISPLAY` | não (America/Sao_Paulo) | fuso dos textos de lembrete |
| `MAP_FILE` | não | trocar o mapa padrão do build |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | pra aulas grandes | liga o modo SFU; `LIVEKIT_API_URL` opcional se a API estiver em outro endereço |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_KEY`, `S3_SECRET`, `S3_PUBLIC_URL`, `S3_PATH_STYLE` | pra gravar aulas | destino das gravações do Egress |
| `AGENT_ALLOW_LOCAL` | nunca em produção | libera agentes buscarem localhost (só testes) |

## Domínios e DNS

Um domínio pro app (pode ficar atrás do Cloudflare). `live.` (LiveKit) e `turn.` (coturn, se usar) apontam direto pra VPS, sem proxy, porque UDP não passa pelo proxy. Certificados pelo Coolify (Let's Encrypt).

## Custos de referência

Estágio 1: VPS atual + object storage (centavos) + Cloudflare grátis + Sentry grátis. Estágio 2: mais uma VPS pro LiveKit e um Redis pequeno; ordem de R$ 150 a 300 por mês a mais. Números aproximados, variam com o provedor.
