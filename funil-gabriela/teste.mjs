/* Teste ponta a ponta do funil: os 3 ramos, o caminho de nutrição, a retomada
   depois do refresh, os dois temas e o contraste medido no navegador.

   Rode da raiz do repositório (é onde o playwright está instalado):
     node funil-gabriela/teste.mjs                                             */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORTA = 4333;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const SHOTS = process.env.SHOTS_DIR || '';

const leads = [];
const server = createServer(async (req, res) => {
  const rota = req.url.split('?')[0];
  if (rota === '/api/lead') {                        // back-end de mentira, só pra conferir o payload
    let body = ''; for await (const c of req) body += c;
    leads.push(JSON.parse(body));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return;
  }
  const arq = rota === '/' ? '/index.html' : rota;
  try {
    const b = await readFile(join(ROOT, arq));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arq)] || 'text/plain' }); res.end(b);
  } catch { res.writeHead(404); res.end('não encontrado'); }
});
await new Promise((r) => server.listen(PORTA, r));

/* usa o Chromium já instalado no ambiente quando o do playwright não estiver lá */
const CHROMIUM_LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(CHROMIUM_LOCAL) ? { executablePath: CHROMIUM_LOCAL } : {});

const erros = [];
const falhas = [];
const checa = (ok, msg) => { console.log(ok ? 'OK  ' : 'FALHOU ', msg); if (!ok) falhas.push(msg); };
const titulo = (t) => console.log(`\n=== ${t} ===`);

async function abrir({ backend = false, esquema = 'dark', tema = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, colorScheme: esquema });
  page.on('pageerror', (e) => erros.push(e.message));
  if (backend) await page.addInitScript(() => { window.FUNIL_CONFIG = { API_SAVE: '/api/lead' }; });
  if (tema) await page.addInitScript((t) => { try { localStorage.setItem('gabi_tema', t); } catch (e) {} }, tema);
  await page.goto(`http://localhost:${PORTA}/?utm_source=manychat&utm_campaign=novo-seguidor&fbclid=abc123`);
  return page;
}
const chip = async (p, t) => { const b = p.locator('.chips.show button.chip', { hasText: t }); await b.first().waitFor({ timeout: 30000 }); await b.first().click(); };
const digitar = async (p, v) => { await p.locator('#inputWrap.show #input').waitFor({ timeout: 30000 }); await p.fill('#input', v); await p.click('#sendBtn'); };
const escolher = async (p, v) => { await p.locator('#selectWrap.show #selectEl').waitFor({ timeout: 30000 }); await p.selectOption('#selectEl', v); await p.click('#selectBtn'); };
const comum = async (p, nome, fone) => { await digitar(p, nome); await digitar(p, fone); };
const shot = async (p, nome) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, nome), fullPage: false }); };
const pill = async (p) => (await p.locator('.step-pill').innerText()).toLowerCase();

/* contraste WCAG medido nas cores que o navegador realmente pintou */
const CONTRASTE = `(() => {
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const rgb = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
  const sobre = (frente, fundo) => {           // achata alpha sobre o fundo
    const a = frente[3] == null ? 1 : frente[3];
    return [0, 1, 2].map((i) => frente[i] * a + fundo[i] * (1 - a));
  };
  const paradas = (img) => {                   // cores de um gradiente, como candidatas a fundo
    const out = [];
    for (const m of img.matchAll(/rgba?\\(([^)]+)\\)/g)) {
      const c = m[1].split(',').map(Number);
      if (c.length >= 3 && (c[3] == null || c[3] > 0.92)) out.push(c.slice(0, 3));
    }
    return out;
  };
  const fundosDe = (el) => {                   // todos os fundos possíveis, do mais próximo ao mais distante
    let n = el;
    while (n) {
      const cs = getComputedStyle(n);
      const g = paradas(cs.backgroundImage || '');
      if (g.length) return g;                  // gradiente pintado: avalia cada parada
      const c = rgb(cs.backgroundColor);
      if (c.length >= 3 && (c[3] == null || c[3] > 0.92)) return [c.slice(0, 3)];
      n = n.parentElement;
    }
    return [[0, 0, 0]];
  };
  const contra = (cor, fundos, opacidade) => {
    let pior = Infinity;
    for (const fundo of fundos) {
      const c = opacidade == null || opacidade >= 1 ? cor : [cor[0], cor[1], cor[2], (cor[3] == null ? 1 : cor[3]) * opacidade];
      const [a, b] = [lum(sobre(c, fundo)), lum(fundo)].sort((x, y) => y - x);
      pior = Math.min(pior, (a + 0.05) / (b + 0.05));
    }
    return Math.round(pior * 100) / 100;
  };
  /* modo: 'texto' (cor do texto), 'fundo' (o próprio fundo do elemento, para
     indicadores gráficos) ou 'borda' (anel de foco e afins) */
  return (modo, seletor) => {
    const el = document.querySelector(seletor);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (modo === 'texto') return contra(rgb(cs.color), fundosDe(el), null);
    if (modo === 'fundo') {
      const g = paradas(cs.backgroundImage || '');
      const cor = g.length ? g[0] : rgb(cs.backgroundColor);
      return contra(cor, fundosDe(el.parentElement), Number(cs.opacity));
    }
    return contra(rgb(cs.borderTopColor), [rgb(cs.backgroundColor).slice(0, 3), ...fundosDe(el.parentElement)], null);
  };
})()`;

/* ------------------------------------------------------------------ RAMO A */
titulo('RAMO A · paciente (com back-end)');
{
  const p = await abrir({ backend: true });
  await comum(p, 'Ana Paula Ribeiro', '11988887777');
  await chip(p, 'Quero me cuidar e me tratar na sua clínica');
  await digitar(p, 'Belo Horizonte');
  await p.locator('.wa-bubble').waitFor({ timeout: 30000 });
  const href = await p.locator('.wa-btn').getAttribute('href');
  const txt = await p.locator('#chat').innerText();
  await shot(p, 'g-ramoA.png');
  checa(/wa\.me\/5511999999999/.test(href), 'A: botão vai pro número da clínica');
  checa(/Vim%20pelo%20canal%20da%20Dra\.%20Gabriela/.test(href), 'A: mensagem pré-preenchida');
  checa(/me%20tratar%20na%20sua%20cl%C3%ADnica/.test(href), 'A: tema certo na mensagem');
  checa(/Minha recepção/.test(txt), 'A: card da recepção');
  checa(!/faturamento/i.test(txt), 'A: paciente não recebe pergunta de faturamento');
  checa(await pill(p) === 'etapa 4/4', 'A: contador fecha em 4/4');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('gabi_funil_v1')));
  checa(st.data.destino === 'clinica' && st.data.status === 'roteado', 'A: estado salvo como roteado');
  const roteado = leads.filter((l) => l.status === 'roteado').pop();
  checa(leads.length >= 4, `A: salvou a cada etapa (${leads.length} envios)`);
  checa(roteado && roteado.telefone === '+5511988887777', 'A: telefone em E.164');
  checa(roteado && roteado.utm_source === 'manychat' && roteado.fbclid === 'abc123', 'A: UTM e fbclid no payload');
  checa(roteado && roteado.tag === 'clinica-paciente', 'A: tag de destino');
  checa(!!leads.find((l) => l.status === 'parcial' && l.telefone && !l.interesse), 'A: parcial com telefone antes da qualificação');
  await p.close();
}

/* ------------------------------------------------------------------ RAMO B */
titulo('RAMO B · injetáveis, elegível');
{
  const p = await abrir();
  await comum(p, 'Carla Mendes', '21987654321');
  await chip(p, 'Sou profissional e quero aprender');
  await escolher(p, 'Enfermeira(o)');
  await chip(p, 'Já aplico hoje');
  await escolher(p, 'Harmonização facial');
  await chip(p, 'Resultados que não se repetem');
  await escolher(p, 'De R$70.000 a R$150.000');
  await p.locator('.wa-bubble').waitFor({ timeout: 30000 });
  const href = await p.locator('.wa-btn').getAttribute('href');
  const txt = await p.locator('#chat').innerText();
  await shot(p, 'g-ramoB.png');
  checa(/Workshop/.test(txt), 'B: fecho do Workshop');
  checa(/Workshop%20de%20injet%C3%A1veis/.test(href), 'B: tema do workshop no link');
  checa(/De R\$70\.000 a R\$150\.000/.test(txt), 'B: faturamento perguntado por último');
  checa(await pill(p) === 'etapa 8/8', 'B: contador 8/8');
  await p.close();
}

titulo('RAMO B · não elegível (nutrir)');
{
  const p = await abrir({ backend: true });
  const antes = leads.length;
  await comum(p, 'Juliana Alves', '31987654321');
  await chip(p, 'Sou profissional e quero aprender');
  await escolher(p, 'Esteticista sem pós em injetáveis');
  await chip(p, 'Pode sim, quero receber');
  await p.locator('#chat .row.bot', { hasText: 'Fico feliz' }).waitFor({ timeout: 30000 });
  const txt = await p.locator('#chat').innerText();
  await shot(p, 'g-nutrir.png');
  checa(/habilitação para aplicar/.test(txt), 'nutrir: mensagem gentil, sem rejeição seca');
  checa(!(await p.locator('.wa-btn').count()), 'nutrir: não roteia pra vendas');
  checa(!!leads.slice(antes).find((l) => l.status === 'nutrir' && l.tag === 'nutrir-aceitou'), 'nutrir: salvo com tag de nutrição');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('gabi_funil_v1')));
  checa(!st.data.leadEnviado, 'nutrir: não dispara evento de conversão');
  await p.close();
}

/* ------------------------------------------------------------------ RAMO C */
titulo('RAMO C · mentoria, com refresh no meio');
{
  const p = await abrir();
  await comum(p, 'Renata Duarte Lima', '11912345678');
  await chip(p, 'Quero escalar minha clínica');
  await escolher(p, 'Dermatologista');
  await chip(p, 'Já tenho clínica em operação');
  await p.reload();
  await p.locator('#selectWrap.show #selectEl').waitFor({ timeout: 30000 });
  const replay = await p.locator('#chat').innerText();
  checa(/Continuando de onde você parou/.test(replay), 'C: retoma depois do refresh');
  checa(/Renata Duarte Lima/.test(replay) && /Dermatologista/.test(replay), 'C: conversa remontada');
  checa(await pill(p) === 'etapa 5/8', 'C: contador preservado');
  await escolher(p, 'Estética corporal');
  await chip(p, 'Escalar sem perder qualidade');
  await escolher(p, 'Mais de R$1.000.000');
  await p.locator('.wa-bubble').waitFor({ timeout: 30000 });
  const href = await p.locator('.wa-btn').getAttribute('href');
  const txt = await p.locator('#chat').innerText();
  await shot(p, 'g-ramoC.png');
  checa(/altíssima confiança/.test(txt), 'C: fecho da mentoria');
  checa(/eventos%20e%20a%20mentoria/.test(href), 'C: tema da mentoria no link');
  await p.reload();
  await p.locator('.wa-bubble').waitFor({ timeout: 30000 });
  checa(!(await p.locator('.chips.show').count()), 'C: concluído não repergunta nada');
  await p.close();
}

/* ------------------------------------------------------------------ TEMA */
titulo('TEMA · escolha, memória e sistema');
{
  const p = await abrir();                                  // sistema no escuro
  checa(await p.locator('html').getAttribute('data-tema') === 'escuro', 'padrão: noturno quando o sistema está escuro');
  checa(await p.locator('.tema-btn .ic-sol').isVisible(), 'no noturno o botão oferece a luz (ícone de sol)');
  checa(await p.locator('#temaBtn').getAttribute('aria-pressed') === 'false', 'aria-pressed=false no noturno');
  await p.click('#temaBtn');
  checa(await p.locator('html').getAttribute('data-tema') === 'claro', 'toque no botão acende o tema claro');
  checa(await p.locator('.tema-btn .ic-lua').isVisible(), 'no claro o botão oferece a noite (ícone de lua)');
  checa(await p.locator('#temaBtn').getAttribute('aria-pressed') === 'true', 'aria-pressed=true no claro');
  checa(await p.locator('meta[name="theme-color"]').getAttribute('content') === '#f5ece0', 'barra do navegador acompanha o tema');
  checa(await p.evaluate(() => localStorage.getItem('gabi_tema')) === 'claro', 'escolha fica salva');
  await p.reload();
  checa(await p.locator('html').getAttribute('data-tema') === 'claro', 'escolha sobrevive ao refresh');
  await p.close();

  const sistemaClaro = await abrir({ esquema: 'light' });    // sistema no claro, sem escolha salva
  checa(await sistemaClaro.locator('html').getAttribute('data-tema') === 'claro', 'sem escolha salva, segue a preferência do sistema');
  await sistemaClaro.close();

  const escolhaManda = await abrir({ esquema: 'light', tema: 'escuro' });
  checa(await escolhaManda.locator('html').getAttribute('data-tema') === 'escuro', 'escolha da pessoa manda mais que o sistema');
  await escolhaManda.close();

  /* a troca no meio da conversa não perde nada */
  const meio = await abrir();
  await comum(meio, 'Marina Costa', '11955554444');
  await chip(meio, 'Quero escalar minha clínica');
  await meio.locator('#selectWrap.show #selectEl').waitFor({ timeout: 30000 });
  await meio.click('#temaBtn');
  const dep = await meio.locator('#chat').innerText();
  const segue = await meio.locator('#selectWrap.show').count() === 1;
  checa(/Marina Costa/.test(dep) && segue, 'trocar de tema no meio não interrompe a conversa');
  await escolher(meio, 'Dentista');
  await meio.locator('#chat .row.bot', { hasText: 'clínica em operação' }).waitFor({ timeout: 30000 });
  checa(await meio.locator('html').getAttribute('data-tema') === 'claro', 'a conversa continua no tema escolhido');
  await meio.close();
}

/* --------------------------------------------------- CONTRASTE NOS 2 TEMAS */
titulo('CONTRASTE (WCAG) nos dois temas');
for (const tema of ['escuro', 'claro']) {
  const p = await abrir({ tema });
  const medir = async (sel, modo = 'texto') => p.evaluate(([fn, m, s]) => eval(fn)(m, s), [CONTRASTE, modo, sel]);
  const conferir = async (alvos) => {
    for (const [sel, min, nome, modo] of alvos) {
      const r = await medir(sel, modo || 'texto');
      checa(r !== null && r >= min, `${tema}: ${nome} ${r}:1 (mínimo ${min}:1)`);
    }
  };
  await comum(p, 'Sofia Martins', '11933332222');
  await p.locator('.chips.show .chip').first().waitFor({ timeout: 30000 });
  await conferir([                                  // com as opções na tela
    ['.row.bot .bubble', 4.5, 'texto da Gabi'],
    ['.row.user .bubble', 4.5, 'texto da pessoa (sobre o carmim)'],
    ['.chips.show .chip', 4.5, 'texto do chip'],
    ['.lgpd', 4.5, 'nota de LGPD'],
    ['.brand-nome', 3, 'nome no cabeçalho (grande, sobre o carmim)'],
    ['.brand-sub', 4.5, 'linha "canal oficial"'],
    ['.step-pill', 4.5, 'pílula de etapa'],
  ]);
  await conferir([['.progress-line i', 3, 'barra de progresso', 'fundo']]);
  await chip(p, 'Quero me cuidar e me tratar na sua clínica');
  await p.locator('#inputWrap.show #input').waitFor({ timeout: 30000 });
  await conferir([['.chip.ghost', 4.5, 'chip fantasma (pular)'], ['.field-label', 4.5, 'rótulo do campo']]);
  await p.focus('#input');                          // anel de foco é componente: mínimo 3:1
  await p.waitForTimeout(350);                      // deixa a transição de cor terminar
  await conferir([['.input-wrap', 3, 'anel de foco do campo', 'borda']]);
  await digitar(p, 'Curitiba');
  await p.locator('.wa-bubble').waitFor({ timeout: 30000 });
  await shot(p, `g-tema-${tema}.png`);
  await conferir([                                  // com o card de handoff na tela
    ['.wa-kicker', 4.5, 'kicker do card'],
    ['.wa-title', 3, 'título do card (grande)'],
    ['.wa-sub', 4.5, 'descrição do card'],
    ['.wa-btn', 4.5, 'texto do CTA'],
    ['.wa-item span:first-child', 4.5, 'rótulo da lista'],
    ['.wa-item span:last-child', 4.5, 'valor da lista'],
    ['.wa-foot', 4.5, 'rodapé do card'],
  ]);
  await p.close();

  const digitando = await abrir({ tema });          // pega o indicador de digitação no ar
  await digitando.locator('.typing').first().waitFor({ timeout: 15000 });
  const rDots = await digitando.evaluate(([fn, s]) => eval(fn)('fundo', s), [CONTRASTE, '.typing i']);
  checa(rDots !== null && rDots >= 3, `${tema}: pontinhos de "digitando" ${rDots}:1 (mínimo 3:1)`);
  await digitando.close();
}

titulo('geral');
{
  const p = await abrir();
  checa(/LGPD/.test(await p.locator('#lgpd').innerText()), 'linha de consentimento visível');
  checa(/canal oficial/i.test(await p.locator('.brand-sub').innerText()), 'cabeçalho deixa claro que é canal oficial');
  const proibidas = /rapidinho|perguntinha|cantinho|de pertinho|prometo que é rápido|é só um minuto|ao vivo|agora mesmo respondendo/i;
  checa(!proibidas.test(await p.content()), 'copy sem diminutivo, sem minimizar tempo e sem sugerir resposta ao vivo');
  await p.close();
}
checa(erros.length === 0, 'sem erros de js: ' + JSON.stringify(erros));

await browser.close(); server.close();
console.log(falhas.length ? `\n>>> ${falhas.length} CHECAGEM(NS) FALHARAM` : '\n>>> tudo verde');
process.exit(falhas.length ? 1 : 0);
