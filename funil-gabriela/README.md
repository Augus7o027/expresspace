# Funil de Conexão · Dra. Gabriela (Método ASK)

A página externa do funil: recebe o novo seguidor que veio do ManyChat, capta
nome e WhatsApp antes de qualificar, entende o que a pessoa busca e entrega ela,
já qualificada, no WhatsApp certo.

Arquivos estáticos, sem build e sem dependência:

| arquivo      | o que é                                                      |
|--------------|--------------------------------------------------------------|
| `index.html` | o funil inteiro (conversa, validações, roteamento, rastreio)  |
| `manychat.md`| a copy das mensagens do ManyChat, na mesma voz                |
| `manychat-automacao.md` | roteiro de ações pra montar a automação no ManyChat |
| `teste.mjs`  | suíte ponta a ponta (3 ramos, nutrição, retomada, temas, contraste) |
| `logo.svg`   | lockup provisório — troque por `logo.png`                     |
| `avatar.svg` | foto provisória da Gabi — troque por `gabriela.jpg`           |
| `marca.svg`  | selo da seta (favicon)                                        |

Para rodar: sirva a pasta (`python3 -m http.server`) ou publique na
Netlify/Vercel/Coolify, num domínio ou subdomínio próprio.

Para rodar a suíte (da raiz do repositório, que é onde o Playwright está):

```
node funil-gabriela/teste.mjs
```

## Identidade

Tirada do material da Imersão: carmim profundo (`#a81419`), creme (`#f6e7d2`) e
preto (`#0f0c0c`); serifa de alto contraste (Playfair Display) nos títulos e Open
Sans no corpo; pílula de etapa com contorno creme, no lugar do "PÁGINA 09"; o fio
geométrico do impresso aparece discreto atrás da conversa. Cor e fonte são tokens
no `:root` — trocar a paleta é mexer em um bloco só.

## Tema claro e noturno

A página abre no tema que o aparelho da pessoa pede (`prefers-color-scheme`) e
cai no noturno quando não há preferência. O botão no cabeçalho alterna na hora,
e a escolha fica salva em `localStorage` (`gabi_tema`): a partir daí ela manda
mais que o sistema. Um script no `<head>` aplica o tema antes da primeira
pintura, então não existe aquele lampejo de tela branca.

O que muda entre os dois: fundo, superfícies, texto, bordas, sombras, o fio
geométrico, o brilho do topo, a cor do CTA e a barra do navegador. O que **não**
muda, de propósito: o cabeçalho carmim e a bolha da pessoa — são eles que fazem
a página continuar reconhecível quando a luz inverte.

Como mexer:

- **trocar uma cor**: tudo mora em dois blocos, `:root` (noturno) e
  `:root[data-tema="claro"]`. Nenhuma regra abaixo deles cita cor — elas usam só
  o papel semântico (`--bg`, `--superficie`, `--texto`, `--cta-bg`…), então
  redefinir o token muda a página inteira;
- **fixar um tema só**: troque a linha do `<head>` por
  `document.documentElement.setAttribute('data-tema', 'claro')` (ou `'escuro'`) e
  remova o botão `#temaBtn` do cabeçalho;
- **checar o contraste depois de mexer**: `node funil-gabriela/teste.mjs` mede os
  pares críticos nos dois temas e reprova abaixo de 4,5:1 em texto pequeno e
  3:1 em texto grande (WCAG AA).

## A jornada

Três etapas comuns e depois o ramo escolhido. O contador do cabeçalho se ajusta
ao ramo (paciente fecha em 4, profissional em 8).

| # | Pergunta | Formato |
|---|----------|---------|
| 1 | Como você se chama? | texto |
| 2 | Qual o seu melhor WhatsApp? | telefone com seletor de país |
| 3 | Me conta o que te traz até mim | 3 opções (A/B/C) |

**Ramo A · paciente** → 4. cidade (com opção de pular) → recepção da clínica.
Nunca pergunta faturamento.

**Ramo B · injetáveis** → 4. formação · 5. já aplica ou quer começar · 6. área ·
7. desafio · 8. faturamento → comercial do Workshop.
Formação sem habilitação para aplicar sai do funil de vendas: mensagem gentil,
pedido de permissão para nutrir e nenhum evento de conversão.

**Ramo C · eventos e mentoria** → 4. formação · 5. clínica em operação ou em
construção · 6. área · 7. desafio · 8. faturamento → comercial da mentoria.

O faturamento é sempre a última pergunta do ramo, nas 7 faixas da especificação.

## Voz

Tudo em primeira pessoa, na voz da Gabi: ela conduz, recebe e direciona. Sem
diminutivo, sem minimizar o tempo da pessoa e sem nunca dar a entender que há
alguém digitando ao vivo — o enquadramento é "este é o meu canal, preparei ele
para te receber", e o cabeçalho diz *canal oficial*. No handoff ela apresenta
alguém do time que cuida por ela; ela não some.

## Configuração

Bloco `CONFIG`, no topo do `<script>`:

- `WHATSAPP.clinica` / `.workshop` / `.mentoria` — número (DDI+DDD, só dígitos),
  título, descrição, texto do botão e o tema que entra na mensagem
  pré-preenchida. **Troque os três antes de publicar** (hoje são placeholders) e
  garanta que cada um tem alguém respondendo rápido.
- `AVATAR_URL` — foto da Gabi.
- `API_SAVE` / `API_FB_EVENT` — ver abaixo. Vazio = modo autônomo.
- `META_PIXEL_ID` (no `<head>`) — vazio, nenhum script de rastreio carrega.

Dá para sobrescrever qualquer chave sem editar o arquivo, definindo
`window.FUNIL_CONFIG = { ... }` antes do script (útil pra ter teste e produção
com os mesmos arquivos). A mescla é rasa: para trocar um número, passe o objeto
`WHATSAPP` inteiro.

## Salvamento e CRM

Salva a cada etapa, com `status` evoluindo: `parcial` → `completo` → `roteado`
(ou `nutrir`). Quem abandona no meio já é lead com telefone. O envio usa
`sendBeacon`, então sobrevive ao fechamento da aba.

Campos do payload: `lead_ref`, `status`, `nome`, `telefone` (E.164),
`interesse` (A/B/C) e `interesse_texto`, `formacao`, `pode_aplicar`, `ja_atua`,
`momento`, `nicho`, `desafio`, `faixa_faturamento`, `cidade`, `destino`, `tag`,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`,
`referrer`, `enviado_em`.

`API_SAVE` deve apontar para um endpoint **seu** (uma function na Netlify, por
exemplo) que grava e repassa ao ClickUp. Não coloque o webhook do ClickUp direto
aqui: a URL ficaria visível no código da página e qualquer pessoa poderia
escrever no seu CRM.

## Rastreamento

UTMs e `fbclid` são capturados na entrada e preservam a primeira atribuição. O
evento `Lead` dispara na **classificação** (quando o destino é definido) e o
`Schedule` quando o horário é marcado no Calendly — cada um uma vez por lead,
com o mesmo `eventID` no Pixel e na Conversions API para o Meta deduplicar. Quem abandona antes ou cai em nutrição não dispara conversão — a
campanha aprende com o lead qualificado.

O estado fica em `localStorage`: refresh no meio remonta a conversa e volta para
a pergunta pendente; funil concluído reabre mostrando o card final (e a agenda
volta funcionando).

## Checklist da especificação

Pronto aqui: página do funil na voz da Gabi, aquecimento com região pelo DDD,
e-mail e preview do Instagram, agenda automática no workshop e na mentoria,
lead prioritário a partir de R$150 mil, tema claro e noturno opcionais, captura
de contato antes da qualificação, salvamento incremental, roteamento para os 3
destinos, mensagens pré-preenchidas, faixa de faturamento só nos ramos B e C,
tratamento do não elegível, LGPD, UTM/fbclid, eventos Lead e Schedule, retomada
por `localStorage` e a copy do ManyChat em `manychat.md` e `manychat-automacao.md`.

Fora desta pasta (seu lado): criar os dois eventos no Calendly, com o telefone
como primeira pergunta, e colar os links; montar o fluxo no ManyChat com o
gatilho de novo seguidor e o toggle de DM de lembrete ligado; publicar num
domínio ou subdomínio; subir o endpoint de salvamento e ligar no ClickUp; se
quiser o preview real do Instagram, subir também a rota de perfil e o proxy de
imagem; configurar Pixel e Conversions API; colocar os 3 números reais.

## Sobre esta pasta

É uma página estática independente: não faz parte do app do ExpresSpace, não
entra no build do cliente nem no `npm test`. Fica aqui só para versionamento.
