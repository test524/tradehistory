import express from 'express'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb, query } from './db.js'
import { DUMMY_HASH, hashPin, pinProblem, verifyPin } from './pin.js'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const PORT = process.env.PORT || 4000
const PHONE_RE = /^\+[1-9]\d{7,14}$/
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PIN_ATTEMPTS = 5
const LOCK_MINUTES = 15

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

/* ---------- user lookup ---------- */

async function findUser(phone) {
  const { rows } = await query(
    `SELECT name, phone, created_at AS "createdAt" FROM users WHERE phone = $1`,
    [phone],
  )
  return rows[0] ?? null
}

/* ---------- tokens (HMAC-signed, no extra deps) ---------- */

let secretPromise
function getSecret() {
  secretPromise ??= (async () => {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
    // fall back to a random secret persisted in the DB so tokens survive restarts
    const fresh = randomBytes(32).toString('hex')
    await query(
      `INSERT INTO app_settings (key, value) VALUES ('session_secret', $1) ON CONFLICT DO NOTHING`,
      [fresh],
    )
    const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'session_secret'`)
    return rows[0].value
  })()
  return secretPromise
}

const sign = (secret, body) => createHmac('sha256', secret).update(body).digest('base64url')

async function issueToken(phone) {
  const body = Buffer.from(JSON.stringify({ phone, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url')
  return `${body}.${sign(await getSecret(), body)}`
}

async function readToken(token) {
  const [body, sig] = String(token ?? '').split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(sign(await getSecret(), body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    return payload.exp > Date.now() ? payload : null
  } catch {
    return null
  }
}

async function requireAuth(req, res, next) {
  try {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')
    const payload = m && (await readToken(m[1]))
    const user = payload && (await findUser(payload.phone))
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

const validPhone = (p) => typeof p === 'string' && PHONE_RE.test(p)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

/* ---------- auth routes ---------- */

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, phone, pin } = req.body ?? {}
    const cleanName = typeof name === 'string' ? name.trim() : ''
    if (cleanName.length < 2 || cleanName.length > 60) {
      return res.status(400).json({ error: 'name must be 2–60 characters' })
    }
    if (!validPhone(phone)) return res.status(400).json({ error: 'invalid phone number' })
    const problem = pinProblem(pin)
    if (problem) return res.status(400).json({ error: problem })

    const { rowCount } = await query(
      `INSERT INTO users (phone, name, pin_hash) VALUES ($1, $2, $3) ON CONFLICT (phone) DO NOTHING`,
      [phone, cleanName, await hashPin(pin)],
    )
    if (!rowCount) return res.status(409).json({ error: 'phone number already registered, please log in' })

    const user = await findUser(phone)
    res.status(201).json({ token: await issueToken(phone), user })
  } catch (err) {
    next(err)
  }
})

const BAD_LOGIN = 'Incorrect phone number or PIN'

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { phone, pin } = req.body ?? {}
    if (!validPhone(phone) || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'enter your phone number and 4-digit PIN' })
    }
    const { rows } = await query(
      `SELECT name, phone, created_at AS "createdAt", pin_hash, failed_attempts,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (locked_until - now())) / 60))::int AS lock_minutes
       FROM users WHERE phone = $1`,
      [phone],
    )
    const row = rows[0]
    if (!row) {
      await verifyPin(pin, DUMMY_HASH) // same cost as a real check
      return res.status(401).json({ error: BAD_LOGIN })
    }
    if (row.lock_minutes > 0) {
      return res.status(429).json({ error: `Too many wrong PINs. Try again in ${row.lock_minutes} minute(s).` })
    }
    if (!row.pin_hash) {
      return res.status(403).json({ error: 'This account has no PIN yet. Ask the app owner to set one.' })
    }
    if (!(await verifyPin(pin, row.pin_hash))) {
      const { rows: upd } = await query(
        `UPDATE users SET failed_attempts = failed_attempts + 1,
                locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) END
         WHERE phone = $1 RETURNING failed_attempts`,
        [phone, MAX_PIN_ATTEMPTS, LOCK_MINUTES],
      )
      if (upd[0]?.failed_attempts >= MAX_PIN_ATTEMPTS) {
        await query(`UPDATE users SET failed_attempts = 0 WHERE phone = $1`, [phone])
        return res.status(429).json({ error: `Too many wrong PINs. Locked for ${LOCK_MINUTES} minutes.` })
      }
      return res.status(401).json({ error: BAD_LOGIN })
    }
    await query(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE phone = $1`, [phone])
    const user = { name: row.name, phone: row.phone, createdAt: row.createdAt }
    res.json({ token: await issueToken(phone), user })
  } catch (err) {
    next(err)
  }
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user))

/* ---------- P&L routes (per user) ---------- */

function isRealDate(s) {
  const d = new Date(`${s}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Save (create or overwrite) the P&L for a day
app.post('/api/pnl', requireAuth, async (req, res, next) => {
  try {
    const { date, pnl } = req.body ?? {}
    if (typeof date !== 'string' || !isRealDate(date)) {
      return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD string' })
    }
    if (typeof pnl !== 'number' || !Number.isFinite(pnl)) {
      return res.status(400).json({ error: 'pnl must be a number' })
    }
    const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    })
    const { rows } = await query(
      `INSERT INTO pnl_entries (user_phone, date, day, pnl) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_phone, date)
       DO UPDATE SET day = EXCLUDED.day, pnl = EXCLUDED.pnl, updated_at = now()
       RETURNING to_char(date, 'YYYY-MM-DD') AS date, day, pnl::float8 AS pnl, (xmax = 0) AS inserted`,
      [req.user.phone, date, day, pnl],
    )
    const { inserted, ...record } = rows[0]
    const existed = !inserted
    res.status(existed ? 200 : 201).json(record)
  } catch (err) {
    next(err)
  }
})

// Import many days at once (e.g. from a Zerodha Console report)
const MAX_IMPORT = 5000
app.post('/api/pnl/bulk', requireAuth, async (req, res, next) => {
  try {
    const { entries, overwrite = true } = req.body ?? {}
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries must be a non-empty array' })
    }
    if (entries.length > MAX_IMPORT) {
      return res.status(400).json({ error: `too many entries (max ${MAX_IMPORT})` })
    }
    const byDate = new Map() // a repeated date keeps the last value
    for (const e of entries) {
      if (typeof e?.date !== 'string' || !isRealDate(e.date)) {
        return res.status(400).json({ error: `invalid date: ${String(e?.date).slice(0, 20)}` })
      }
      if (typeof e.pnl !== 'number' || !Number.isFinite(e.pnl) || Math.abs(e.pnl) >= 1e12) {
        return res.status(400).json({ error: `invalid pnl for ${e.date}` })
      }
      byDate.set(e.date, e.pnl)
    }
    const dates = [...byDate.keys()]
    const days = dates.map((d) =>
      new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    )
    const { rowCount } = await query(
      `INSERT INTO pnl_entries (user_phone, date, day, pnl)
       SELECT $1, d, dy, p FROM unnest($2::date[], $3::text[], $4::numeric[]) AS t(d, dy, p)
       ON CONFLICT (user_phone, date) ${
         overwrite === false
           ? 'DO NOTHING'
           : 'DO UPDATE SET day = EXCLUDED.day, pnl = EXCLUDED.pnl, updated_at = now()'
       }`,
      [req.user.phone, dates, days, [...byDate.values()]],
    )
    res.json({ saved: rowCount, skipped: dates.length - rowCount })
  } catch (err) {
    next(err)
  }
})

// List the user's saved entries, newest first (optional ?from=&to= filters)
app.get('/api/pnl', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query
    for (const v of [from, to]) {
      if (v !== undefined && (typeof v !== 'string' || !isRealDate(v))) {
        return res.status(400).json({ error: 'from/to must be valid YYYY-MM-DD dates' })
      }
    }
    const { rows } = await query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, day, pnl::float8 AS pnl
       FROM pnl_entries
       WHERE user_phone = $1 AND ($2::date IS NULL OR date >= $2) AND ($3::date IS NULL OR date <= $3)
       ORDER BY date DESC`,
      [req.user.phone, from ?? null, to ?? null],
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// Unknown /api routes get JSON 404s instead of the web page
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }))

// In production, serve the built web app from the same service
if (existsSync(join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')))
}

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' })
  }
  console.error(err)
  res.status(500).json({ error: 'internal server error' })
})

await initDb()
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`))
