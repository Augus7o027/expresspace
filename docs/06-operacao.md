# 6. Operação (runbook)

## Deploy

1. Push na branch principal do repositório. O Coolify faz build da imagem (`Dockerfile`: build do cliente + servidor Node numa imagem só) e sobe o container novo.
2. O schema do Postgres é aplicado na subida (idempotente). Não há passo manual de migração.
3. Healthcheck do container em `/api/health` a cada 30 s. Se falhar, o Coolify mantém o container antigo.
4. Depois do deploy: abrir o app, entrar, checar que a voz conecta com outra pessoa e que o painel abre. Assets têm cache-busting (`?v=`), então ninguém fica com versão velha.

Rollback: no Coolify, "Redeploy" de um build anterior. Como o schema é só aditivo, versões antigas rodam com o banco novo.

## Variáveis no Coolify

Ver a tabela completa em [05-infraestrutura.md](05-infraestrutura.md). As que quebram silenciosamente se faltarem: `SESSION_SECRET` (todo mundo desloga em cada restart) e `DATA_DIR` sem volume (uploads somem no deploy).

## Backup

**Postgres.** No recurso do banco no Coolify: Backups → agendado diário (madrugada), retenção 14 dias, destino S3-compatível. Verificar que o primeiro backup apareceu no bucket.

**`DATA_DIR`.** Script diário na VPS (cron do host, fora do container):

```bash
#!/bin/sh
# /root/backup-data.sh · roda às 3h: tar do volume + envio pro bucket (rclone configurado antes)
set -e
VOL=$(docker volume inspect -f '{{.Mountpoint}}' <nome-do-volume-DATA_DIR>)
DAY=$(date +%F)
tar -czf /tmp/sede-data-$DAY.tgz -C "$VOL" .
rclone copy /tmp/sede-data-$DAY.tgz bucket:expresspace/data/
rm /tmp/sede-data-$DAY.tgz
rclone delete --min-age 30d bucket:expresspace/data/
```

`crontab -e` → `0 3 * * * /root/backup-data.sh >> /var/log/sede-backup.log 2>&1`.

**Restauração (testar uma vez por trimestre).** Banco: criar Postgres novo no Coolify, restaurar o dump pela interface, trocar `DATABASE_URL`, redeploy. Dados: baixar o tar, `docker run --rm -v <volume>:/d -v /tmp:/b alpine sh -c "cd /d && tar -xzf /b/sede-data-<dia>.tgz"`.

## Logs

`docker logs -f <container>` ou a aba Logs do Coolify. Prefixos: `[server]`, `[db]`, `[auth]`, `[push]`, `[mail]`, `[eventos]`, `[agentes]`. Erros de provedor LLM aparecem no painel (teste do provedor) e no log.

Com Sentry: `SENTRY_DSN` no servidor e no cliente (a integrar; ver segurança, item pendente).

## Incidentes comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Não ouço ninguém" pra uma pessoa | rede fechada (empresa, 4G) sem relay | bolinha vermelha na lista de membros confirma; configurar TURN próprio; pedir pra testar em outra rede |
| Ninguém se ouve | STUN/TURN fora, ou deploy quebrou sinalização | `/api/health` ok? testar com duas abas anônimas; ver log de `rtc` no console |
| Mic pede permissão e nada acontece | página sem https ou permissão negada no navegador | a tela de login mostra o estado e as instruções por navegador |
| Todo mundo deslogou | restart sem `SESSION_SECRET` | definir a variável (uma vez) |
| Uploads sumiram | `DATA_DIR` sem volume | criar volume, restaurar do backup |
| Tileset preto ou boneco errado | cache antigo do navegador | Ctrl+Shift+R; o `?v=` do `ASSET_V` em `sprites.js` deve ter subido na versão |
| 429 pra usuários legítimos | rate limit por IP compartilhado (escola, empresa atrás de um NAT) | subir o teto em `security.js` ou mover pra Redis com chave por conta |
| 403 "origem não permitida" | `CLIENT_ORIGIN` diferente do domínio real | corrigir a variável (com https, sem barra final) |
| Agente não responde | provedor sem crédito ou modelo errado | painel → Provedores → Testar |
| Música não toca pra alguém | autoplay bloqueado | o widget mostra "▶ tocar"; um toque resolve |

## Rotação de segredos

- `SESSION_SECRET`: trocar derruba todas as sessões (todo mundo faz login de novo). Fazer em horário calmo.
- Senha do admin: painel → Usuários → trocar. Isso já invalida sessões antigas da conta.
- `apiKey` de provedor: painel → Provedores → editar.
- Chaves VAPID: se trocar (`VAPID_*` ou apagar `settings/vapid`), todas as assinaturas push morrem e cada pessoa precisa reativar nas configurações. Evitar.
- `TURN_PASS`: trocar no coturn e na env ao mesmo tempo.

## Moderação e contas

Banir e silenciar: dentro do espaço, lista de membros → ⋯. Desbanir: painel → Moderação. Trocar cargo, marcar premium, trocar senha, apagar conta: painel → Usuários. Toda ação de moderação fica em `modlog`.

## Capacidade

Sinais de que está na hora do estágio 2 (LiveKit): reclamações de áudio picotado com mais de ~8 pessoas no mesmo grupo, CPU da VPS acima de 70% em aula, ou celulares esquentando em chamada.
