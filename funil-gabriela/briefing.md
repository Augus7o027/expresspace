# Briefing · Funil de Conexão da Dra. Gabriela (Método ASK)

Documento de passagem. Serve para outra pessoa — ou outro chat — assumir o
projeto sem precisar de mais nada além disto e do código.

---

## 1. O que é

Um chat guiado que recebe quem acabou de seguir a Dra. Gabriela no Instagram,
capta contato **antes** de qualificar, entende o que a pessoa busca e a entrega,
já qualificada, no destino certo. Marca pessoal de medicina estética: a Gabi tem
clínica, um workshop de injetáveis e eventos/mentoria para donos de clínica.

**Objetivo:** transformar seguidor novo em lead com telefone e roteá-lo para o
lugar certo — sem funil único, sem formulário.

**Arquitetura fechada:** o ManyChat é a **ponte** (gatilho de novo seguidor,
boas-vindas, botão e link). A **página externa é o funil** — perguntas, captura,
roteamento, agenda. O telefone é pedido na página, não no ManyChat.

---

## 2. Onde está

- Repositório: `Augus7o027/expresspace`, branch `claude/optimistic-fermi-wekenj`.
- Pasta: **`funil-gabriela/`** — independente, não faz parte do app ExpresSpace
  que ocupa o resto do repositório (está lá só para versionamento).

| arquivo | o que é |
|---|---|
| `index.html` | o funil inteiro: markup, CSS e JS num arquivo só |
| `teste.mjs` | suíte ponta a ponta em Playwright (105 checagens) |
| `README.md` | documentação de operação |
| `manychat.md` | copy das mensagens do ManyChat |
| `manychat-automacao.md` | roteiro de ações para um agente montar a automação |
| `gabriela.jpg`, `logo.svg`, `avatar.svg`, `marca.svg` | imagens |

Estático, sem build e sem dependência de runtime. Publica em qualquer lugar
(Netlify, Vercel, Coolify). Rodar local: `python3 -m http.server` na pasta.
Rodar a suíte, da raiz do repositório: `node funil-gabriela/teste.mjs`.

**Roda sem back-end.** Com as rotas de API vazias, nenhuma chamada de rede
acontece e cada etapa usa seu fallback. Isso é proposital: a página pode ir ao ar
antes das integrações.

---

## 3. A jornada

Cinco perguntas comuns, depois o ramo. O contador do cabeçalho se ajusta:
paciente fecha em 6, profissional em 10.

1. **Nome**
2. **WhatsApp** — seletor de país, máscara e validação BR (DDD válido + 9),
   salvo em E.164. O DDD vira UF e a Gabi comenta o mercado daquele estado
   (27 falas próprias, escritas para clínica e estética).
3. **E-mail** — corrige erro de digitação no domínio (`gmail.con` → `gmail.com`)
   e pede confirmação.
4. **@ do Instagram** — volta num card com foto, nome, seguidores, posts e
   categoria; a pessoa confirma "Sou eu" ou corrige o @.
5. **"Me conta o que te traz até mim"** — três opções que definem o ramo.

As etapas 2 a 4 são o aquecimento: existem para que a pergunta de faturamento,
lá no fim, chegue numa conversa e não num formulário.

**Ramo A · paciente** ("quero me tratar na sua clínica") → 6. cidade (com opção
de pular) → WhatsApp da recepção. Nunca pergunta faturamento, nunca abre agenda.

**Ramo B · injetáveis** ("sou profissional e quero aprender") → 6. formação ·
7. já aplica ou quer começar · 8. área · 9. desafio · 10. faturamento → agenda do
workshop.

**Ramo C · eventos e mentoria** ("quero escalar minha clínica") → 6. formação ·
7. clínica em operação ou em construção · 8. área · 9. desafios (**múltipla
escolha**) · 10. faturamento → agenda da mentoria.

Listas:

- **Formação** — dermatologista, médica(o), dentista, enfermeira(o),
  biomédica(o), esteticista com pós em injetáveis (essas seis **podem aplicar**);
  esteticista sem pós e outra formação (**não podem**).
- **Área de atuação** — injetáveis faciais, injetáveis corporais, procedimento de
  nariz, Outro.
- **Desafios do ramo C** — atrair pacientes com constância, time e processos,
  precificação e margem, agenda cheia e lucro baixo, escalar sem perder
  qualidade, quero saber mais de harmonização facial, quero saber mais de
  harmonização corporal.
- **Faturamento** — 7 faixas, de "até R$30.000" a "mais de R$1.000.000".

Toda opção **"Outro/Outra"** abre um campo: a Gabi pergunta qual antes de
seguir, e o que a pessoa escreve é o que aparece no card e no CRM.

---

## 4. Regras de negócio

- **Faturamento só nos ramos B e C**, sempre como última pergunta. Nunca para
  paciente — seria invasivo.
- **A partir de R$150 mil/mês o lead é prioritário**: a Gabi reconhece o momento
  antes de passar pro time e a tag do CRM ganha o sufixo `-prioritario`.
- **Sem habilitação para aplicar** (esteticista sem pós, outra formação) o lead
  sai do funil de vendas do workshop: mensagem gentil, pedido de permissão para
  nutrir, nenhum botão de comercial e **nenhum evento de conversão**.
- **Salvamento a cada etapa** (`parcial` → `completo` → `roteado` / `nutrir` /
  `agendado`), por `sendBeacon`: quem abandona no meio já é lead com telefone.
- **Estado em `localStorage`**: refresh no meio remonta a conversa inteira e
  volta para a pergunta pendente, inclusive no meio dos sub-passos.

## 5. Destinos

| ramo | destino | como |
|---|---|---|
| A · paciente | recepção da clínica | botão `wa.me` com mensagem pronta |
| B · injetáveis | workshop | agenda do Calendly no chat (WhatsApp como alternativa) |
| C · eventos e mentoria | mentoria | agenda do Calendly no chat (WhatsApp como alternativa) |

A agenda vai pré-preenchida com nome, e-mail e WhatsApp e usa as cores da marca.
Marcou o horário, o Calendly avisa a página por `postMessage`: o status vira
`agendado` e dispara o evento `Schedule`. Link vazio na config = aquele destino
cai no card de WhatsApp.

---

## 6. Voz (não negociável)

Quem fala é a **Dra. Gabriela, em primeira pessoa**, do ManyChat ao fim da
página. Ela conduz e recebe com elegância; não implora atenção.

- **Nunca**: diminutivo (rapidinho, perguntinha, cantinho), minimizar o tempo
  ("prometo que é rápido", "é só um minuto"), ou dar a entender que ela está
  respondendo ao vivo.
- **Enquadramento honesto**: "este é o meu canal, preparei ele para te receber".
  O cabeçalho marca *canal oficial*.
- **No handoff ela apresenta alguém do time que cuida por ela** — nunca "vou te
  passar pro comercial", nunca some.
- A copy do ManyChat e das etapas já foi aprovada. **Não reescrever sem pedido.**

## 7. Identidade

Vem do material da Imersão (Gestão de Clínicas · Método ASK): carmim `#a81419`,
creme `#f6e7d2`, preto `#0f0c0c`, serifa Playfair Display nos títulos, Open Sans
no corpo, e o fio geométrico do impresso ao fundo.

**Dois temas**, claro e noturno, opcionais: abre no que o aparelho pede, botão no
cabeçalho alterna, escolha fica salva. O CSS tem duas camadas — paleta da marca e
papel semântico (`--bg`, `--superficie`, `--texto`, `--cta-bg`…). Nenhuma regra
cita cor: mexer no token muda a página inteira. Cabeçalho carmim e bolha da
pessoa são iguais nos dois temas, de propósito.

Contraste é testado: a suíte mede os pares críticos no navegador e reprova abaixo
de 4,5:1 em texto pequeno e 3:1 em texto grande e em indicador gráfico.

---

## 8. Integrações (contratos)

Tudo opcional e configurável no bloco `CONFIG`, no topo do `<script>`:

| chave | para quê | sem ela |
|---|---|---|
| `WHATSAPP.{clinica,workshop,mentoria}` | os 3 números de destino | botão vai pra lugar nenhum — **trocar antes de publicar** |
| `CALENDLY.{workshop,mentoria}` | agenda automática | aquele destino cai no card de WhatsApp |
| `API_SAVE` | salvamento incremental → CRM | nada sai do navegador |
| `API_PROFILE` | foto e números do Instagram | card sai com o @ digitado |
| `API_PROXY_IMG` | proxy da foto do IG | a imagem pode não carregar (CDN bloqueia hotlink) |
| `API_FB_EVENT` | Conversions API | só o pixel do navegador, se houver ID |
| `META_PIXEL_ID` (no `<head>`) | Pixel | nenhum script de rastreio carrega |

`API_PROFILE` fala `{action:'start', username}` → `{status:'started', runId,
datasetId}` → `{action:'poll', …}` → `{status:'ok', profile:{…}}`; aceita também
resposta direta com `status:'ok'`. É o mesmo protocolo de outro funil da casa, dá
pra reaproveitar o back-end.

`window.FUNIL_CONFIG = {…}` antes do script sobrescreve qualquer chave sem editar
o arquivo (mescla rasa) — serve para ter teste e produção com os mesmos arquivos.

**Payload do lead:** `lead_ref`, `status`, `nome`, `telefone` (E.164), `email`,
`instagram`, `uf`, `prioridade`, `interesse` (A/B/C) e `interesse_texto`,
`formacao` e `formacao_outra`, `pode_aplicar`, `ja_atua`, `momento`, `nicho` e
`nicho_outra`, `desafio` e `desafios`, `faixa_faturamento`, `cidade`, `destino`,
`tag`, `agendado`, `agenda_evento`, `agenda_convite`, `ig_nome`, `ig_bio`,
`ig_seguidores`, `ig_posts`, `ig_verificado`, `ig_categoria`, `utm_*`, `fbclid`,
`referrer`, `enviado_em`.

**Rastreio:** UTM e `fbclid` capturados na entrada, preservando a primeira
atribuição. `Lead` dispara na **classificação** (destino definido) e `Schedule`
no agendamento — um por lead, mesmo `eventID` no Pixel e na CAPI. Abandono e
nutrição não disparam conversão: a campanha aprende com o lead qualificado.

---

## 9. Decisões já tomadas (não refazer)

1. **O pixel do funil de referência foi removido.** Colocar o ID de outra conta
   mandaria os leads para o gerenciador de anúncios de terceiro.
2. **O webhook do CRM não vai direto no navegador.** `API_SAVE` aponta para um
   endpoint próprio (uma function serve) que grava e repassa ao ClickUp — a URL
   do webhook ficaria visível no código da página.
3. **O Calendly não devolve o horário marcado por `postMessage`**, só os
   identificadores do evento e do convidado. Eles são gravados no CRM para o
   back-end enriquecer depois; a página não inventa data na tela.
4. **Foto do Instagram exige back-end.** O navegador não lê perfil do Instagram
   (CORS + login). Sem `API_PROFILE` o passo continua existindo, com o @ digitado.
5. **Sem framework, sem build, um arquivo.** Dado do usuário sempre passa por
   `esc()`; `innerHTML` só com template fixo do próprio arquivo.
6. **Faturamento nunca para paciente** e nunca antes do fim do ramo.

## 10. O que falta (lado do cliente)

1. Trocar os **3 números de WhatsApp** (hoje são placeholder).
2. Criar os **dois eventos no Calendly** — com o telefone como **primeira**
   pergunta personalizada, que é onde o link injeta o WhatsApp (`a1`) — e colar
   os links na config.
3. Subir o **endpoint de salvamento** e ligar no ClickUp.
4. Se quiser o preview real do Instagram: subir a **rota de perfil** e o **proxy
   de imagem**.
5. Configurar **Pixel e Conversions API**.
6. Publicar num **domínio ou subdomínio** e montar o fluxo no **ManyChat**
   (gatilho de novo seguidor, boas-vindas com botão, CTA com o link do funil e o
   **toggle de DM de lembrete ligado**) — o passo a passo está em
   `manychat-automacao.md`.

## 11. Estado atual

Funil completo e testado: 105 checagens verdes cobrindo os três ramos, o caminho
de nutrição, a retomada depois de refresh em cada etapa, o preview do Instagram
com e sem back-end, a agenda e a confirmação de agendamento, a marcação de lead
prioritário e o contraste nos dois temas. Tudo commitado e enviado para a branch.
