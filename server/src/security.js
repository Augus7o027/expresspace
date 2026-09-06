// Blindagem básica do servidor: cabeçalhos, limite de requisições, checagem de origem (CSRF),
// validação de entrada e bloqueio de SSRF. Sem dependências: tudo em memória e por processo.

// ---------- cabeçalhos ----------
// CSP: scripts só daqui + API do YouTube; iframes de qualquer https (telão/links são escolhidos pela equipe);
// estilos inline liberados (o app usa style="" e o Google Fonts); nada de plugins nem embutir o app em outro site.
export function securityHeaders({ secure }) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data:",
    "connect-src 'self' wss: https://www.youtube.com https://i.ytimg.com",
    "frame-src https: http://localhost:*",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(secure ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", csp);
    if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.removeHeader("X-Powered-By");
    next();
  };
}

// ---------- limite de requisições (janela deslizante simples por chave) ----------
export function rateLimiter({ windowMs, max, key = (req) => req.ip, message = "muitas requisições, tente de novo em instantes" }) {
  const hits = new Map(); // chave -> [timestamps]
  setInterval(() => { const cut = Date.now() - windowMs; for (const [k, arr] of hits) { const kept = arr.filter((t) => t > cut); if (kept.length) hits.set(k, kept); else hits.delete(k); } }, Math.max(windowMs, 60000)).unref();
  const check = (k) => {
    const now = Date.now(), cut = now - windowMs;
    const arr = (hits.get(k) || []).filter((t) => t > cut);
    if (arr.length >= max) { hits.set(k, arr); return false; }
    arr.push(now); hits.set(k, arr); return true;
  };
  const mw = (req, res, next) => { if (check(String(key(req)))) return next(); res.setHeader("Retry-After", Math.ceil(windowMs / 1000)); res.status(429).json({ error: message }); };
  mw.check = check;
  return mw;
}

// limitador por socket/evento: devolve true se pode; usado nos handlers do Socket.io
export function socketLimiter(maxPerWindow, windowMs) {
  let count = 0, start = Date.now();
  return () => { const now = Date.now(); if (now - start > windowMs) { start = now; count = 0; } return ++count <= maxPerWindow; };
}

// ---------- CSRF: requisições que mudam estado precisam vir da própria origem ----------
export function originCheck(allowed) {
  const ok = new Set(allowed.filter(Boolean));
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    if (!origin) return next(); // chamadas sem navegador (curl, scripts) não têm cookie de sessão útil sem SameSite
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
    const self = `${proto}://${req.headers.host}`;
    if (origin === self || ok.has(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) return next();
    res.status(403).json({ error: "origem não permitida" });
  };
}

// ---------- validação de entrada ----------
export const v = {
  str: (x, max = 200, { min = 0, name = "campo" } = {}) => { const s = typeof x === "string" ? x.trim() : ""; if (s.length < min) throw new Error(`${name}: obrigatório`); return s.slice(0, max); },
  int: (x, { min = 0, max = Number.MAX_SAFE_INTEGER, def = 0 } = {}) => { const n = Number.parseInt(x, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; },
  num: (x, { min = -Infinity, max = Infinity, def = 0 } = {}) => { const n = Number(x); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; },
  bool: (x, def = false) => (typeof x === "boolean" ? x : def),
  enumOf: (x, list, def = list[0]) => (list.includes(x) ? x : def),
  id: (x) => { const s = String(x || ""); if (!/^[\w.:-]{1,80}$/.test(s)) throw new Error("id inválido"); return s; },
  // http(s) absoluto ou caminho local; nada de javascript:, data: etc.
  url: (x, { allowEmpty = true } = {}) => { const s = String(x || "").trim().slice(0, 1000); if (!s) { if (allowEmpty) return ""; throw new Error("link obrigatório"); } if (!/^(https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/i.test(s)) throw new Error("link inválido (use http(s)://)"); return s; },
  email: (x) => { const s = String(x || "").trim().toLowerCase().slice(0, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error("e-mail inválido"); return s; },
  list: (x, max = 100) => (Array.isArray(x) ? x.slice(0, max) : []),
};

// ---------- SSRF: os agentes só podem buscar endereços públicos ----------
const PRIVATE = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^::1$/, /^fc00:/i, /^fe80:/i, /^\[?::/, /\.local$/i, /\.internal$/i, /^metadata\./i];
export function assertPublicUrl(u) {
  let url; try { url = new URL(String(u)); } catch { throw new Error("URL inválida"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("só http(s)");
  if (process.env.AGENT_ALLOW_LOCAL === "1") return url.toString(); // só em testes
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE.some((re) => re.test(host))) throw new Error("endereço interno bloqueado");
  if (/^\d+$/.test(host)) throw new Error("endereço numérico bloqueado");
  return url.toString();
}
