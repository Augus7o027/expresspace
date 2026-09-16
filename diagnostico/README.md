# Diagnóstico de Crescimento Orgânico — cópia em forma de chat

Cópia da página `core-audience-diagnostico.netlify.app` remontada como conversa:
o lead responde 8 perguntas numa interface de chat e sai do outro lado com
diagnóstico, presente e reunião marcada.

São dois arquivos estáticos, sem build e sem dependência:

| arquivo      | o que é                                                      |
|--------------|--------------------------------------------------------------|
| `index.html` | o chat inteiro (8 etapas + diagnóstico + agenda)              |
| `call.html`  | a página da reunião (contador, entrar na sala, Google Agenda) |
| `logo.svg`   | marca provisória — troque por `logo.png`                       |
| `avatar.svg` | foto provisória de quem fala — troque por `especialista.jpg`   |

Para rodar: abra `index.html` num servidor estático qualquer
(`python3 -m http.server`) ou publique a pasta na Netlify/Vercel/Coolify.

## O fluxo, etapa por etapa

O cabeçalho mostra `X de 8` e a barra de progresso acompanha.

| # | Pergunta | Formato | O que acontece |
|---|----------|---------|----------------|
| 0 | Nome completo | texto | exige nome e sobrenome |
| 1 | WhatsApp | telefone + seletor de país | máscara BR, valida DDD e o 9; o DDD vira UF e o bot responde com a mensagem daquele estado |
| 2 | E-mail | texto | corrige typo de domínio (`gmail.con` → `gmail.com`) e pede confirmação |
| 3 | `@` do Instagram | texto com prefixo | aceita @ ou URL; dispara a leitura do perfil ao vivo |
| 4 | Reel **ou** faixa de seguidores | cards de reel / chips | com perfil lido: escolhe 1 reel entre os últimos 6. Sem perfil: escolhe a faixa de seguidores |
| 5 | Nicho | confirmação ou lista | se a bio revelou o nicho, é só confirmar; senão, seleciona na lista de 12 |
| — | **Pré-diagnóstico** | card + botão | intro dos 3 pilares do Método CORE → o lead confirma que leu → placar (Score CORE, nota do Gatilho da Atenção, gatilho que faltou, 2 pilares trancados) |
| 6 | Maior desafio | chips (6) | entra no score de qualificação |
| 7 | Renda mensal | chips (5) | fecha o score |
| 8 | **Finalização** | — | fechamento do diagnóstico → card do presente (Template dos 30 Reels) → convite → agenda → confirmação com link pra `call.html` |

Entre as etapas o bot "digita", e as esperas longas (ler o perfil, rodar o
método) mostram o card de retenção com os passos avançando.

Detalhes que a cópia mantém: persistência em `localStorage` (refresh no meio
reconstrói a conversa e volta de onde parou), captura de UTM/`fbclid` da URL,
aviso de LGPD sob o campo, score de qualificação (seguidores + renda + desafio,
mínimo 6), tela de "não qualificado" quando o back-end classifica assim, e todo
texto do lead escapado antes de entrar no HTML.

## Configuração

Tudo fica no bloco `CONFIG`, no topo do `<script>` do `index.html`:

- `WHATSAPP_NUMERO` — seu número com DDI+DDD, só dígitos.
- `AVATAR_URL` / `AVATAR_FALLBACK` — foto de quem conversa.
- `PRODUTO_IMG` — imagem real do template; vazio usa o mockup desenhado na página.
- `MOSTRAR_PRESENTE` — mostra o card do presente antes da agenda.
- `AGENDA` — dias da semana, horários, janela e antecedência mínima da agenda própria.
- `META_PIXEL_ID` (no `<head>`) — vazio, nenhum script de rastreio carrega. O
  pixel da página original foi removido de propósito: colocar o ID de outra
  conta mandaria seus leads pro gerenciador de anúncios de outra pessoa.

## Modo autônomo × com back-end

Por padrão **todas as rotas de API estão vazias** — a página não faz nenhuma
chamada de rede e funciona inteira no navegador: fluxo manual de perfil,
diagnóstico pelo template do Método CORE e agenda pelas regras de
`CONFIG.AGENDA`. É assim que ela roda publicada sem servidor.

Preencha em `CONFIG` só as rotas que você tiver no ar; cada uma ausente cai no
fallback dela:

| rota | serve para | sem ela |
|------|------------|---------|
| `API_SAVE` | gravar o lead a cada etapa | nada sai do navegador |
| `API_PROFILE` | ler perfil + reels (`start` → `poll`) | pergunta a faixa de seguidores |
| `API_DIAGNOSIS` | diagnóstico escrito por IA | usa o template local |
| `API_TRANSCRIBE` | transcrever o áudio do reel | analisa só legenda e números |
| `API_AGENDA` | horários e booking reais (`route`/`slots`/`book`/`info`) | agenda própria da página |
| `API_FB_EVENT` | eventos Meta pelo servidor (CAPI) | só o pixel do navegador, se houver ID |
| `API_PROXY_IMG` | proxy das fotos do Instagram | usa a URL direta |

## Sobre esta pasta

É uma página estática independente: não faz parte do app do ExpresSpace, não
entra no build do cliente nem no `npm test`. Fica aqui só para versionamento.
