// Agenda de eventos (aulas ao vivo no palco): CRUD + relógio que lembra 15 min antes (push + e-mail),
// coloca o link no telão na hora e avisa quem está no espaço.
import crypto from "node:crypto";

const C = "events";
export const REMIND_MIN = 15;

export function eventsRepo(store) {
  const clean = (e) => ({ id: e.id, title: e.title, description: e.description || "", startsAt: e.startsAt, durationMin: e.durationMin, url: e.url || "", zone: e.zone || "auditorio", objectId: e.objectId || "telao", createdBy: e.createdBy, remindedAt: e.remindedAt || null, startedAt: e.startedAt || null });
  return {
    list: async () => (await store.listDocs(C)).map(clean).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    get: async (id) => { const e = await store.getDoc(C, id); return e ? clean(e) : null; },
    // próximos + ao vivo (pra barra lateral e biblioteca)
    upcoming: async function (now = Date.now()) {
      return (await this.list()).filter((e) => new Date(e.startsAt).getTime() + e.durationMin * 60000 > now - 5 * 60000)
        .map((e) => ({ ...e, live: new Date(e.startsAt).getTime() <= now && new Date(e.startsAt).getTime() + e.durationMin * 60000 > now }));
    },
    put: async (data, by) => {
      const id = data.id || crypto.randomUUID();
      const cur = data.id ? await store.getDoc(C, id) : null;
      const startsAt = new Date(data.startsAt);
      if (Number.isNaN(startsAt.getTime())) throw new Error("data/hora inválida");
      const title = String(data.title || "").trim().slice(0, 80); if (!title) throw new Error("dê um título");
      const e = {
        ...(cur || {}), id, title, description: String(data.description || "").slice(0, 1000), startsAt: startsAt.toISOString(),
        durationMin: Math.min(600, Math.max(5, parseInt(data.durationMin, 10) || 60)), url: String(data.url || "").trim().slice(0, 500),
        zone: String(data.zone || "auditorio"), objectId: String(data.objectId || "telao"), createdBy: cur?.createdBy || by,
      };
      // remarcou: volta a lembrar/anunciar
      if (cur && cur.startsAt !== e.startsAt) { e.remindedAt = null; e.startedAt = null; }
      await store.putDoc(C, id, e);
      return clean(e);
    },
    remove: (id) => store.delDoc(C, id),
    mark: async (id, patch) => { const e = await store.getDoc(C, id); if (e) await store.putDoc(C, id, { ...e, ...patch }); },
  };
}

const fmt = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: process.env.TZ_DISPLAY || "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// roda a cada 10s
export function startEventClock({ events, accounts, notify, onRemind, onStart }) {
  const tick = async () => {
    const now = Date.now();
    for (const e of await events.list()) {
      const t = new Date(e.startsAt).getTime();
      if (!e.remindedAt && t - now <= REMIND_MIN * 60000 && t > now - 60000) {
        await events.mark(e.id, { remindedAt: new Date().toISOString() });
        const users = await accounts.list();
        const when = fmt(e.startsAt);
        const text = `"${e.title}" começa em ${Math.max(1, Math.round((t - now) / 60000))} min (${when}) no ${e.zone === "auditorio" ? "Auditório" : e.zone}. Entre no espaço e vá até o palco.`;
        let mails = 0, pushes = 0;
        for (const u of users) {
          if (u.reminders === false) continue;
          if (await notify.mail(u.email, `Começa em ${REMIND_MIN} min: ${e.title}`, text + `\n\n${process.env.CLIENT_ORIGIN || ""}`)) mails++;
          pushes += await notify.push(u.id, { title: `Em ${REMIND_MIN} min: ${e.title}`, body: text, url: "/", tag: "event:" + e.id });
        }
        console.log(`[eventos] lembrete "${e.title}": ${mails} e-mails, ${pushes} push`);
        onRemind?.(e);
      }
      if (!e.startedAt && t <= now && t > now - 10 * 60000) {
        await events.mark(e.id, { startedAt: new Date().toISOString() });
        await onStart?.(e);
      }
    }
  };
  setTimeout(tick, 5000);
  return setInterval(() => tick().catch((err) => console.warn("[eventos]", err.message)), 10000);
}
