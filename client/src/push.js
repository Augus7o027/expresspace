// Push (PWA): registra o service worker e assina/desassina no servidor.
const urlB64ToU8 = (b64) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };

export function pushClient({ userId, apiJson }) {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let regP = null;
  const reg = () => (regP ??= navigator.serviceWorker.register("/sw.js").catch(() => null));
  if (supported) reg();
  return {
    supported,
    async status() {
      if (!supported) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      const r = await reg(); const sub = r && await r.pushManager.getSubscription();
      return sub ? "on" : "off";
    },
    async enable() {
      if (!supported) return { error: "sem suporte a push neste navegador" };
      const perm = await Notification.requestPermission(); if (perm !== "granted") return { error: "permissão de notificação negada" };
      const r = await reg(); if (!r) return { error: "service worker não registrou" };
      try {
        const { key } = await apiJson("GET", "/api/push/key");
        const sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(key) });
        await apiJson("POST", "/api/push/subscribe", { subscription: sub.toJSON(), userId });
        return { ok: true };
      } catch (e) { return { error: "não consegui assinar: " + e.message }; }
    },
    async disable() {
      const r = await reg(); const sub = r && await r.pushManager.getSubscription();
      if (sub) { await apiJson("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      return { ok: true };
    },
  };
}
