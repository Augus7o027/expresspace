-- Esquema inicial. Rode com: npm run db:migrate (precisa de DATABASE_URL)
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('text','voice')),
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  channel_id  TEXT NOT NULL,          -- canal de texto, ou "zone:<id>" pro chat local de uma sala
  user_id     TEXT NOT NULL REFERENCES users(id),
  user_name   TEXT NOT NULL,
  user_color  TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel_id, id DESC);

CREATE TABLE IF NOT EXISTS boards (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- documentos genéricos (contas, provedores de LLM, agentes, configurações)
CREATE TABLE IF NOT EXISTS docs (
  collection  TEXT NOT NULL,
  id          TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);

INSERT INTO channels (id, name, kind, position) VALUES
  ('geral', 'geral', 'text', 0),
  ('anuncios', 'anúncios', 'text', 1),
  ('ajuda', 'ajuda', 'text', 2),
  ('vozes', 'Voz livre', 'voice', 0),
  ('coworking', 'Coworking', 'voice', 1)
ON CONFLICT (id) DO NOTHING;
