// Configurações: microfone, saída, câmera (com medidor e teste de eco), notificações e tour.
// Dispositivos ficam salvos no navegador (sede:devices); a voz troca sem derrubar as conexões.
const $ = (s, r = document) => r.querySelector(s);
const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };
export const loadDevices = () => safe(() => JSON.parse(localStorage.getItem("sede:devices") || "{}"), {}) || {};
const saveDevices = (d) => safe(() => localStorage.setItem("sede:devices", JSON.stringify(d)));

export function openSettings(body, { voice, push, prefs, onTour, toast }) {
  body.innerHTML = "";
  const root = document.createElement("div"); root.className = "sp-form settings";
  const devices = loadDevices();
  const section = (t) => { const h = document.createElement("div"); h.className = "sp-hint"; h.textContent = t; root.append(h); };
  const row = (label, ctrl) => { const r = document.createElement("label"); r.className = "set-row"; const l = document.createElement("span"); l.textContent = label; r.append(l, ctrl); root.append(r); return r; };
  const sel = (id) => { const s = document.createElement("select"); s.id = id; s.className = "set-sel"; return s; };
  const mic = sel("set-mic"), out = sel("set-out"), cam = sel("set-cam");
  const canSink = "setSinkId" in HTMLMediaElement.prototype;

  section("áudio e vídeo");
  row("microfone", mic);
  const outRow = row("saída (alto-falante / fone)", out);
  if (!canSink) { out.disabled = true; out.title = "este navegador não deixa escolher a saída (use o Chrome/Edge)"; outRow.classList.add("dim"); }
  row("câmera", cam);

  // medidor do microfone (ao vivo) + teste de eco
  const meterWrap = document.createElement("div"); meterWrap.className = "set-meter";
  meterWrap.innerHTML = `<div class="ac-meter"><div id="set-level" class="ac-level"></div></div><div class="set-meter-row"><span class="mono dim" id="set-meter-txt">fale alguma coisa pra ver o nível</span><button type="button" class="sp-btn" id="set-echo">Teste de eco (3s)</button></div>`;
  root.append(meterWrap);
  const level = $("#set-level", meterWrap), meterTxt = $("#set-meter-txt", meterWrap), echoBtn = $("#set-echo", meterWrap);

  section("notificações");
  const pushChk = document.createElement("input"); pushChk.type = "checkbox";
  const pushRow = row("avisar no celular/computador quando me mencionarem ou uma aula começar (push)", pushChk);
  const mailChk = document.createElement("input"); mailChk.type = "checkbox";
  const mailRow = row("lembrete por e-mail 15 min antes das aulas", mailChk);
  section("ajuda");
  const tourBtn = document.createElement("button"); tourBtn.type = "button"; tourBtn.className = "sp-btn"; tourBtn.textContent = "Refazer o tour de boas-vindas";
  tourBtn.onclick = () => { onTour?.(); };
  root.append(tourBtn);
  body.append(root);

  // ---- dispositivos ----
  const fill = async () => {
    let list = [];
    try { list = await navigator.mediaDevices.enumerateDevices(); } catch {}
    const put = (s, kind, cur, label) => {
      s.innerHTML = "";
      const def = document.createElement("option"); def.value = ""; def.textContent = "padrão do sistema"; s.append(def);
      for (const d of list.filter((x) => x.kind === kind)) { const o = document.createElement("option"); o.value = d.deviceId; o.textContent = d.label || `${label} ${s.length}`; s.append(o); }
      s.value = [...s.options].some((o) => o.value === cur) ? cur : "";
    };
    put(mic, "audioinput", devices.mic || "", "microfone"); put(out, "audiooutput", devices.out || "", "saída"); put(cam, "videoinput", devices.cam || "", "câmera");
    if (list.length && !list.some((d) => d.label)) meterTxt.textContent = "libere o microfone (botão do mic) pra ver os nomes dos dispositivos";
  };
  fill();
  navigator.mediaDevices?.addEventListener?.("devicechange", fill);
  mic.onchange = async () => { devices.mic = mic.value; saveDevices(devices); if (await voice.setMicDevice(mic.value)) toast("microfone trocado"); else toast("não consegui usar esse microfone"); };
  out.onchange = async () => { devices.out = out.value; saveDevices(devices); await voice.setOutputDevice(out.value); toast("saída trocada"); };
  cam.onchange = async () => { devices.cam = cam.value; saveDevices(devices); await voice.setCamDevice(cam.value); toast("câmera trocada"); };

  // ---- medidor ao vivo ----
  let raf = 0;
  const tick = () => {
    if (!body.contains(root)) { cancelAnimationFrame(raf); return; }
    const lv = voice.stream ? voice.level(voice.myAnalyser) : 0;
    level.style.width = Math.min(100, lv * 600) + "%";
    if (voice.stream) meterTxt.textContent = lv > 0.02 ? "captando ✓" : "fale alguma coisa pra ver o nível";
    else meterTxt.textContent = "microfone desligado (M liga)";
    raf = requestAnimationFrame(tick);
  };
  tick();

  // ---- teste de eco: grava 3s do mic e toca de volta na saída escolhida ----
  echoBtn.onclick = async () => {
    if (!voice.stream) { const ok = await voice.enableMic(); if (!ok) return toast("sem acesso ao microfone"); }
    echoBtn.disabled = true; echoBtn.textContent = "gravando… fale";
    try {
      const rec = new MediaRecorder(voice.raw); const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        echoBtn.textContent = "tocando…";
        const a = new Audio(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
        try { if (devices.out && a.setSinkId) await a.setSinkId(devices.out); } catch {}
        a.onended = () => { echoBtn.disabled = false; echoBtn.textContent = "Teste de eco (3s)"; };
        a.play().catch(() => { echoBtn.disabled = false; echoBtn.textContent = "Teste de eco (3s)"; });
      };
      rec.start(); setTimeout(() => rec.stop(), 3000);
    } catch (e) { toast("teste de eco indisponível: " + e.message); echoBtn.disabled = false; echoBtn.textContent = "Teste de eco (3s)"; }
  };

  // ---- notificações ----
  const paintPush = async () => {
    const st = await push.status();
    pushChk.checked = st === "on"; pushChk.disabled = st === "unsupported" || st === "denied";
    pushRow.title = st === "unsupported" ? "este navegador não suporta push (no iPhone, instale o app na tela de início)" : st === "denied" ? "notificações bloqueadas no navegador" : "";
    if (st === "unsupported" || st === "denied") pushRow.classList.add("dim");
  };
  paintPush();
  pushChk.onchange = async () => { const r = pushChk.checked ? await push.enable() : await push.disable(); if (r?.error) toast(r.error); paintPush(); };
  mailChk.checked = !!prefs.reminders; if (!prefs.account) { mailChk.disabled = true; mailRow.classList.add("dim"); mailRow.title = "só pra quem tem conta"; }
  if (!prefs.mailEnabled) { mailRow.title = "o servidor ainda não tem e-mail configurado (SMTP_URL)"; mailRow.classList.add("dim"); }
  mailChk.onchange = () => prefs.setReminders(mailChk.checked);
}
