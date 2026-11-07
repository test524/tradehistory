// Set or reset a user's 4-digit PIN (for accounts created before PINs existed, or a forgotten PIN).
//   npm run set-pin -- +919876543210
import { createInterface } from 'node:readline'
import { pool, query } from './db.js'
import { hashPin, pinProblem } from './pin.js'

const phone = process.argv[2]
if (!/^\+[1-9]\d{7,14}$/.test(phone ?? '')) {
  console.error('Usage: npm run set-pin -- +<country code><number>   e.g. +919876543210')
  process.exit(1)
}

function askPin() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      createInterface({ input: process.stdin }).once('line', (l) => resolve(l.trim()))
      return
    }
    process.stdout.write('New 4-digit PIN (hidden): ')
    process.stdin.setRawMode(true)
    process.stdin.resume()
    let pin = ''
    process.stdin.on('data', function onData(buf) {
      for (const ch of buf.toString()) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(pin)
        }
        if (ch === '\u0003') process.exit(130) // Ctrl+C
        if (ch === '\u007f') pin = pin.slice(0, -1)
        else pin += ch
      }
    })
  })
}

const pin = await askPin()
const problem = pinProblem(pin)
if (problem) {
  console.error(problem)
  process.exit(1)
}
const { rowCount } = await query(
  `UPDATE users SET pin_hash = $2, failed_attempts = 0, locked_until = NULL WHERE phone = $1`,
  [phone, await hashPin(pin)],
)
console.log(rowCount ? `PIN set for ${phone}` : `No user found with phone ${phone}`)
await pool.end()
