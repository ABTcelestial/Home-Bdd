import crypto from 'node:crypto'
import { getConfig } from './config'

export const SESSION_COOKIE = 'hub_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 jours (PRD 5.1)

/**
 * Cookie du Terminal LAN, distinct de celui du Hub.
 *
 * Duree volontairement courte : une session de partage de fichiers peut durer
 * un mois sans consequence, un acces shell non.
 */
export const TERMINAL_COOKIE = 'hub_terminal'
export const TERMINAL_MAX_AGE = 60 * 60 * 12 // 12 heures

/**
 * Jeton signe : `<genre>.<expiration>.<hmac>`, signe avec le secret local.
 * Aucune donnee utilisateur dedans : un seul mot de passe partage, la
 * signature suffit a prouver qu'on est passe par l'ecran de login.
 *
 * Le genre fait partie de la charge signee : un jeton de terminal ne peut donc
 * pas servir de jeton de session, ni l'inverse. `v1` reste le genre des
 * sessions du Hub, pour que les cookies deja poses restent valables.
 */
function sign(payload: string): string {
  return crypto
    .createHmac('sha256', getConfig().secret)
    .update(payload)
    .digest('base64url')
}

function creerJeton(genre: string, dureeSecondes: number): string {
  const exp = Date.now() + dureeSecondes * 1000
  const payload = `${genre}.${exp}`
  return `${payload}.${sign(payload)}`
}

function verifierJeton(genre: string, token: string | undefined | null): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [version, expRaw, mac] = parts
  if (version !== genre) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = sign(`${version}.${expRaw}`)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function createSessionToken(): string {
  return creerJeton('v1', SESSION_MAX_AGE)
}

export function verifySessionToken(token: string | undefined | null): boolean {
  return verifierJeton('v1', token)
}

export function createTerminalToken(): string {
  return creerJeton('t1', TERMINAL_MAX_AGE)
}

export function verifyTerminalToken(token: string | undefined | null): boolean {
  return verifierJeton('t1', token)
}
