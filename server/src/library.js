// Biblioteca (área de membros): aulas, skills, prompts, automações, templates e links,
// com arquivos hospedados no próprio servidor (DATA_DIR/uploads) e progresso por membro.
import path from "node:path";
import crypto from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, statSync } from "node:fs";

export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const TYPES = ["aula", "skill", "prompt", "automacao", "template", "link"];
export const TYPE_LABEL = { aula: "Aula", skill: "Skill", prompt: "Prompt", automacao: "Automação", template: "Template", link: "Link" };
const VIS = ["member", "professor"];
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;

const slug = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "arquivo";
const clean = (s, n) => String(s ?? "").slice(0, n);
const linesOf = (v) => (Array.isArray(v) ? v : String(v || "").split(/[\n,]/)).map((s) => String(s).trim()).filter(Boolean);

// Transforma links de YouTube/Vimeo/Loom em URL de embed; mp4 e /files ficam como estão
export function embedUrl(u) {
  u = String(u || "").trim(); if (!u) return null;
  let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/))) return { kind: "iframe", url: `https://www.youtube.com/embed/${m[1]}` };
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { kind: "iframe", url: `https://player.vimeo.com/video/${m[1]}` };
  if ((m = u.match(/loom\.com\/(?:share|embed)\/([\w]+)/))) return { kind: "iframe", url: `https://www.loom.com/embed/${m[1]}` };
  if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(u) || u.startsWith("/files/")) return { kind: "video", url: u };
  return { kind: "iframe", url: u };
}

export function libraryRepo(store) {
  const C = "content", P = "progress";
  const norm = (b, author) => {
    const type = TYPES.includes(b.type) ? b.type : "aula";
    return {
      id: b.id || crypto.randomUUID(),
      type, title: clean(b.title, 120).trim(), summary: clean(b.summary, 400), category: clean(b.category, 60).trim() || "Geral",
      tags: linesOf(b.tags).slice(0, 12), body: clean(b.body, 200000),
      video: clean(b.video, 500).trim() || null, link: clean(b.link, 500).trim() || null,
      files: (Array.isArray(b.files) ? b.files : []).filter((f) => f && f.url && f.name).map((f) => ({ name: clean(f.name, 120), url: clean(f.url, 300), size: Number(f.size) || 0 })).slice(0, 20),
      visibility: VIS.includes(b.visibility) ? b.visibility : "member",
      published: !!b.published, order: Number(b.order) || 0,
      author: b.author || (author ? { id: author.id, name: author.name } : null),
      createdAt: b.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  };
  const sort = (a, b) => (a.category.localeCompare(b.category, "pt-BR")) || (a.order - b.order) || a.createdAt.localeCompare(b.createdAt);
  return {
    list: async () => (await store.listDocs(C)).sort(sort),
    get: async (id) => store.getDoc(C, id),
    put: async (b, author) => {
      const cur = b.id ? await store.getDoc(C, b.id) : null;
      const it = norm({ ...(cur || {}), ...b, author: cur?.author || null, createdAt: cur?.createdAt }, author);
      if (!it.title) throw new Error("título obrigatório");
      return store.putDoc(C, it.id, it);
    },
    del: async (id) => {
      const it = await store.getDoc(C, id);
      for (const f of it?.files || []) removeUpload(f.url);
      await store.delDoc(C, id);
    },
    // o que um membro pode ver: publicados e dentro da visibilidade do cargo
    visibleFor: async (user) => {
      const staff = user.role === "admin" || user.role === "professor";
      return (await store.listDocs(C)).filter((it) => it.published && (staff || it.visibility === "member")).sort(sort);
    },
    progress: async (userId) => (await store.getDoc(P, userId))?.done || {},
    setDone: async (userId, itemId, done) => {
      const cur = (await store.getDoc(P, userId)) || { done: {} };
      if (done) cur.done[itemId] = new Date().toISOString(); else delete cur.done[itemId];
      await store.putDoc(P, userId, cur);
      return cur.done;
    },
  };
}

// ---------- arquivos ----------
export function saveUpload(name, buf) {
  if (!buf?.length) throw new Error("arquivo vazio");
  if (buf.length > MAX_UPLOAD) throw new Error(`arquivo acima de ${MAX_UPLOAD / 1024 / 1024}MB`);
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(name).toLowerCase().slice(0, 10);
  const base = slug(path.basename(name, path.extname(name)));
  const file = `${crypto.randomBytes(4).toString("hex")}-${base}${ext}`;
  writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return { name: String(name).slice(0, 120), url: `/files/${file}`, size: buf.length };
}
export function uploadPath(url) {
  const file = path.basename(String(url || ""));
  if (!file || file.includes("..")) return null;
  const p = path.join(UPLOAD_DIR, file);
  return existsSync(p) && statSync(p).isFile() ? p : null;
}
export function removeUpload(url) { const p = uploadPath(url); if (p) try { unlinkSync(p); } catch {} }
