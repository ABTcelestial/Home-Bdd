import os from 'node:os'
import { NextResponse } from 'next/server'
import { PathError } from './paths'

/** Reponse JSON courte. */
export function ok<T extends object>(data: T = {} as T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init)
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, erreur: message }, { status })
}

/**
 * Distinction serveur / client (PRD 4). L'en-tete est injectee par server.js a
 * partir de l'adresse TCP reelle et ecrase toute valeur envoyee par le client :
 * elle n'est donc pas falsifiable depuis un autre PC du reseau.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'])

export function remoteAddr(req: Request): string {
  return req.headers.get('x-hub-remote-addr') || ''
}

/**
 * Adresses IP de la machine elle-meme. Quand Ryan ouvre le Hub par son nom
 * reseau (http://celestial-hub:3000) depuis le PC serveur, la connexion sort
 * par la carte reseau et revient : l'adresse vue n'est plus 127.0.0.1 mais
 * celle du PC. Ces adresses designent donc toujours "le PC serveur".
 *
 * Aucun risque d'usurpation : une machine tierce ne peut pas etablir une
 * connexion TCP en se donnant l'adresse du serveur, la reponse ne lui
 * reviendrait pas.
 */
let cacheAdresses: { valeurs: Set<string>; expire: number } | null = null

function adressesMachine(): Set<string> {
  if (cacheAdresses && Date.now() < cacheAdresses.expire) return cacheAdresses.valeurs
  const valeurs = new Set<string>()
  for (const cartes of Object.values(os.networkInterfaces())) {
    for (const carte of cartes || []) valeurs.add(carte.address)
  }
  // Renouvellement DHCP, WiFi/Ethernet qui bascule : on relit regulierement.
  cacheAdresses = { valeurs, expire: Date.now() + 60_000 }
  return valeurs
}

export function estAdresseLocale(addr: string): boolean {
  if (!addr) return false
  if (LOOPBACK.has(addr)) return true
  // 127.0.0.0/8 en entier
  if (/^127\.\d+\.\d+\.\d+$/.test(addr)) return true
  const nu = addr.startsWith('::ffff:') ? addr.slice(7) : addr
  return adressesMachine().has(nu) || adressesMachine().has(addr)
}

export function isLocalRequest(req: Request): boolean {
  return estAdresseLocale(remoteAddr(req))
}

/** Garde localhost-only : corbeille (vidage) et page admin. */
export function requireLocal(req: Request): NextResponse | null {
  if (isLocalRequest(req)) return null
  return fail("Action reservee au PC serveur.", 403)
}

/** Enrobe un handler pour transformer les exceptions en JSON propre. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof PathError) return fail(err.message, 400)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[hub] api', err)
    return fail(message, 500)
  }
}

/** Traduit les codes d'erreur Node en messages lisibles. */
export function fsErrorMessage(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code
  switch (code) {
    case 'ENOENT':
      return "Ce fichier ou dossier n'existe plus."
    case 'EEXIST':
      return 'Un element porte deja ce nom a cet endroit.'
    case 'EPERM':
    case 'EACCES':
      return 'Acces refuse par Windows (fichier ouvert ou droits insuffisants).'
    case 'EBUSY':
      return 'Fichier en cours d\'utilisation par un autre programme.'
    case 'ENOTEMPTY':
      return "Le dossier n'est pas vide."
    case 'ENOSPC':
      return 'Plus assez d\'espace disque sur le serveur.'
    default:
      return err instanceof Error ? err.message : 'Erreur inconnue'
  }
}
