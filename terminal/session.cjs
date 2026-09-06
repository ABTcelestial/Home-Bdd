/**
 * Terminal LAN - une session = un PTY qui survit aux navigateurs (PRD 10).
 *
 * La regle centrale du PRD : une deconnexion WebSocket NE TUE PAS la session.
 * Le telephone se verrouille, le WiFi tombe, l'onglet se ferme -> les clients
 * se retirent de l'ensemble, le PTY continue de tourner. Claude Code travaille
 * pendant que Ryan dort.
 */
const protocole = require('./protocole.cjs')
const pty = require('./pty.cjs')

/** Historique conserve par session (PRD 21 : 20 000 a 100 000 caracteres). */
const TAMPON_MAX = Math.min(
  Math.max(Number(process.env.HUB_TERMINAL_TAMPON || 65536), 20000),
  200000,
)

class Session {
  constructor({ id, titre, shell, cwd, cols = 80, rows = 24 }) {
    this.id = id
    this.titre = titre || 'Terminal'
    this.cols = cols
    this.rows = rows
    this.creeLe = Date.now()
    this.derniereActivite = Date.now()
    this.vivante = false
    this.codeSortie = null
    this.signalSortie = null

    /** Clients attaches. Un client expose seulement `envoyer(texte)`. */
    this.clients = new Set()

    /** Historique : morceaux successifs, tailles cumulees bornees. */
    this.tampon = []
    this.tamponTaille = 0

    const ouvert = pty.ouvrir({ shell, cwd, cols, rows })
    this.processus = ouvert.processus
    this.shell = ouvert.shell
    this.cwd = ouvert.cwd
    this.vivante = true

    this.processus.onData((donnees) => {
      this.derniereActivite = Date.now()
      this._memoriser(donnees)
      this.diffuser(protocole.sortie(donnees))
    })

    this.processus.onExit(({ exitCode, signal }) => {
      this.vivante = false
      this.codeSortie = exitCode ?? null
      this.signalSortie = signal ?? null
      this.derniereActivite = Date.now()
      this.diffuser(protocole.fin(this.codeSortie, this.signalSortie))
    })
  }

  /** Ajoute au tampon circulaire, en jetant les plus vieux morceaux entiers. */
  _memoriser(texte) {
    this.tampon.push(texte)
    this.tamponTaille += texte.length
    while (this.tamponTaille > TAMPON_MAX && this.tampon.length > 1) {
      this.tamponTaille -= this.tampon.shift().length
    }
    // Un seul morceau plus gros que la limite : on coupe par la fin, qui est
    // la partie que l'utilisateur veut revoir.
    if (this.tamponTaille > TAMPON_MAX && this.tampon.length === 1) {
      this.tampon[0] = this.tampon[0].slice(-TAMPON_MAX)
      this.tamponTaille = this.tampon[0].length
    }
  }

  historique() {
    return this.tampon.join('')
  }

  /**
   * Envoie a tous les clients attaches. Un client mort est retire sans bruit :
   * ce n'est pas une erreur, c'est le cas nominal du telephone verrouille.
   */
  diffuser(charge) {
    for (const client of this.clients) {
      try {
        client.envoyer(charge)
      } catch {
        this.clients.delete(client)
      }
    }
  }

  attacher(client) {
    this.clients.add(client)
  }

  /** Detache SANS tuer : c'est tout l'interet de la session persistante. */
  detacher(client) {
    this.clients.delete(client)
  }

  ecrire(donnees) {
    if (!this.vivante) return false
    this.derniereActivite = Date.now()
    this.processus.write(donnees)
    return true
  }

  /**
   * Ctrl+C sous Windows n'est pas un signal POSIX : ConPTY attend l'octet de
   * controle dans le flux d'entree, exactement comme un vrai clavier. Envoyer
   * SIGINT au processus ne ferait rien du tout ici.
   */
  signal(nom) {
    const octet = protocole.SIGNAUX[nom]
    if (!octet) return false
    return this.ecrire(octet)
  }

  redimensionner(cols, rows) {
    if (!this.vivante) return false
    if (cols === this.cols && rows === this.rows) return false
    this.cols = cols
    this.rows = rows
    try {
      this.processus.resize(cols, rows)
    } catch {
      // Le PTY vient de mourir entre le test et l'appel : sans consequence.
      return false
    }
    return true
  }

  /**
   * Force un repeint complet de l'ecran.
   *
   * Sans ca, un telephone qui revient sur une session Claude Code ne voit que
   * l'historique brut rejoue : l'ecran alterne de la TUI n'est pas redessine et
   * l'affichage reste tronque au milieu d'une sequence ANSI. Un aller-retour de
   * taille declenche le SIGWINCH que toute TUI attend pour se redessiner.
   */
  repeindre() {
    if (!this.vivante || this.cols <= 1) return
    const { cols, rows } = this
    try {
      this.processus.resize(cols - 1, rows)
      setTimeout(() => {
        try {
          if (this.vivante) this.processus.resize(cols, rows)
        } catch {
          /* session partie entre-temps */
        }
      }, 40)
    } catch {
      /* session partie entre-temps */
    }
  }

  tuer() {
    if (!this.vivante) return
    try {
      this.processus.kill()
    } catch {
      /* deja mort */
    }
    this.vivante = false
  }

  /** Vue serialisable, pour l'API et la liste des sessions (PRD 11). */
  resume() {
    return {
      id: this.id,
      titre: this.titre,
      cwd: this.cwd,
      shell: this.shell,
      cols: this.cols,
      rows: this.rows,
      vivante: this.vivante,
      codeSortie: this.codeSortie,
      clients: this.clients.size,
      creeLe: this.creeLe,
      derniereActivite: this.derniereActivite,
    }
  }
}

module.exports = { Session, TAMPON_MAX }
