import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Nada a migrar.");
  process.exit(1);
}
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(sql);
await client.end();
console.log("Migração aplicada.");
