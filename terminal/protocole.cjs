/**
 * Terminal LAN - protocole WebSocket (PRD 9).
 *
 * Couche volontairement isolee et sans dependance : c'est le seul endroit ou
 * la forme des messages est decrite. Serveur et navigateur s'y referent, et
 * une extension future (plusieurs onglets, transfert de fichier, telemetrie)
 * s'ajoute ici sans toucher au reste.
 *
 * Tout message entrant est valide avant d'atteindre le PTY : un navigateur du
 * reseau ne doit jamais pouvoir faire tomber le Hub avec un message tordu.
 */

/** Version du protocole. Le client la renvoie a l'authentification. */
const VERSION = 1

/** Messages emis par le navigateur. */
const CLIENT = {
  AUTH: 'auth',
  INPUT: 'input',
  RESIZE: 'resize',
  SIGNAL: 'signal',
  PING: 'ping',
}

/** Messages emis par le serveur. */
const SERVEUR = {
  READY: 'ready',
  OUTPUT: 'output',
  ERROR: 'error',
  EXIT: 'exit',
  PONG: 'pong',
}

/**
 * Bornes. Elles protegent la memoire du serveur : un client hostile ne peut ni
 * pousser un message geant, ni demander un terminal de 100 000 colonnes.
 */
const MAX_ENTREE = 64 * 1024
const MAX_COLONNES = 500
const MAX_LIGNES = 300

/** Signaux acceptes. Sous Windows ils se traduisent en octets de controle. */
const SIGNAUX = {
  SIGINT: '\u0003', // Ctrl+C
  SIGQUIT: '\u001c',
  SIGTSTP: '\u001a', // Ctrl+Z
}

class ProtocoleErreur extends Error {}

function entier(valeur, min, max, nom) {
  const n = Number(valeur)
  if (!Number.isInteger(n)) throw new ProtocoleErreur(`${nom} doit etre un entier.`)
  if (n < min || n > max) throw new ProtocoleErreur(`${nom} hors bornes (${min}-${max}).`)
  return n
}

/**
 * Lit un message brut recu du navigateur et rend un objet sur.
 * Leve ProtocoleErreur sur toute forme inattendue : l'appelant repond `error`
 * et garde la connexion, plutot que de laisser passer n'importe quoi.
 */
function decoder(brut) {
  let msg
  try {
    msg = JSON.parse(typeof brut === 'string' ? brut : brut.toString('utf8'))
  } catch {
    throw new ProtocoleErreur('Message illisible (JSON attendu).')
  }
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    throw new ProtocoleErreur('Message sans type.')
  }

  switch (msg.type) {
    case CLIENT.AUTH: {
      if (typeof msg.token !== 'string' || !msg.token) {
        throw new ProtocoleErreur('Jeton manquant.')
      }
      if (typeof msg.sessionId !== 'string' || !msg.sessionId) {
        throw new ProtocoleErreur('Session manquante.')
      }
      return {
        type: CLIENT.AUTH,
        token: msg.token,
        sessionId: msg.sessionId,
        cols: msg.cols === undefined ? null : entier(msg.cols, 1, MAX_COLONNES, 'cols'),
        rows: msg.rows === undefined ? null : entier(msg.rows, 1, MAX_LIGNES, 'rows'),
      }
    }
    case CLIENT.INPUT: {
      if (typeof msg.data !== 'string') throw new ProtocoleErreur('Entree invalide.')
      if (msg.data.length > MAX_ENTREE) throw new ProtocoleErreur('Entree trop longue.')
      return { type: CLIENT.INPUT, data: msg.data }
    }
    case CLIENT.RESIZE: {
      return {
        type: CLIENT.RESIZE,
        cols: entier(msg.cols, 1, MAX_COLONNES, 'cols'),
        rows: entier(msg.rows, 1, MAX_LIGNES, 'rows'),
      }
    }
    case CLIENT.SIGNAL: {
      if (typeof msg.signal !== 'string' || !(msg.signal in SIGNAUX)) {
        throw new ProtocoleErreur('Signal inconnu.')
      }
      return { type: CLIENT.SIGNAL, signal: msg.signal }
    }
    case CLIENT.PING:
      return { type: CLIENT.PING }
    default:
      throw new ProtocoleErreur(`Type inconnu : ${msg.type}`)
  }
}

/* Constructeurs des messages sortants : le serveur ne fabrique jamais de JSON
   a la main ailleurs, pour que la forme reste decrite ici et nulle part ailleurs. */

const encoder = (objet) => JSON.stringify(objet)

const pret = (session) =>
  encoder({
    type: SERVEUR.READY,
    version: VERSION,
    sessionId: session.id,
    titre: session.titre,
    cwd: session.cwd,
    shell: session.shell,
    cols: session.cols,
    rows: session.rows,
    vivante: session.vivante,
  })

/** `rejeu` distingue l'historique rejoue apres reconnexion du flux temps reel. */
const sortie = (data, rejeu = false) => encoder({ type: SERVEUR.OUTPUT, data, rejeu })

const erreur = (message, fatale = false) => encoder({ type: SERVEUR.ERROR, message, fatale })

const fin = (code, signal = null) => encoder({ type: SERVEUR.EXIT, code, signal })

const pong = () => encoder({ type: SERVEUR.PONG })

module.exports = {
  VERSION,
  CLIENT,
  SERVEUR,
  SIGNAUX,
  MAX_ENTREE,
  MAX_COLONNES,
  MAX_LIGNES,
  ProtocoleErreur,
  decoder,
  pret,
  sortie,
  erreur,
  fin,
  pong,
}
