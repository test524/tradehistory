import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)

export const pool = new pg.Pool({
  connectionString: url,
  // hosted providers (Neon, Supabase, RDS...) need TLS; certificates are verified
  ssl: isLocal ? false : true,
})

export const query = (text, params) => pool.query(text, params)

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      phone      TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS pnl_entries (
      user_phone TEXT NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
      date       DATE NOT NULL,
      day        TEXT NOT NULL,
      pnl        NUMERIC(18, 2) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_phone, date)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}
