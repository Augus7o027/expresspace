# Documentação do ExpresSpace

Documentação viva do produto. Cada versão que entra no ar atualiza estes arquivos no mesmo commit do código (regra em `CLAUDE.md`, na raiz).

| Arquivo | O que responde |
|---|---|
| [01-visao-geral.md](01-visao-geral.md) | O que é o produto, quem usa, o que cada módulo faz, estado atual |
| [02-arquitetura.md](02-arquitetura.md) | Como as peças se encaixam: cliente, servidor, tempo real, voz, dados. Catálogo de rotas e eventos |
| [03-dados.md](03-dados.md) | Onde cada coisa é guardada: tabelas, coleções de documentos, arquivos em disco |
| [04-seguranca.md](04-seguranca.md) | Modelo de ameaças, o que já está blindado, o que falta, checklist antes de abrir pra público |
| [05-infraestrutura.md](05-infraestrutura.md) | Caminho de produção: o que está no ar hoje e a topologia recomendada por estágio |
| [06-operacao.md](06-operacao.md) | Runbook: deploy, variáveis, backup e restauração, incidentes, rotação de segredos |
| [07-desenvolvimento.md](07-desenvolvimento.md) | Rodar local, estrutura do código, testes, convenções, como adicionar uma feature |
| [CHANGELOG.md](CHANGELOG.md) | Histórico por versão |

Atalhos: `README.md` na raiz é a apresentação curta. `CLAUDE.md` é o contexto operacional que qualquer pessoa (ou assistente de IA) lê antes de mexer no código.
