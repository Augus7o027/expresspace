# Roteiro de ações · montar a automação no ManyChat

Escrito para um **agente de navegador** executar passo a passo na interface do
ManyChat. Cada ação tem o que fazer, como confirmar que deu certo e o que fazer
quando a tela não bate com a descrição.

A interface do ManyChat muda de tempos em tempos e varia por plano e idioma.
Por isso nada aqui é localizado por posição na tela: tudo é identificado pelo
**texto visível**, com alternativas em português e inglês. Quando um alvo não
existir com nenhum dos nomes listados, **pare e relate** — não tente adivinhar
um caminho equivalente.

---

## 0. Variáveis desta execução

Preencha antes de começar. Se algum campo estiver vazio, pare e peça.

| variável | valor |
|----------|-------|
| `URL_FUNIL` | `https://SEU-DOMINIO/?utm_source=instagram&utm_medium=manychat&utm_campaign=novo-seguidor` |
| `NOME_FLUXO` | `Funil de Conexão · Novo Seguidor` |
| `CONTA_IG` | @_______ (a conta que deve aparecer selecionada no ManyChat) |

Textos (copiar e colar **exatamente**, acentos e emojis incluídos — a voz é da
Dra. Gabriela e já foi aprovada; não reescreva, não resuma, não "melhore"):

- **MSG_1** — `Que bom ter você aqui comigo. 💛 Sou eu, a Gabi. Quero te conhecer melhor para te receber do jeito certo. Vamos?`
- **BOTAO_1** — `Quero conversar com você`
- **MSG_2** — `Preparei um espaço para a gente se conhecer. Toque abaixo que eu te recebo.`
- **BOTAO_2** — `Começar nossa conversa`
- **MSG_LEMBRETE** — `Deixei um convite aqui para você e ainda não te vi passar. Quando quiser, é só tocar. 💛`

## Regras de conduta do agente

1. **Não invente credenciais.** A sessão já deve estar logada. Se aparecer tela
   de login, 2FA, código por e-mail ou seleção de conta desconhecida: pare e
   relate.
2. **Não mexa no que não é seu.** Nenhum outro fluxo, automação, tag, campo
   personalizado, integração ou configuração da conta pode ser alterado. Não
   apague nada em nenhuma hipótese.
3. **Não aprove cobrança.** Se qualquer passo exigir upgrade de plano, trial ou
   cartão: pare, tire print e relate. Nunca confirme uma compra.
4. **Print em cada conferência.** Toda ação abaixo termina com uma verificação;
   registre a tela nesse momento.
5. **Uma tentativa, depois relate.** Se um clique não produzir o resultado
   esperado, tente uma vez mais. Falhou de novo: pare e relate com print.
6. **Só publique no passo 8.** Antes disso, o fluxo fica em rascunho.

---

## 1. Abrir o painel e confirmar a conta

**Fazer:** abrir `https://app.manychat.com`. Localizar o seletor de conta (canto
superior, mostra a foto e o nome da página conectada).

**Conferir:** a conta selecionada é a `CONTA_IG`. Existe um ícone/aba de
Instagram indicando que o canal está conectado.

**Se não bater:** conta diferente → trocar pelo seletor. Instagram não conectado
→ **pare e relate** (conectar canal envolve permissões da conta e não é tarefa
do agente).

## 2. Criar a automação

**Fazer:** no menu lateral, abrir **Automation** (também aparece como
"Automações" ou "Flows"). Clicar em **+ New Automation** / **Novo** / **+ New
Flow**. Se aparecer galeria de modelos, escolher **Start from Scratch** /
**Começar do zero**.

**Conferir:** abriu um editor de fluxo vazio, com um espaço para nome no topo.

**Fazer:** renomear o fluxo para `NOME_FLUXO` (clicar no nome atual, geralmente
"Untitled"/"Sem título", digitar, confirmar com Enter ou clicando fora).

**Conferir:** o nome novo aparece no topo do editor.

## 3. Definir o gatilho: novo seguidor

**Fazer:** clicar em **New Trigger** / **Add Trigger** / **Novo gatilho**.
Escolher o canal **Instagram**. Na lista de gatilhos, escolher **New Follower**
(aparece também como "Novo seguidor").

**Conferir:** o cartão de gatilho no fluxo diz Instagram → New Follower. O
ManyChat costuma avisar que a mensagem sai alguns minutos depois de a pessoa
seguir (cerca de 5) — isso é esperado, não é erro.

**Se não bater:** o gatilho não aparece na lista ou aparece bloqueado com
cadeado/etiqueta de plano → **pare e relate**: o gatilho de novo seguidor exige
plano Pro. Não inicie upgrade.

## 4. Mensagem 1 — boas-vindas com botão

**Fazer:** a partir do gatilho, adicionar um passo de mensagem do Instagram
(**Send Message** / **Instagram Message** / "Mensagem"). No bloco de texto,
colar `MSG_1`.

**Fazer:** dentro do mesmo bloco, adicionar um botão (**+ Add Button** /
"Adicionar botão"). Título do botão: `BOTAO_1`. Ação do botão: encaminhar para o
próximo passo do fluxo — a opção costuma se chamar **Next Step**, **Go to
Flow/Step** ou "Próximo passo". **Não** use ação de link aqui: este botão é só
o aceite da conversa.

**Conferir:** o texto está idêntico ao `MSG_1` (confira os acentos e o 💛), o
botão aparece abaixo do texto com o título certo, e sai do botão uma ligação
para um próximo passo (ainda vazio).

## 5. Mensagem 2 — CTA com o link do funil

**Fazer:** no passo ligado ao `BOTAO_1`, adicionar outra mensagem do Instagram.
Colar `MSG_2` no texto.

**Fazer:** adicionar um botão com título `BOTAO_2` e ação de abrir site
(**Open Website** / **URL** / "Abrir site"). Colar a `URL_FUNIL` **inteira**,
com os parâmetros `utm_*`.

**Conferir (importante):** reabra o botão e confirme que a URL salva continua
com `?utm_source=...&utm_medium=...&utm_campaign=...`. Alguns editores cortam
tudo depois do `?` quando a URL é digitada em vez de colada. Se cortou, apague
o botão e refaça colando a URL de uma vez.

**Conferir:** o fluxo agora é gatilho → mensagem 1 → (botão) → mensagem 2.

## 6. Ligar a DM de lembrete

**Fazer:** ainda no passo da mensagem 2, procurar a opção de lembrete ligada ao
envio de link. Ela aparece como **"Send a reminder if the link is not opened"**,
"DM de lembrete", "Link reminder" ou similar — costuma estar dentro das opções
do próprio botão de link ou logo abaixo do bloco de mensagem, e vem
**desligada** por padrão. Ligar o interruptor.

**Fazer:** se abrir um campo de texto para o lembrete, colar `MSG_LEMBRETE`. Se
oferecer prazo (ex.: "após 1 hora"), manter o padrão sugerido pelo ManyChat.

**Conferir:** o interruptor está ligado e o texto do lembrete é o `MSG_LEMBRETE`.

**Se não achar a opção:** procure também nas configurações do passo (ícone de
engrenagem ou menu "..."). Não encontrou em nenhum lugar → **pare e relate**,
com print da tela do passo e do painel de opções aberto. Não improvise um
segundo fluxo com espera/atraso para simular o lembrete sem autorização.

## 7. Revisar antes de publicar

Confira, um a um, e registre:

- [ ] nome do fluxo é `NOME_FLUXO`;
- [ ] gatilho: Instagram → New Follower;
- [ ] mensagem 1 com o texto exato e o botão `BOTAO_1` apontando para o próximo passo;
- [ ] mensagem 2 com o texto exato e o botão `BOTAO_2` abrindo a `URL_FUNIL` com os UTMs;
- [ ] lembrete ligado, com o texto exato;
- [ ] nenhum passo órfão, nenhum bloco vazio, nenhum texto de exemplo do ManyChat sobrando.

## 8. Publicar

**Fazer:** clicar em **Publish** / **Set Live** / "Publicar". Se o ManyChat
apontar erro de validação, ler a mensagem, corrigir só o que ela aponta e
publicar de novo.

**Conferir:** o fluxo mostra estado **Live** / "Ativo", e o gatilho aparece como
ativo (não pausado).

## 9. Teste e evidência

**Fazer:** usar o teste do próprio ManyChat (**Preview** / "Testar este fluxo"),
que envia a sequência para a sua própria DM.

**Conferir na DM:** chegou a mensagem 1 com o botão; ao tocar, chegou a mensagem
2 com o botão de link; ao tocar no link, abriu o funil e a página mostrou a
primeira pergunta da Gabi.

**Observação:** o gatilho real só dispara para quem seguir a conta depois da
publicação, e com alguns minutos de atraso. Não fique esperando o disparo
automático na hora do teste, e **não** deixe de seguir/seguir de novo com contas
reais para forçar.

**Relatar ao final:**
1. link do fluxo publicado (URL do editor);
2. prints: gatilho, mensagem 1, mensagem 2 com a URL aberta à vista, lembrete
   ligado, selo de Live, e a DM de teste;
3. a `URL_FUNIL` exatamente como ficou salva no botão;
4. qualquer divergência entre a tela e este roteiro.

## 10. Como desfazer

Nada aqui apaga dado nenhum. Para desligar: abrir o fluxo, pausar o gatilho
(interruptor no cartão do gatilho) ou voltar o fluxo para rascunho
(**Unpublish** / "Despublicar"). Desligar o lembrete é o mesmo interruptor do
passo 6. Só apague o fluxo se for pedido explicitamente.
