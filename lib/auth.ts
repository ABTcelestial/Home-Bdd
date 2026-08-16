import crypto from 'node:crypto'
import { getConfig } from './config'

export const SESSION_COOKIE = 'hub_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 jours (PRD 5.1)

/**
 * Cookie de session : `<expiration>.<hmac>` signe avec le secret local.
 * Aucune donnee utilisateur dedans : un seul mot de passe partage, la
 * signature suffit a prouver qu'on est passe par l'ecran de login.
 */
function sign(payload: string): string {
  return crypto
    .createHmac('sha256', getConfig().secret)
    .update(payload)
    .digest('base64url')
}

export function createSessionToken(): string {
  const exp = Date.now() + SESSION_MAX_AGE * 1000
  const payload = `v1.${exp}`
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [version, expRaw, mac] = parts
  if (version !== 'v1') return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = sign(`${version}.${expRaw}`)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
