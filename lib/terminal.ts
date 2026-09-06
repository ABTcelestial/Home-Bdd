import { cookies } from 'next/headers'
import { TERMINAL_COOKIE, verifyTerminalToken } from './auth'
import { hasTerminalPin } from './config'
import { fail } from './api'

/**
 * Pont TypeScript vers le gestionnaire de terminal.
 *
 * Le gestionnaire vit dans terminal/gestionnaire.cjs, charge par server.js.
 * Les routes de Next tournent dans le meme processus mais ne peuvent pas
 * l'importer : elles le retrouvent sur `globalThis`, exactement comme
 * lib/events.ts retrouve son bus temps reel.
 */

export type ResumeSession = {
  id: string
  titre: string
  cwd: string
  shell: string
  cols: number
  rows: number
  vivante: boolean
  codeSortie: number | null
  clients: number
  creeLe: number
  derniereActivite: number
}

export type GestionnaireTerminal = {
  disponible(): boolean
  raisonIndisponible(): string | null
  creer(o: {
    titre?: string
    cwd?: string
    shell?: string
    cols?: number
    rows?: number
  }): { id: string; resume(): ResumeSession }
  obtenir(id: string): { id: string; resume(): ResumeSession } | null
  liste(): ResumeSession[]
  fermer(id: string): boolean
  emettreTicket(o: { sessionId: string; ip: string }): { jeton: string; expire: number }
}

const globalRef = globalThis as unknown as { __hubTerminal?: GestionnaireTerminal }

/** Longueur maximale d'un titre de session, et d'un identifiant. */
export const MAX_TITRE = 60

/**
 * Un titre est affiche tel quel dans la liste des sessions : on retire les
 * caracteres de controle, qui pourraient y injecter des sequences ANSI.
 */
export function nettoyerTitre(brut: string): string {
  // eslint-disable-next-line no-control-regex
  const controle = /[\u0000-\u001f\u007f]/g
  const propre = brut.replace(controle, '').trim().slice(0, MAX_TITRE)
  return propre || 'Terminal'
}

/** Le terminal est-il coupe par configuration ? (PRD 26 : rester debranchable) */
export function terminalDesactive(): boolean {
  return process.env.HUB_TERMINAL === '0'
}

/**
 * Rend le gestionnaire, ou null s'il n'existe pas dans ce processus. Le cas
 * arrive pour de vrai : quelqu'un lance `next start` au lieu de
 * `node server.js`, et il n'y a alors aucun serveur WebSocket.
 */
export function gestionnaire(): GestionnaireTerminal | null {
  if (terminalDesactive()) return null
  return globalRef.__hubTerminal || null
}

export type EtatTerminal = {
  actif: boolean
  pinConfigure: boolean
  deverrouille: boolean
  raison: string | null
}

/** Etat lisible par l'interface, sans rien divulguer d'exploitable. */
export async function etatTerminal(): Promise<EtatTerminal> {
  if (terminalDesactive()) {
    return {
      actif: false,
      pinConfigure: false,
      deverrouille: false,
      raison: 'Le Terminal LAN est desactive sur ce serveur (HUB_TERMINAL=0).',
    }
  }
  const gest = gestionnaire()
  if (!gest) {
    return {
      actif: false,
      pinConfigure: hasTerminalPin(),
      deverrouille: false,
      raison:
        "Le Terminal LAN n'est pas charge. Le Hub doit etre demarre par `node server.js`.",
    }
  }
  if (!gest.disponible()) {
    return {
      actif: false,
      pinConfigure: hasTerminalPin(),
      deverrouille: false,
      raison: gest.raisonIndisponible(),
    }
  }
  return {
    actif: true,
    pinConfigure: hasTerminalPin(),
    deverrouille: await estDeverrouille(),
    raison: hasTerminalPin()
      ? null
      : "Aucun PIN n'est defini. Ouvrez les Reglages depuis le PC serveur pour en poser un.",
  }
}

export async function estDeverrouille(): Promise<boolean> {
  const jeton = (await cookies()).get(TERMINAL_COOKIE)?.value
  return verifyTerminalToken(jeton)
}

/**
 * Garde commune a toutes les routes du terminal. Elle vient EN PLUS du
 * middleware : celui-ci prouve qu'on est entre dans le Hub, celle-ci prouve
 * qu'on a donne le PIN du terminal.
 */
export async function exigerTerminal(): Promise<
  { erreur: Response } | { gest: GestionnaireTerminal }
> {
  const etat = await etatTerminal()
  if (!etat.actif) {
    return { erreur: fail(etat.raison || 'Terminal indisponible.', 503) }
  }
  if (!etat.pinConfigure) {
    return { erreur: fail("Aucun PIN n'est defini pour le Terminal LAN.", 503) }
  }
  if (!etat.deverrouille) {
    return { erreur: fail('PIN requis.', 401) }
  }
  const gest = gestionnaire()
  if (!gest) return { erreur: fail('Terminal indisponible.', 503) }
  return { gest }
}
