# 4. Segurança

## Modelo de ameaças

Quem pode atacar e o que quer:

| Atacante | Objetivo | Vetor típico |
|---|---|---|
| Anônimo na internet | derrubar, achar contas, injetar conteúdo | força bruta no login, DoS por requisições, XSS, CSRF |
| Visitante ou membro | abusar do espaço, ler o que não deve, se passar por outro | spam, IDOR em rotas, assinar push de outro, mexer em objetos da equipe |
| Professor | escalar pra admin, atacar membros via conteúdo | HTML em conteúdo, upload malicioso, link com script |
| Agente de IA (comprometido pelo conteúdo que lê) | usar o servidor pra alcançar a rede interna | SSRF via `fetch_url` e RSS |
| Quem obtém o banco ou um backup | senhas e chaves | hash fraco, segredos em texto |

## O que está implementado (v0.15)

**Transporte e cabeçalhos** (`server/src/security.js`)
- HTTPS obrigatório em produção (Coolify emite o certificado; o navegador só libera microfone em página segura). `Strict-Transport-Security` de 1 ano quando `CLIENT_ORIGIN` é https.
- `Content-Security-Policy`: scripts só do próprio domínio e da API do YouTube; estilos próprios e Google Fonts; iframes só https (telão e links são escolhidos pela equipe); `object-src 'none'`; `frame-ancestors 'self'` (ninguém embute o app); `base-uri` e `form-action` travados.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` (câmera, microfone e captura de tela só pro próprio site), `Cross-Origin-Resource-Policy`, sem `X-Powered-By`.

**Sessões e senhas** (`server/src/auth.js`)
- Senha com scrypt (sal de 16 bytes, 64 bytes de hash), comparação em tempo constante. Mínimo 8 caracteres, recusa repetições e senhas óbvias.
- Cookie `sede_session`: HMAC-SHA256 com `SESSION_SECRET`, `HttpOnly`, `SameSite=Lax`, `Secure` em https, 30 dias.
- Versão de sessão (`sv`): trocar senha ou cargo invalida todas as sessões antigas da conta.
- Login: 12 tentativas por 10 min por IP. Conta banida não faz login.

**CSRF.** Toda requisição que muda estado precisa vir da própria origem (`Origin`/`Referer` iguais ao host da requisição ou a `CLIENT_ORIGIN`). Somado ao `SameSite=Lax`, um site externo não consegue usar o cookie de um membro.

**Limites.** 600 requisições por minuto por IP na API; JSON de no máximo 1 MB (mapa do Tiled 8 MB, uploads até `MAX_UPLOAD_MB`); no socket, teto por evento (movimento 40/s, chat 5 a cada 3 s, sinalização WebRTC 120 a cada 10 s, agentes 6/min, buscas na caixa de som 1 a cada 2,5 s). JSON malformado responde 400 sem stack trace.

**Validação de entrada.** Todo payload é saneado no servidor: nome (letras, números, espaço, `_ . -`, 24 chars), avatar (índices dentro dos limites, Orc só premium), cor (`#rrggbb`), mensagens (1000 chars), links (só `http(s)://` ou caminho local; YouTube convertido em embed), ids de objetos e zonas conferidos contra o mapa, cargos contra a lista, e-mails por regex, datas por `Date`.

**Autorização (IDOR).** Cada rota checa cargo pelo middleware (`admin`, `staff`, `member`). O que é "do próprio usuário" vem da sessão, nunca do corpo: preferências, progresso na biblioteca, histórico com agentes, assinatura push (só contas, porque o id de visitante é público no estado do mapa). Moderação respeita hierarquia: professor não modera admin nem outro professor. Parar a música só quem colocou ou a equipe. Editar telão só equipe.

**SQL.** Todas as consultas em `db/store.js` usam parâmetros (`$1…`). Nenhuma string de usuário entra em SQL por concatenação. Documentos JSON vão em coluna `JSONB`.

**XSS.** O cliente monta a interface com `textContent` e `createElement`; `innerHTML` só com templates fixos. Markdown da biblioteca escapa HTML antes de renderizar e só aceita links `http(s):`, `mailto:` e locais. Links de objetos são atribuídos por propriedade (`a.href`), nunca interpolados. A CSP é a segunda linha: mesmo que algo escape, script inline não roda.

**Uploads.** Nome reescrito (aleatório + slug), sem caminho. Servidos só pra contas, com `nosniff`; imagem, vídeo, áudio e PDF abrem inline, todo o resto baixa como anexo (um `.html` ou `.svg` enviado nunca executa como página do app). Path traversal em `/files` bloqueado.

**SSRF.** As ferramentas dos agentes (`fetch_url`, RSS, busca) só acessam endereços públicos: bloqueiam `localhost`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*` (metadata de nuvem), IPv6 local, `.local`, `.internal` e hosts numéricos. Timeout de 12 s.

**Voz.** Na malha, a mídia é ponto a ponto e cifrada (DTLS-SRTP); o servidor só relê sinalização entre pessoas do mesmo grupo. Com LiveKit, o token (JWT assinado com a chave da API, 6 h) dá acesso só à sala do grupo; salas de reunião e canais são isoladas; no palco, `canPublish` é do servidor de mídia, não do cliente. Exceção conhecida: a área aberta é uma sala só (`open`) e a separação por proximidade é feita pelo cliente (assina só o grupo). Um cliente modificado poderia assinar alguém longe na área aberta, que é pública por natureza. O webhook do LiveKit é validado pela assinatura.

**Dependências.** `npm audit` limpo na v0.15 (Express 5). O Dockerfile instala só produção (`--omit=dev`).

## O que ainda não está coberto

Em ordem de importância:

1. **Recuperação de senha e verificação de e-mail.** Hoje só o admin troca senha. Precisa de token de uso único por e-mail (SMTP já existe).
2. **Autenticação em dois fatores para admin.** TOTP no painel. Sem isso a senha do admin é o único segredo que protege tudo.
3. **Rate limit distribuído.** Os contadores são por processo. Com uma réplica só está certo; com várias, mover pra Redis.
4. **Registro de auditoria completo.** Existe `modlog` pra moderação; falta log de login (sucesso/falha por IP), mudanças no painel e acessos a arquivos.
5. **Varredura de uploads.** Não há antivírus. Se membros um dia puderem enviar arquivos, colocar ClamAV ou um serviço equivalente.
6. **Expurgo e LGPD.** Rotina de retenção de mensagens, exportação e exclusão de dados de uma conta a pedido.
7. **Segredos.** `SESSION_SECRET`, `apiKey` dos provedores e a chave VAPID vivem no banco ou em env. Em escala, um cofre (Vault, Doppler, ou os secrets do próprio Coolify com acesso restrito).
8. **Proteção de borda.** Cloudflare na frente (WAF, proteção DDoS, rate limit global) é o próximo passo barato. Ver infraestrutura.
9. **Gravações públicas por URL.** O vídeo gravado fica num bucket com URL pública. Pra fechar: bucket privado e o app servindo URL assinada de curta duração.

## Checklist antes de abrir pra público pagante

- [ ] `SESSION_SECRET` longo e aleatório definido no Coolify (sem ele, sessões caem a cada restart)
- [ ] `CLIENT_ORIGIN` = URL pública com https
- [ ] Visitantes desligados e cadastro livre desligado (Configurações), contas criadas pelo admin ou por integração de pagamento
- [ ] `DATABASE_URL` apontando pra Postgres com backup diário (ver operação)
- [ ] Volume persistente em `DATA_DIR`
- [ ] Senha do admin trocada depois da primeira subida e guardada num gerenciador
- [ ] `TURN_URL/USER/PASS` próprios (o relay público não tem garantia)
- [ ] Cloudflare (ou equivalente) na frente com "Under attack mode" disponível
- [ ] Sentry (ou equivalente) e alerta em `/api/health`
- [ ] Teste de restauração do backup feito pelo menos uma vez

## Como testar

A suíte `test/e2e.mjs` verifica cabeçalhos, ausência de violações de CSP no navegador, POST de origem estranha (403), senha fraca recusada, JSON quebrado (400), força bruta no login (429), upload `.html` servido como anexo, path traversal em `/files` (404), push sem conta (401) e sessão antiga morta após troca de senha. Rode `npm test` depois de qualquer mudança em `security.js`, `auth.js` ou nas rotas.
