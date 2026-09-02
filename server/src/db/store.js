// Camada de persistência. Com DATABASE_URL usa Postgres; sem, roda em memória.
import pg from "pg";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_CHANNELS = [
  { id: "geral", name: "geral", kind: "text", position: 0 },
  { id: "anuncios", name: "anúncios", kind: "text", position: 1 },
  { id: "ajuda", name: "ajuda", kind: "text", position: 2 },
  { id: "vozes", name: "Voz livre", kind: "voice", position: 0 },
  { id: "coworking", name: "Coworking", kind: "voice", position: 1 },
];

// Sem Postgres: tudo em memória, salvo em DATA_DIR/state.json (debounce de 500ms).
// Em produção, monte um volume no Coolify em /app/data pra não perder no redeploy.
class MemoryStore {
  constructor(dir) {
    this.dir = dir;
    this.file = dir ? join(dir, "state.json") : null;
    this.users = new Map();
    this.messages = new Map(); // channelId -> []
    this.boards = new Map();
    this.docs = new Map();     // collection -> Map(id -> data)
    this.seq = 0;
  }
  async init() {
    if (!this.file) return;
    try { mkdirSync(this.dir, { recursive: true }); } catch {}
    if (existsSync(this.file)) {
      try {
        const st = JSON.parse(readFileSync(this.file, "utf8"));
        this.seq = st.seq || 0;
        for (const [k, v] of Object.entries(st.messages || {})) this.messages.set(k, v);
        for (const [k, v] of Object.entries(st.boards || {})) this.boards.set(k, v);
        for (const [c, docs] of Object.entries(st.docs || {})) this.docs.set(c, new Map(Object.entries(docs)));
        console.log(`[db] estado carregado de ${this.file}`);
      } catch (e) { console.warn("[db] state.json inválido, começando vazio", e.message); }
    }
  }
  save() {
    if (!this.file) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      const st = { seq: this.seq, messages: Object.fromEntries(this.messages), boards: Object.fromEntries(this.boards),
        docs: Object.fromEntries([...this.docs].map(([c, m]) => [c, Object.fromEntries(m)])) };
      try { writeFileSync(this.file + ".tmp", JSON.stringify(st)); renameSync(this.file + ".tmp", this.file); } catch (e) { console.warn("[db] falha ao salvar", e.message); }
    }, 500);
  }
  // documentos genéricos (usuários, provedores, agentes, configurações)
  async listDocs(c) { return [...(this.docs.get(c)?.values() || [])]; }
  async getDoc(c, id) { return this.docs.get(c)?.get(id) || null; }
  async putDoc(c, id, data) { if (!this.docs.has(c)) this.docs.set(c, new Map()); this.docs.get(c).set(id, { ...data, id }); this.save(); return { ...data, id }; }
  async delDoc(c, id) { this.docs.get(c)?.delete(id); this.save(); }
  async upsertUser(u) { this.users.set(u.id, { ...u }); }
  async channels() { return DEFAULT_CHANNELS; }
  async addMessage(m) {
    const row = { id: ++this.seq, created_at: new Date().toISOString(), ...m };
    if (!this.messages.has(m.channel_id)) this.messages.set(m.channel_id, []);
    const arr = this.messages.get(m.channel_id);
    arr.push(row);
    if (arr.length > 500) arr.shift();
    this.save();
    return row;
  }
  async history(channelId, limit = 60) {
    const arr = this.messages.get(channelId) || [];
    return arr.slice(-limit);
  }
  async getBoard(id) { return this.boards.get(id) || ""; }
  async setBoard(id, content) { this.boards.set(id, content); this.save(); }
}

class PgStore {
  constructor(url) { this.pool = new pg.Pool({ connectionString: url }); }
  async init() {
    // aplica o schema na subida (idempotente), assim o deploy não precisa de passo manual
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
    await this.pool.query(sql);
  }
  async upsertUser(u) {
    await this.pool.query(
      `INSERT INTO users (id, name, color) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, last_seen = now()`,
      [u.id, u.name, u.color]
    );
  }
  async channels() {
    const r = await this.pool.query("SELECT id, name, kind, position FROM channels ORDER BY kind, position");
    return r.rows;
  }
  async addMessage(m) {
    const r = await this.pool.query(
      `INSERT INTO messages (channel_id, user_id, user_name, user_color, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, channel_id, user_id, user_name, user_color, body, created_at`,
      [m.channel_id, m.user_id, m.user_name, m.user_color, m.body]
    );
    return r.rows[0];
  }
  async history(channelId, limit = 60) {
    const r = await this.pool.query(
      `SELECT id, channel_id, user_id, user_name, user_color, body, created_at
       FROM messages WHERE channel_id = $1 ORDER BY id DESC LIMIT $2`,
      [channelId, limit]
    );
    return r.rows.reverse();
  }
  async getBoard(id) {
    const r = await this.pool.query("SELECT content FROM boards WHERE id = $1", [id]);
    return r.rows[0]?.content || "";
  }
  async setBoard(id, content) {
    await this.pool.query(
      `INSERT INTO boards (id, content) VALUES ($1,$2)
       ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`, [id, content]);
  }
  async listDocs(c) { const r = await this.pool.query("SELECT data FROM docs WHERE collection = $1 ORDER BY updated_at", [c]); return r.rows.map((x) => x.data); }
  async getDoc(c, id) { const r = await this.pool.query("SELECT data FROM docs WHERE collection = $1 AND id = $2", [c, id]); return r.rows[0]?.data || null; }
  async putDoc(c, id, data) {
    const doc = { ...data, id };
    await this.pool.query(`INSERT INTO docs (collection, id, data) VALUES ($1,$2,$3)
      ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [c, id, JSON.stringify(doc)]);
    return doc;
  }
  async delDoc(c, id) { await this.pool.query("DELETE FROM docs WHERE collection = $1 AND id = $2", [c, id]); }
}

export async function createStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const s = new PgStore(url);
    await s.init();
    console.log("[db] Postgres conectado");
    return s;
  }
  const dir = process.env.DATA_DIR || join(process.cwd(), "data");
  console.log(`[db] sem DATABASE_URL: memória + ${dir}/state.json`);
  const s = new MemoryStore(dir);
  await s.init();
  return s;
}
