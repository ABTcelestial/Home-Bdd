import { NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from '@/lib/auth'
import { hasPassword, verifyPassword } from '@/lib/config'
import { fail, handle, remoteAddr } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Garde-fou anti-force brute, meme en LAN : 10 essais / 5 minutes / IP. */
const attempts = new Map<string, { count: number; until: number }>()
const WINDOW = 5 * 60 * 1000
const MAX_TRIES = 10

function tooManyTries(ip: string): boolean {
  const entry = attempts.get(ip)
  if (!entry) return false
  if (Date.now() > entry.until) {
    attempts.delete(ip)
    return false
  }
  return entry.count >= MAX_TRIES
}

function noteFailure(ip: string): void {
  const entry = attempts.get(ip)
  if (!entry || Date.now() > entry.until) {
    attempts.set(ip, { count: 1, until: Date.now() + WINDOW })
  } else {
    entry.count++
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    const ip = remoteAddr(req) || 'inconnu'
    if (tooManyTries(ip)) {
      return fail('Trop de tentatives. Reessayez dans quelques minutes.', 429)
    }

    const body = (await req.json().catch(() => ({}))) as { motDePasse?: string }
    const motDePasse = typeof body.motDePasse === 'string' ? body.motDePasse : ''

    if (!hasPassword()) {
      return fail(
        "Aucun mot de passe n'est configure sur le serveur (variable HUB_PASSWORD).",
        503,
      )
    }

    if (!verifyPassword(motDePasse)) {
      noteFailure(ip)
      return fail('Mot de passe incorrect.', 401)
    }

    attempts.delete(ip)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, createSessionToken(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
      // Pas de `secure` : le LAN est en http, le cookie doit passer.
    })
    return res
  })
}
