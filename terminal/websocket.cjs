/**
 * Terminal LAN - couche WebSocket (PRD 8).
 *
 * Greffee sur le serveur HTTP existant via son evenement `upgrade` : meme
 * processus, meme port, meme adresse LAN que le partage de fichiers. Le PRD 17
 * est explicite - pas de second serveur, pas de seconde IP a retenir.
 */
const { WebSocketServer } = require('ws')
const protocole = require('./protocole.cjs')
const { gestionnaire } = require('./gestionnaire.cjs')

/** Chemin de la socket. Tout le reste de l'`upgrade` retourne a Next. */
const CHEMIN = '/api/terminal/ws'

/** Delai laisse au client pour envoyer son message `auth`. */
const DELAI_AUTH = 10_000

/** Battement de coeur : detecte un client parti sans fermeture propre. */
const BATTEMENT_MS = 30_000

function adresseReelle(req) {
  const brut = req.socket.remoteAddress || ''
  return brut.startsWith('::ffff:') ? brut.slice(7) : brut
}

function creerServeur() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })

  /**
   * Un client qui disparait sans fermer (telephone verrouille, WiFi coupe)
   * laisse une socket a moitie ouverte. Le ping periodique la ramasse ; la
   * session, elle, continue de vivre - c'est tout le contrat du PRD 10.
   */
  const battement = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.estVivant === false) {
        ws.terminate()
        continue
      }
      ws.estVivant = false
      try {
        ws.ping()
      } catch {
        /* socket deja partie */
      }
    }
  }, BATTEMENT_MS)
  battement.unref?.()

  wss.on('connection', (ws, req) => {
    const gest = gestionnaire()
    const ip = adresseReelle(req)

    ws.estVivant = true
    ws.on('pong', () => {
      ws.estVivant = true
    })

    let session = null
    const client = {
      envoyer: (charge) => {
        if (ws.readyState === ws.OPEN) ws.send(charge)
      },
    }

    const refuser = (message) => {
      try {
        ws.send(protocole.erreur(message, true))
      } catch {
        /* socket deja partie */
      }
      ws.close(4001, 'refuse')
    }

    // Tant que l'authentification n'a pas eu lieu, la socket ne sert a rien :
    // on la ferme plutot que de la laisser ouverte indefiniment.
    const minuteur = setTimeout(() => {
      if (!session) refuser("Delai d'authentification depasse.")
    }, DELAI_AUTH)

    ws.on('message', (brut) => {
      let msg
      try {
        msg = protocole.decoder(brut)
      } catch (err) {
        client.envoyer(protocole.erreur(err.message))
        return
      }

      /* ---- premier message : authentification (PRD 9) ---- */
      if (!session) {
        if (msg.type !== protocole.CLIENT.AUTH) {
          refuser("Authentification requise avant toute autre commande.")
          return
        }
        const verdict = gest.consommerTicket(msg.token, { ip, sessionId: msg.sessionId })
        if (!verdict.ok) {
          refuser(verdict.raison)
          return
        }
        const cible = gest.obtenir(msg.sessionId)
        if (!cible) {
          refuser("Cette session n'existe plus.")
          return
        }

        clearTimeout(minuteur)
        session = cible
        session.attacher(client)

        // Ordre voulu : le client configure son terminal, recupere l'historique
        // (PRD 21), puis on cale la taille et on force le repeint (PRD 20/22).
        client.envoyer(protocole.pret(session))
        const historique = session.historique()
        if (historique) client.envoyer(protocole.sortie(historique, true))
        if (msg.cols && msg.rows) session.redimensionner(msg.cols, msg.rows)
        session.repeindre()
        if (!session.vivante) {
          client.envoyer(protocole.fin(session.codeSortie, session.signalSortie))
        }
        return
      }

      /* ---- session etablie ---- */
      switch (msg.type) {
        case protocole.CLIENT.INPUT:
          session.ecrire(msg.data)
          break
        case protocole.CLIENT.RESIZE:
          session.redimensionner(msg.cols, msg.rows)
          break
        case protocole.CLIENT.SIGNAL:
          session.signal(msg.signal)
          break
        case protocole.CLIENT.PING:
          client.envoyer(protocole.pong())
          break
        default:
          client.envoyer(protocole.erreur('Message inattendu.'))
      }
    })

    // LE point du PRD 10 : on se detache, on ne tue rien.
    ws.on('close', () => {
      clearTimeout(minuteur)
      if (session) session.detacher(client)
    })

    ws.on('error', () => {
      clearTimeout(minuteur)
      if (session) session.detacher(client)
    })
  })

  return { wss, battement }
}

/**
 * Branche le terminal sur un serveur HTTP existant.
 *
 * Rend une fonction `gererUpgrade(req, socket, head)` qui repond `true` quand
 * elle a pris la requete a son compte. server.js redonne tout le reste au
 * gestionnaire d'`upgrade` de Next : sans ca, le rechargement a chaud de
 * `npm run dev` cesse de fonctionner sans le moindre message d'erreur.
 */
function brancher() {
  const { wss, battement } = creerServeur()

  function gererUpgrade(req, socket, head) {
    let chemin
    try {
      chemin = new URL(req.url, 'http://interne').pathname
    } catch {
      return false
    }
    if (chemin !== CHEMIN) return false

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
    return true
  }

  function fermer() {
    clearInterval(battement)
    for (const ws of wss.clients) {
      try {
        ws.close(1001, 'arret du Hub')
      } catch {
        /* deja partie */
      }
    }
    wss.close()
  }

  return { gererUpgrade, fermer, CHEMIN }
}

module.exports = { brancher, CHEMIN }
