import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const WEAK = new Set(['1234', '4321', '0123', '3210', '2580'])

// Returns an error message, or null when the PIN is acceptable (exactly 4 digits).
export function pinProblem(pin) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return 'PIN must be exactly 4 digits'
  if (/^(\d)\1{3}$/.test(pin) || WEAK.has(pin)) return 'PIN is too easy to guess, choose another'
  return null
}

// "salt:hash" in hex, scrypt with a random salt
export async function hashPin(pin) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(pin, salt, 32)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPin(pin, stored) {
  const [saltHex, hashHex] = String(stored ?? '').split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(String(pin), Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

// A throwaway hash so unknown phone numbers cost the same time as wrong PINs
export const DUMMY_HASH = await hashPin('0000')
