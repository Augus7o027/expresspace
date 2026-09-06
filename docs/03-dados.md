# 3. Dados

## Dois modos de armazenamento

`server/src/db/store.js` implementa a mesma interface duas vezes:

| Modo | Quando | Persistência |
|---|---|---|
| Postgres | `DATABASE_URL` definido | tabelas abaixo; schema aplicado na subida (`schema.sql`, idempotente) |
| Memória | sem `DATABASE_URL` | tudo em RAM, gravado em `DATA_DIR/state.json` a cada mudança. Serve pra desenvolvimento e testes; em produção use Postgres |

## Tabelas (Postgres)

| Tabela | Conteúdo |
|---|---|
| `users` | quem já entrou no espaço (contas e visitantes): id, nome, cor, último acesso |
| `channels` | canais de texto e voz da sidebar (semeados: geral, anúncios, ajuda, Voz livre, Coworking) |
| `messages` | mensagens por canal; `channel_id = zone:<id>` é o chat de uma sala. Índice `(channel_id, id DESC)` |
| `boards` | texto dos quadros compartilhados |
| `docs` | documentos JSON genéricos: `(collection, id) → data`. Tudo abaixo mora aqui |

## Coleções em `docs`

| Coleção | Documento | Campos relevantes |
|---|---|---|
| `accounts` | uma conta | `email`, `name`, `role`, `pass` (scrypt `salt:hash`), `avatar`, `premium`, `reminders`, `tourDone`, `sv` (versão de sessão), `last_login` |
| `settings/main` | configurações | `communityName`, `allowGuests`, `allowRegister` |
| `settings/vapid` | chaves Web Push | `publicKey`, `privateKey` (geradas na primeira subida se não vierem por env) |
| `world/overrides` | ajustes do mapa | `locked[]`, `objects{id: {x, y, url, label}}`, `decor{}`, `npcs[]` |
| `world/speakers` | caixas de som | `{id: {videoId, start, title, author, startedAt, by, byName}}` |
| `providers` | provedor LLM | `name`, `baseUrl`, `apiKey`, `models[]` |
| `agents` | agente | `name`, `role`, `systemPrompt`, `model`, `tools[]`, `rss[]`, `avatar`, `zone`, `x`, `y`, `schedule` |
| `agent_chats` | histórico por agente e pessoa | mensagens `{role, content}` |
| `content` | item da biblioteca | `type`, `title`, `summary`, `category`, `tags`, `video`, `body` (markdown), `files[]`, `visibility`, `published`, `order` |
| `progress` | conclusão por membro | `{userId, contentId, done}` |
| `events` | evento da agenda | `title`, `description`, `startsAt`, `durationMin`, `url`, `zone`, `objectId`, `remindedAt`, `startedAt` |
| `push` | assinatura Web Push | `userId`, `sub` (endpoint + chaves), `ua` |
| `bans` | banido (id = id da conta ou do visitante) | `name`, `role`, `reason`, `by`, `at` |
| `modlog` | ação de moderação | `action`, `by`, `byName`, `targetId`, `targetName`, `minutes`, `reason`, `at` |

## Arquivos em disco (`DATA_DIR`)

| Caminho | Conteúdo |
|---|---|
| `uploads/` | arquivos da biblioteca e avatares enviados. Nome = 8 hex aleatórios + slug + extensão; servidos em `/files/<nome>` só pra contas |
| `sede.json` | mapa enviado pelo painel (tem prioridade sobre o do build) |
| `state.json` | estado inteiro no modo memória |

O `DATA_DIR` precisa ser um volume persistente no Coolify. Sem isso, uploads e mapa somem a cada deploy.

## O que é sensível

`accounts.pass` (hash), `providers.apiKey`, `settings/vapid.privateKey`, `push.sub` (endpoints identificam o dispositivo), `messages.body`. Backup do banco deve ser tratado como dado pessoal: criptografado em repouso e com acesso restrito. Ver [04-seguranca.md](04-seguranca.md) e [06-operacao.md](06-operacao.md).

## Retenção

Mensagens ficam pra sempre no Postgres (no modo memória, 500 por canal). Histórico de agentes idem. Não há rotina de expurgo ainda; se a comunidade precisar de política de retenção (LGPD), a rotina entra em `index.js` junto do relógio da agenda.
