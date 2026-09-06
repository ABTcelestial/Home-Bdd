/**
 * Terminal LAN - gestionnaire de sessions (PRD 10 et 11).
 *
 * Un seul gestionnaire par processus. Il est publie sur `globalThis` pour la
 * meme raison que le bus temps reel de lib/events.ts : server.js (CommonJS) et
 * les routes API de Next (TypeScript) tournent dans le MEME processus Node,
 * mais ne peuvent pas s'importer l'un l'autre. `globalThis` est le point de
 * rendez-vous, et c'est deja le motif etabli dans ce depot.
 *
 * L'architecture est multi-sessions des le premier jour (Map + API), meme si
 * l'interface v1 n'en montre qu'une a la fois : le PRD 11 demande que rien
 * n'empeche d'en ajouter.
 */
const crypto = require('node:crypto')
const { Session } = require('./session.cjs')
const pty = require('./pty.cjs')

const CLE = '__hubTerminal'

/** Plafonds : un terminal LAN n'a aucune raison d'ouvrir 200 shells. */
const MAX_SESSIONS = Number(process.env.HUB_TERMINAL_MAX || 8)

/** Un ticket vit le temps d'ouvrir une socket, pas une seconde de plus. */
const TICKET_MS = 30_000

/** Une session morte est oubliee au bout de ce delai sans client. */
const OUBLI_MS = 5 * 60 * 1000

class Gestionnaire {
  constructor() {
    this.sessions = new Map()
    this.tickets = new Map()
    this.menage = setInterval(() => this.nettoyer(), 60_000)
    this.menage.unref?.()
  }

  /* --------------------------------------------------------------- */
  /* Disponibilite                                                     */
  /* --------------------------------------------------------------- */

  disponible() {
    return pty.disponible()
  }

  raisonIndisponible() {
    return pty.raisonIndisponible()
  }

  /* --------------------------------------------------------------- */
  /* Sessions                                                          */
  /* --------------------------------------------------------------- */

  creer({ titre, cwd, shell, cols, rows } = {}) {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Trop de sessions ouvertes (${MAX_SESSIONS} au maximum).`)
    }
    const id = crypto.randomBytes(9).toString('base64url')
    const session = new Session({ id, titre, cwd, shell, cols, rows })
    this.sessions.set(id, session)
    return session
  }

  obtenir(id) {
    return this.sessions.get(id) || null
  }

  liste() {
    return [...this.sessions.values()]
      .sort((a, b) => a.creeLe - b.creeLe)
      .map((s) => s.resume())
  }

  /** Fermeture demandee par l'utilisateur : la seule qui tue volontairement. */
  fermer(id) {
    const session = this.sessions.get(id)
    if (!session) return false
    session.tuer()
    session.diffuser(require('./protocole.cjs').fin(session.codeSortie, null))
    this.sessions.delete(id)
    return true
  }

  /**
   * Oubli des sessions mortes et sans spectateur. On ne touche JAMAIS a une
   * session vivante, meme sans client : c'est exactement le cas du telephone
   * range dans la poche pendant que Claude travaille.
   */
  nettoyer() {
    const maintenant = Date.now()
    for (const [id, session] of this.sessions) {
      const morte = !session.vivante
      const seule = session.clients.size === 0
      const vieille = maintenant - session.derniereActivite > OUBLI_MS
      if (morte && seule && vieille) this.sessions.delete(id)
    }
    for (const [jeton, ticket] of this.tickets) {
      if (maintenant > ticket.expire) this.tickets.delete(jeton)
    }
  }

  /* --------------------------------------------------------------- */
  /* Tickets d'ouverture de socket                                     */
  /* --------------------------------------------------------------- */

  /**
   * Une requete `upgrade` WebSocket ne traverse pas le middleware de Next : il
   * n'y a donc aucune authentification automatique dessus. Plutot que de
   * redire ici la verification de cookie ecrite dans lib/auth.ts - deux
   * implementations qui finiraient par diverger - le navigateur demande
   * d'abord un ticket a une route API, elle bel et bien protegee par le
   * middleware et par le PIN du terminal.
   *
   * Le ticket est a usage unique, lie a l'adresse IP du demandeur, et meurt en
   * 30 secondes.
   */
  emettreTicket({ sessionId, ip }) {
    const jeton = crypto.randomBytes(32).toString('base64url')
    this.tickets.set(jeton, { sessionId, ip: ip || '', expire: Date.now() + TICKET_MS })
    return { jeton, expire: Date.now() + TICKET_MS }
  }

  /** Consomme le ticket. Un rejeu echoue : l'entree a deja ete retiree. */
  consommerTicket(jeton, { ip, sessionId }) {
    const ticket = this.tickets.get(jeton)
    if (!ticket) return { ok: false, raison: 'Jeton invalide ou deja utilise.' }
    this.tickets.delete(jeton)
    if (Date.now() > ticket.expire) return { ok: false, raison: 'Jeton expire.' }
    if (ticket.ip && ip && ticket.ip !== ip) {
      return { ok: false, raison: 'Jeton emis pour un autre appareil.' }
    }
    if (ticket.sessionId && sessionId && ticket.sessionId !== sessionId) {
      return { ok: false, raison: 'Jeton emis pour une autre session.' }
    }
    return { ok: true }
  }

  /* --------------------------------------------------------------- */
  /* Arret                                                             */
  /* --------------------------------------------------------------- */

  /**
   * Arret du Hub (PRD 19). C'est le SEUL endroit qui tue tout : une socket qui
   * se ferme n'a jamais ce droit. Sans ce passage, chaque shell lance depuis le
   * telephone survivrait a l'arret du serveur en processus orphelin.
   */
  arreter() {
    clearInterval(this.menage)
    for (const session of this.sessions.values()) session.tuer()
    this.sessions.clear()
    this.tickets.clear()
  }
}

/** Instance unique du processus, partagee avec les routes Next. */
function gestionnaire() {
  const global = globalThis
  if (!global[CLE]) global[CLE] = new Gestionnaire()
  return global[CLE]
}

module.exports = { gestionnaire, Gestionnaire, CLE, MAX_SESSIONS, TICKET_MS }
