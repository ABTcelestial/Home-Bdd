import { NextResponse } from 'next/server'
import { TERMINAL_COOKIE, TERMINAL_MAX_AGE, createTerminalToken } from '@/lib/auth'
import { hasTerminalPin, verifyTerminalPin } from '@/lib/config'
import { fail, handle, remoteAddr } from '@/lib/api'
import { terminalDesactive } from '@/lib/terminal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Garde-fou anti-force brute, plus serre que celui du login : derriere ce PIN
 * il n'y a pas des fichiers, il y a un shell. 5 essais par tranche de 5 min.
 */
const essais = new Map<string, { compte: number; jusqu: number }>()
const FENETRE = 5 * 60 * 1000
const MAX_ESSAIS = 5

function tropDEssais(ip: string): boolean {
  const entree = essais.get(ip)
  if (!entree) return false
  if (Date.now() > entree.jusqu) {
    essais.delete(ip)
    return false
  }
  return entree.compte >= MAX_ESSAIS
}

function noterEchec(ip: string): void {
  const entree = essais.get(ip)
  if (!entree || Date.now() > entree.jusqu) {
    essais.set(ip, { compte: 1, jusqu: Date.now() + FENETRE })
  } else {
    entree.compte++
  }
}

/**
 * Deverrouillage du Terminal LAN (PRD 15).
 *
 * Le mot de passe du Hub a deja ete donne - le middleware ne laisserait pas
 * passer cette requete sinon. Ce PIN est le second facteur, celui qui separe
 * "lire les fichiers partages" de "piloter le PC".
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (terminalDesactive()) return fail('Le Terminal LAN est desactive sur ce serveur.', 503)

    const ip = remoteAddr(req) || 'inconnu'
    if (tropDEssais(ip)) {
      return fail('Trop de tentatives. Reessayez dans quelques minutes.', 429)
    }

    if (!hasTerminalPin()) {
      return fail(
        "Aucun PIN n'est defini pour le Terminal LAN. Posez-en un depuis les Reglages, sur le PC serveur.",
        503,
      )
    }

    const corps = (await req.json().catch(() => ({}))) as { pin?: unknown }
    const pin = typeof corps.pin === 'string' ? corps.pin : ''

    if (!verifyTerminalPin(pin)) {
      noterEchec(ip)
      return fail('PIN incorrect.', 401)
    }

    essais.delete(ip)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(TERMINAL_COOKIE, createTerminalToken(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TERMINAL_MAX_AGE,
      // Pas de `secure` : le LAN est en http, comme le cookie de session.
    })
    return res
  })
}

/** Verrouiller a la demande : le bouton "fermer le terminal" du telephone. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(TERMINAL_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
