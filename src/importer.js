// Turns a Zerodha Console report (or any CSV/XLSX with a date column and a
// P&L column) into daily P&L entries: [{ date: 'YYYY-MM-DD', pnl: number }].

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

const pad = (n) => String(n).padStart(2, '0')

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${y}-${pad(m)}-${pad(d)}`
    : null
}

export function parseDate(v) {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : validYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
  }
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m
  // 2025-04-01, 2025/04/01 (optionally followed by a time)
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s))) return validYmd(+m[1], +m[2], +m[3])
  // 01-04-2025, 01/04/2025, 01.04.2025 -> day first (India)
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T].*)?$/.exec(s))) return validYmd(+m[3], +m[2], +m[1])
  // 01-Apr-2025, 1 April 2025
  if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{4})(?:[ T].*)?$/.exec(s))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
    return mon ? validYmd(+m[3], mon, +m[1]) : null
  }
  return null
}

export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[−–]/g, '-').replace(/[₹,\s]/g, '')
  const paren = /^\((.*)\)$/.exec(s) // (1,234.50) means negative
  if (paren) s = `-${paren[1]}`
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return null
  return Number(s)
}

const norm = (c) => (typeof c === 'string' ? c.toLowerCase().replace(/[_\s]+/g, ' ').trim() : '')

// first column whose header matches the earliest pattern in the priority list
function pickColumn(headers, patterns, exclude) {
  for (const re of patterns) {
    const i = headers.findIndex((h) => h && re.test(h) && !(exclude && exclude.test(h)))
    if (i !== -1) return i
  }
  return -1
}

const DATE_PATTERNS = [/exit date/, /sell date/, /trade date/, /^date$/, /date/]
const PNL_PATTERNS = [
  /^(net )?(realis?z?ed )?(p ?& ?l|pnl|profit( ?(&|and) ?loss)?)$/,
  /realis?z?ed.*(p ?& ?l|pnl|profit)/,
  /^profit/,
  /p ?& ?l|pnl|profit/,
]
const PNL_EXCLUDE = /unrealis?z?ed|taxable|%|percent|turnover|charges|brokerage/

function readSheet(data) {
  for (let r = 0; r < Math.min(data.length, 100); r++) {
    const headers = (data[r] || []).map(norm)
    const dateCol = pickColumn(headers, DATE_PATTERNS)
    const pnlCol = pickColumn(headers, PNL_PATTERNS, PNL_EXCLUDE)
    if (dateCol === -1 || pnlCol === -1 || dateCol === pnlCol) continue

    const byDate = new Map()
    let skipped = 0
    for (const row of data.slice(r + 1)) {
      if (!row || row.every((c) => c === null || c === undefined || c === '')) continue
      const date = parseDate(row[dateCol])
      const pnl = parseAmount(row[pnlCol])
      if (!date || pnl === null) {
        skipped++
        continue
      }
      byDate.set(date, (byDate.get(date) ?? 0) + pnl)
    }
    if (byDate.size) {
      return {
        headerRow: r + 1,
        dateHeader: String(data[r][dateCol]).trim(),
        pnlHeader: String(data[r][pnlCol]).trim(),
        skipped,
        entries: [...byDate]
          .map(([date, pnl]) => ({ date, pnl: Math.round(pnl * 100) / 100 }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
    }
  }
  return null
}

/* ---------- trade lists (tradebook / historical trades) ---------- */

const TL_DATE = [/^date$/, /trade date/, /date/]
const TL_SYMBOL = [/^symbol$/, /trading ?symbol|instrument|scrip/, /^name$/]
const TL_SIDE = [/^buy ?\/ ?sell$/, /^side$/, /trade type|transaction type|buy ?\/? ?sell/, /^type$/]
const TL_PRICE = [/^trade price$/, /^price$/, /avg.*price|average price/, /price/]
const TL_PRICE_EXCLUDE = /trigger|strike|underlying|stop|target/
const TL_QTY = [/^qty$/, /^quantity$/, /qty|quantity/]
const TL_TIME = [/exchange time/, /execution time/, /^time$/, /time/]
const TL_TIME_EXCLUDE = /trigger|report/

const timeKey = (v) => (v instanceof Date ? v.toISOString() : v == null ? '' : String(v))

function readTradeList(data) {
  for (let r = 0; r < Math.min(data.length, 100); r++) {
    const h = (data[r] || []).map(norm)
    const c = {
      date: pickColumn(h, TL_DATE),
      symbol: pickColumn(h, TL_SYMBOL),
      side: pickColumn(h, TL_SIDE),
      price: pickColumn(h, TL_PRICE, TL_PRICE_EXCLUDE),
      qty: pickColumn(h, TL_QTY),
      time: pickColumn(h, TL_TIME, TL_TIME_EXCLUDE),
    }
    if ([c.date, c.symbol, c.side, c.price, c.qty].some((i) => i === -1)) continue

    const trades = []
    let ignored = 0
    data.slice(r + 1).forEach((row, i) => {
      if (!row || row.every((x) => x === null || x === undefined || x === '')) return
      const date = parseDate(row[c.date])
      const sideRaw = String(row[c.side] ?? '').trim().toLowerCase()
      const side = /^b(uy)?$/.test(sideRaw) ? 1 : /^s(ell)?$/.test(sideRaw) ? -1 : 0
      const price = parseAmount(row[c.price])
      const qty = parseAmount(row[c.qty])
      const symbol = String(row[c.symbol] ?? '').trim()
      // unfilled / cancelled orders come through as empty, NaN or zero rows
      if (!date || !side || !symbol || price === null || qty === null || qty <= 0 || price <= 0) {
        ignored++
        return
      }
      trades.push({ date, side, price, qty, symbol, order: `${c.time === -1 ? date : timeKey(row[c.time]) || date}|${String(i).padStart(7, '0')}` })
    })
    if (!trades.length) continue

    // match buys with sells first-in-first-out per symbol; profit is booked on the day a position is closed
    trades.sort((x, y) => (x.order < y.order ? -1 : x.order > y.order ? 1 : 0))
    const books = new Map() // symbol -> open lots [{ side, qty, price }]
    const byDate = new Map()
    for (const t of trades) {
      const lots = books.get(t.symbol) ?? []
      books.set(t.symbol, lots)
      let left = t.qty
      while (left > 1e-9 && lots.length && lots[0].side === -t.side) {
        const lot = lots[0]
        const m = Math.min(left, lot.qty)
        const gain = lot.side === 1 ? t.price - lot.price : lot.price - t.price
        byDate.set(t.date, (byDate.get(t.date) ?? 0) + gain * m)
        lot.qty -= m
        left -= m
        if (lot.qty <= 1e-9) lots.shift()
      }
      if (left > 1e-9) lots.push({ side: t.side, qty: left, price: t.price })
    }
    const openSymbols = [...books].filter(([, lots]) => lots.length).map(([sym]) => sym)
    if (!byDate.size) continue
    return {
      mode: 'trades',
      headerRow: r + 1,
      dateHeader: String(data[r][c.date]).trim(),
      pnlHeader: 'calculated from buy/sell prices',
      skipped: ignored,
      openPositions: openSymbols.length,
      entries: [...byDate]
        .map(([date, pnl]) => ({ date, pnl: Math.round(pnl * 100) / 100 }))
        .sort((x, y) => x.date.localeCompare(y.date)),
    }
  }
  return null
}

// sheets: [{ name, data: any[][] }]
export function extractDailyPnl(sheets) {
  let best = null
  for (const sheet of sheets) {
    const found = readSheet(sheet.data)
    if (found && (!best || found.entries.length > best.entries.length)) best = { ...found, mode: 'pnl', sheet: sheet.name }
  }
  if (!best) {
    for (const sheet of sheets) {
      const found = readTradeList(sheet.data)
      if (found && (!best || found.entries.length > best.entries.length)) best = { ...found, sheet: sheet.name }
    }
  }
  if (!best) {
    throw new Error(
      'Could not find the columns needed. Use a file with a date and a profit/P&L column, ' +
        'or a trade list with date, symbol, buy/sell, price and quantity.',
    )
  }
  return best
}

/* ---------- file readers ---------- */

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export async function readReportFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return extractDailyPnl([{ name: file.name, data: parseCsv(await file.text()) }])
  }
  if (name.endsWith('.xlsx')) {
    const { default: readXlsx } = await import('read-excel-file/browser') // loaded only when needed
    const sheets = await readXlsx(file)
    return extractDailyPnl(sheets.map((s) => ({ name: s.sheet, data: s.data })))
  }
  throw new Error('Please choose a .xlsx or .csv file (download it from Zerodha Console → Reports).')
}
