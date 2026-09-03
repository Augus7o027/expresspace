// Notificações: push (Web Push com VAPID) e e-mail (SMTP opcional).
// - VAPID: usa VAPID_PUBLIC/VAPID_PRIVATE se existirem; senão gera uma vez e guarda em docs (settings/vapid).
// - E-mail: só manda se SMTP_URL estiver definido (ex.: smtps://user:senha@smtp.gmail.com:465). MAIL_FROM opcional.
import webpush from "web-push";
import nodemailer from "nodemailer";

export async function notifyRepo(store, { subject = "mailto:admin@example.com" } = {}) {
  const C = "push";
  let keys = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  if (!keys.publicKey || !keys.privateKey) {
    const saved = await store.getDoc("settings", "vapid");
    if (saved?.publicKey) keys = saved;
    else { keys = webpush.generateVAPIDKeys(); await store.putDoc("settings", "vapid", keys); console.log("[push] chaves VAPID geradas e guardadas"); }
  }
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  const smtp = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  const from = process.env.MAIL_FROM || "ExpresSpace <no-reply@expresspace.local>";
  if (!smtp) console.log("[mail] SMTP_URL não definido: lembretes por e-mail desligados");

  const subsOf = async (userId) => (await store.listDocs(C)).filter((s) => s.userId === userId);

  return {
    publicKey: keys.publicKey,
    mailEnabled: !!smtp,
    // assinatura do navegador: { endpoint, keys: { p256dh, auth } }
    subscribe: async (userId, sub, ua = "") => {
      if (!sub?.endpoint || !sub?.keys?.p256dh) throw new Error("assinatura inválida");
      const id = Buffer.from(sub.endpoint).toString("base64url").slice(-48);
      await store.putDoc(C, id, { userId, sub, ua: String(ua).slice(0, 120), created_at: new Date().toISOString() });
      return id;
    },
    unsubscribe: async (endpoint) => { for (const s of await store.listDocs(C)) if (s.sub?.endpoint === endpoint) await store.delDoc(C, s.id); },
    // manda push pra um usuário (todas as assinaturas dele); apaga as que morreram (410/404)
    push: async (userId, payload) => {
      let sent = 0;
      for (const s of await subsOf(userId)) {
        try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 600 }); sent++; }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await store.delDoc(C, s.id); else console.warn("[push]", e.statusCode || e.message); }
      }
      return sent;
    },
    pushMany: async function (userIds, payload) { let n = 0; for (const id of new Set(userIds)) n += await this.push(id, payload); return n; },
    hasSubscription: async (userId) => (await subsOf(userId)).length > 0,
    mail: async (to, subject, text, html) => {
      if (!smtp || !to) return false;
      try { await smtp.sendMail({ from, to, subject, text, html: html || `<pre style="font-family:sans-serif;white-space:pre-wrap">${text}</pre>` }); return true; }
      catch (e) { console.warn("[mail]", e.message); return false; }
    },
  };
}
