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

const norm = (c) => (typeof c === 'string' ? c.toLowerCase().replace(/\s+/g, ' ').trim() : '')

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

// sheets: [{ name, data: any[][] }]
export function extractDailyPnl(sheets) {
  let best = null
  for (const sheet of sheets) {
    const found = readSheet(sheet.data)
    if (found && (!best || found.entries.length > best.entries.length)) best = { ...found, sheet: sheet.name }
  }
  if (!best) {
    throw new Error(
      'Could not find a date column and a profit/P&L column in this file. ' +
        'Use a file with columns like "Date" and "P&L" (one row per trade or per day).',
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
