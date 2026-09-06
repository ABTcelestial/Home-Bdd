/**
 * Terminal LAN - seule frontiere avec node-pty.
 *
 * Tout ce qui est natif, propre a Windows ou propre au shell vit ici. Le reste
 * du module ne connait que `ouvrir()` et l'objet rendu.
 *
 * Pourquoi un vrai PTY et pas `exec` (PRD 6) : sans pseudo-terminal, un
 * programme interactif ne recoit pas de taille d'ecran, n'active pas ses
 * couleurs, ne dessine pas son ecran alterne. Claude Code, npm, git ou Expo
 * n'y sont tout simplement pas utilisables.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

let natif = null
let echecChargement = null

/**
 * node-pty est un module natif. S'il manque du paquet (cas typique : un Hub
 * portable fabrique sans la copie explicite), on veut un message clair une
 * seule fois, pas une pile d'exceptions a chaque tentative d'ouverture.
 */
function charger() {
  if (natif) return natif
  if (echecChargement) throw echecChargement
  try {
    natif = require('node-pty')
  } catch (err) {
    echecChargement = new Error(
      "Le module natif node-pty est introuvable ou illisible. Le Terminal LAN " +
        'est indisponible ; le reste du Hub fonctionne normalement. Detail : ' +
        (err && err.message ? err.message : String(err)),
    )
    throw echecChargement
  }
  return natif
}

/** Le terminal est-il utilisable sur cette machine ? (sonde sans lever) */
function disponible() {
  try {
    charger()
    return true
  } catch {
    return false
  }
}

function raisonIndisponible() {
  try {
    charger()
    return null
  } catch (err) {
    return err.message
  }
}

/** Shell par defaut. Chemin complet sous Windows : ne depend pas du PATH. */
function shellParDefaut() {
  if (process.env.HUB_TERMINAL_SHELL) return process.env.HUB_TERMINAL_SHELL
  if (process.platform !== 'win32') return process.env.SHELL || '/bin/bash'
  const complet = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
  return fs.existsSync(complet) ? complet : 'powershell.exe'
}

/** Dossier de depart par defaut : le Bureau, comme le selecteur de dossier. */
function dossierParDefaut() {
  if (process.env.HUB_TERMINAL_CWD) return process.env.HUB_TERMINAL_CWD
  const bureau = path.join(os.homedir(), 'Desktop')
  return fs.existsSync(bureau) ? bureau : os.homedir()
}

/**
 * Environnement transmis au shell.
 *
 * SECURITE : le processus du Hub porte ses propres secrets (HUB_PASSWORD,
 * HUB_SECRET, charges depuis le fichier d'environnement local). Les laisser
 * passer donnerait le mot de passe de la maison a quiconque tape
 * `echo $env:HUB_PASSWORD` dans le terminal. On retire donc tout le prefixe
 * HUB_.
 *
 * On retire aussi les variables internes de Next : heritees dans un shell,
 * elles cassent silencieusement un `npm run dev` lance sur un autre projet.
 */
function envSain() {
  const propre = {}
  for (const [cle, valeur] of Object.entries(process.env)) {
    if (valeur === undefined) continue
    if (cle.startsWith('HUB_')) continue
    if (cle.startsWith('__NEXT_')) continue
    if (cle === 'NODE_OPTIONS' || cle === 'NODE_ENV') continue
    if (cle === 'PORT' || cle === 'HOST') continue
    propre[cle] = valeur
  }
  // Un vrai terminal couleur : sans ca, les TUI se rabattent sur du texte nu.
  propre.TERM = 'xterm-256color'
  propre.COLORTERM = 'truecolor'
  return propre
}

/** Le dossier demande est-il utilisable ? Sinon on retombe sur le defaut. */
function dossierSur(demande) {
  if (!demande) return dossierParDefaut()
  try {
    if (fs.statSync(demande).isDirectory()) return demande
  } catch {
    /* inexistant ou illisible */
  }
  return dossierParDefaut()
}

/**
 * Ouvre un pseudo-terminal. Rend l'objet node-pty tel quel : c'est la session
 * qui decide quoi en faire.
 */
function ouvrir({ shell, cwd, cols = 80, rows = 24 } = {}) {
  const pty = charger()
  const fichier = shell || shellParDefaut()
  const dossier = dossierSur(cwd)
  const processus = pty.spawn(fichier, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: dossier,
    env: envSain(),
  })
  return { processus, shell: fichier, cwd: dossier }
}

module.exports = {
  disponible,
  raisonIndisponible,
  shellParDefaut,
  dossierParDefaut,
  ouvrir,
}
