// Contas (e-mail/senha), sessões por cookie assinado e cargos: admin | professor | member.
// Sem dependência externa: scrypt do Node pra senha, HMAC pro token.
import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) console.warn("[auth] SESSION_SECRET não definido: sessões caem a cada restart");
const COOKIE = "sede_session";
const TTL = 30 * 24 * 3600; // 30 dias
export const ROLES = ["admin", "professor", "member"];

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(String(pw), salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionFromCookie(header) { return verify(parseCookies(header)[COOKIE]); }
export function setSessionCookie(res, user, secure) {
  const token = sign({ uid: user.id, role: user.role, sv: user.sv || 0, exp: Math.floor(Date.now() / 1000) + TTL });
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}${secure ? "; Secure" : ""}`);
}
export function clearSessionCookie(res) { res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Cria o admin inicial a partir de ADMIN_EMAIL / ADMIN_PASSWORD se ainda não existir nenhum admin
export async function bootstrapAdmin(accounts) {
  const email = normEmail(process.env.ADMIN_EMAIL), pw = process.env.ADMIN_PASSWORD;
  const all = await accounts.list();
  if (all.some((u) => u.role === "admin")) return;
  if (!email || !pw) { console.warn("[auth] nenhum admin ainda. Defina ADMIN_EMAIL e ADMIN_PASSWORD pra criar o primeiro."); return; }
  await accounts.create({ email, name: process.env.ADMIN_NAME || "Admin", password: pw, role: "admin" });
  console.log(`[auth] admin inicial criado: ${email}`);
}

// Repositório de contas em cima do store de documentos
export function accountsRepo(store) {
  const C = "accounts";
  const pub = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role, avatar: u.avatar || null, premium: !!u.premium, reminders: u.reminders !== false, tourDone: !!u.tourDone, sv: u.sv || 0, created_at: u.created_at, last_login: u.last_login };
  const checkPassword = (pw) => { const p = String(pw || ""); if (p.length < 8) throw new Error("senha precisa de 8+ caracteres"); if (/^(.)\1+$/.test(p) || ["12345678", "password", "senha123", "qwertyui"].includes(p.toLowerCase())) throw new Error("senha fraca demais"); };
  return {
    pub,
    list: async () => (await store.listDocs(C)).map(pub),
    get: async (id) => store.getDoc(C, id),
    byEmail: async (email) => (await store.listDocs(C)).find((u) => u.email === normEmail(email)) || null,
    create: async ({ email, name, password, role = "member", avatar = null }) => {
      email = normEmail(email);
      if (!validEmail(email)) throw new Error("e-mail inválido");
      checkPassword(password);
      if (!ROLES.includes(role)) throw new Error("cargo inválido");
      if ((await store.listDocs(C)).some((u) => u.email === email)) throw new Error("e-mail já cadastrado");
      const id = crypto.randomUUID();
      const u = { id, email, name: String(name || email.split("@")[0]).slice(0, 24), role, avatar, pass: hashPassword(password), created_at: new Date().toISOString() };
      await store.putDoc(C, id, u);
      return pub(u);
    },
    update: async (id, patch) => {
      const u = await store.getDoc(C, id); if (!u) throw new Error("conta não existe");
      if (patch.name !== undefined) u.name = String(patch.name).slice(0, 24);
      if (patch.role !== undefined) { if (!ROLES.includes(patch.role)) throw new Error("cargo inválido"); u.role = patch.role; }
      if (patch.avatar !== undefined) u.avatar = patch.avatar;
      if (patch.premium !== undefined) u.premium = !!patch.premium;
      if (patch.reminders !== undefined) u.reminders = !!patch.reminders;
      if (patch.tourDone !== undefined) u.tourDone = !!patch.tourDone;
      if (patch.password) { checkPassword(patch.password); u.pass = hashPassword(patch.password); u.sv = (u.sv || 0) + 1; } // derruba sessões antigas
      if (patch.role !== undefined && patch.role !== u.role) u.sv = (u.sv || 0) + 1;
      if (patch.last_login) u.last_login = patch.last_login;
      await store.putDoc(C, id, u);
      return pub(u);
    },
    remove: async (id) => store.delDoc(C, id),
    login: async (email, password) => {
      const u = (await store.listDocs(C)).find((x) => x.email === normEmail(email));
      if (!u || !verifyPassword(password, u.pass)) return null;
      u.last_login = new Date().toISOString(); await store.putDoc(C, u.id, u);
      return pub(u);
    },
  };
}
