// Camada de persistência. Com DATABASE_URL usa Postgres; sem, roda em memória.
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_CHANNELS = [
  { id: "geral", name: "geral", kind: "text", position: 0 },
  { id: "anuncios", name: "anúncios", kind: "text", position: 1 },
  { id: "ajuda", name: "ajuda", kind: "text", position: 2 },
  { id: "vozes", name: "Voz livre", kind: "voice", position: 0 },
  { id: "coworking", name: "Coworking", kind: "voice", position: 1 },
];

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.messages = new Map(); // channelId -> []
    this.boards = new Map();
    this.seq = 0;
  }
  async init() {}
  async upsertUser(u) { this.users.set(u.id, { ...u }); }
  async channels() { return DEFAULT_CHANNELS; }
  async addMessage(m) {
    const row = { id: ++this.seq, created_at: new Date().toISOString(), ...m };
    if (!this.messages.has(m.channel_id)) this.messages.set(m.channel_id, []);
    const arr = this.messages.get(m.channel_id);
    arr.push(row);
    if (arr.length > 500) arr.shift();
    return row;
  }
  async history(channelId, limit = 60) {
    const arr = this.messages.get(channelId) || [];
    return arr.slice(-limit);
  }
  async getBoard(id) { return this.boards.get(id) || ""; }
  async setBoard(id, content) { this.boards.set(id, content); }
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
}

export async function createStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const s = new PgStore(url);
    await s.init();
    console.log("[db] Postgres conectado");
    return s;
  }
  console.log("[db] sem DATABASE_URL: usando memória");
  return new MemoryStore();
}
