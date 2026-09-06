#!/usr/bin/env node
/**
 * Fabrique le Celestial Hub portable : un dossier autonome qui tourne sur
 * n'importe quel PC Windows, sans Node installe, sans droits administrateur.
 *
 *   node deploiement/portable.mjs
 *
 * Produit dist-portable/Celestial Hub/ :
 *
 *   Celestial Hub.exe     lanceur compile, logo en icone
 *   runtime/node.exe      le moteur, embarque
 *   app/                  sortie autonome de Next (server.js maison inclus)
 *   Fichiers/             le dossier partage, cree au premier demarrage
 *   LISEZ-MOI.txt
 *
 * SECURITE : le build autonome de Next embarque `data/config.json`, qui
 * contient le secret de session et l'empreinte du mot de passe du Hub de cette
 * machine. Ce dossier est exclu explicitement — un paquet distribue ne doit
 * jamais transporter de quoi forger une session.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const PROJET = path.resolve(ICI, '..')
const SORTIE = path.join(PROJET, 'dist-portable', 'Celestial Hub')
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'

const etape = (n, texte) => console.log(`\n[${n}] ${texte}`)

async function videDossier(cible) {
  await fsp.rm(cible, { recursive: true, force: true })
  await fsp.mkdir(cible, { recursive: true })
}

/** Copie recursive, avec exclusion par nom de premier niveau. */
async function copier(source, cible, exclus = []) {
  await fsp.mkdir(cible, { recursive: true })
  for (const entree of await fsp.readdir(source, { withFileTypes: true })) {
    if (exclus.includes(entree.name)) {
      console.log(`    exclu : ${entree.name}`)
      continue
    }
    const de = path.join(source, entree.name)
    const vers = path.join(cible, entree.name)
    if (entree.isDirectory()) await copier(de, vers)
    else if (entree.isFile()) await fsp.copyFile(de, vers)
  }
}

/**
 * Copie recursive filtree : `garder(cheminRelatif, entree)` decide.
 */
async function copierFiltre(source, cible, garder, base = '') {
  await fsp.mkdir(cible, { recursive: true })
  for (const entree of await fsp.readdir(source, { withFileTypes: true })) {
    const relatif = base ? `${base}/${entree.name}` : entree.name
    if (!garder(relatif, entree)) continue
    const de = path.join(source, entree.name)
    const vers = path.join(cible, entree.name)
    if (entree.isDirectory()) await copierFiltre(de, vers, garder, relatif)
    else if (entree.isFile()) await fsp.copyFile(de, vers)
  }
}

/**
 * Modules dont le SERVEUR a besoin, et que Next ne copie jamais.
 *
 * La sortie autonome de Next ne trace que ce qu'importe l'application. Or
 * `ws` et `node-pty` sont requis par server.js, qui n'est pas trace du tout :
 * sans cette copie explicite, le Hub portable demarre normalement, sert les
 * fichiers... et annonce que le Terminal LAN est indisponible. La panne est
 * silencieuse a la fabrication, d'ou l'assertion qui suit la copie.
 */
const MODULES_SERVEUR = ['ws', 'node-pty']

/** Plateforme de la machine qui fabrique le paquet. */
const PLATEFORME = `${process.platform}-${process.arch}`

/**
 * node-pty embarque les binaires de TOUTES les plateformes (58 Mo). Un paquet
 * Windows n'a que faire de macOS et de Linux ; on ne garde que la sienne, plus
 * le code JavaScript. Les sources C++ et les dependances de compilation ne
 * servent qu'a rebatir le module, jamais a l'executer.
 */
function garderPourNodePty(relatif, entree) {
  const premier = relatif.split('/')[0]
  if (['src', 'deps', 'third_party', 'typings', 'scripts'].includes(premier)) return false
  if (relatif.endsWith('.map') || relatif.endsWith('.test.js')) return false
  // Les .pdb sont les symboles de debogage des binaires natifs : 28,5 Mo pour
  // win32-x64, dont l'execution n'a aucun besoin. Mesure : 30,9 -> 2,4 Mo.
  if (relatif.endsWith('.pdb')) return false
  if (premier === 'prebuilds') {
    const morceaux = relatif.split('/')
    // On garde le dossier `prebuilds` lui-meme, puis uniquement notre cible.
    if (morceaux.length >= 2 && morceaux[1] !== PLATEFORME) return false
  }
  if (entree.isFile() && premier === 'binding.gyp') return false
  return true
}

async function taille(dossier) {
  let total = 0
  for (const e of await fsp.readdir(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name)
    if (e.isDirectory()) total += await taille(p)
    else if (e.isFile()) total += (await fsp.stat(p)).size
  }
  return total
}

async function main() {
  const standalone = path.join(PROJET, '.next', 'standalone')
  if (!fs.existsSync(standalone)) {
    throw new Error("Sortie autonome absente. Lancez d'abord : npm run build")
  }

  etape(1, 'Preparation du dossier de sortie')
  await videDossier(SORTIE)

  etape(2, "Copie de l'application (sans les secrets locaux)")
  const app = path.join(SORTIE, 'app')
  // `data` : config locale (secret de session, empreinte du mot de passe).
  // `.env` : mot de passe de CETTE machine.
  await copier(standalone, app, ['data', '.env', '.env.local'])
  await copier(path.join(PROJET, '.next', 'static'), path.join(app, '.next', 'static'))
  await copier(path.join(PROJET, 'public'), path.join(app, 'public'))

  // Le serveur maison remplace celui genere par Next : lui seul reecrit
  // l'en-tete d'adresse reelle, dont depend la distinction PC serveur / client.
  await fsp.copyFile(path.join(PROJET, 'server.js'), path.join(app, 'server.js'))

  const secret = path.join(app, 'data', 'config.json')
  if (fs.existsSync(secret)) throw new Error('ARRET : un config.json local a ete copie dans le paquet.')

  etape(3, 'Modules du serveur (Terminal LAN)')

  // Le module du terminal appartient au serveur maison, que Next ne trace pas
  // davantage que server.js lui-meme : sans cette copie, le paquet demarre et
  // annonce simplement "Terminal : desactive".
  await copierFiltre(path.join(PROJET, 'terminal'), path.join(app, 'terminal'), () => true)
  console.log('    terminal/')

  for (const nom of MODULES_SERVEUR) {
    const source = path.join(PROJET, 'node_modules', nom)
    if (!fs.existsSync(source)) throw new Error(`Module introuvable : ${nom}. Lancez npm install.`)
    const cible = path.join(app, 'node_modules', nom)
    if (nom === 'node-pty') await copierFiltre(source, cible, garderPourNodePty)
    else await copierFiltre(source, cible, () => true)
    console.log(`    ${nom} (${((await taille(cible)) / 1024 / 1024).toFixed(1)} Mo)`)
  }

  /**
   * On ne verifie pas des noms de fichiers : on CHARGE les modules depuis le
   * paquet, avec le meme moteur Node que celui qu'on y embarque.
   *
   * Verifier l'existence de pty.node n'aurait rien vu la premiere fois : le
   * binaire etait bien la, c'est le dossier terminal/ qui manquait. Un vrai
   * chargement attrape les deux, plus le cas d'un binaire natif incompatible.
   */
  const sonde = [
    "const w = require('./terminal/websocket.cjs')",
    "if (typeof w.brancher !== 'function') throw new Error('websocket.cjs incomplet')",
    "const pty = require('node-pty')",
    "if (typeof pty.spawn !== 'function') throw new Error('node-pty incomplet')",
    "require('ws')",
    "console.log('paquet verifie')",
  ].join('; ')
  try {
    const sortie = execFileSync(process.execPath, ['-e', sonde], { cwd: app, encoding: 'utf8' })
    console.log(`    ${sortie.trim()}`)
  } catch (err) {
    const detail = (err.stderr || err.message || '').toString().split('\n')[0]
    throw new Error(
      `ARRET : le Terminal LAN ne se charge pas depuis le paquet. ${detail}\n` +
        '       Le Hub demarrerait en annoncant "Terminal : desactive".',
    )
  }

  etape(4, 'Embarquement du moteur Node')
  const node = process.execPath
  await fsp.mkdir(path.join(SORTIE, 'runtime'), { recursive: true })
  await fsp.copyFile(node, path.join(SORTIE, 'runtime', 'node.exe'))
  console.log(`    ${node} (${(fs.statSync(node).size / 1024 / 1024).toFixed(0)} Mo)`)

  etape(5, 'Compilation du lanceur')
  if (!fs.existsSync(CSC)) throw new Error(`Compilateur C# introuvable : ${CSC}`)
  execFileSync(CSC, [
    '/nologo',
    '/target:exe',
    '/optimize+',
    `/win32icon:${path.join(ICI, 'logo.ico')}`,
    `/out:${path.join(SORTIE, 'Celestial Hub.exe')}`,
    path.join(ICI, 'Lanceur.cs'),
  ])
  console.log('    Celestial Hub.exe')

  etape(6, 'Mode d\'emploi')
  await fsp.writeFile(
    path.join(SORTIE, 'LISEZ-MOI.txt'),
    [
      'Celestial Hub - version portable',
      '================================',
      '',
      'Double-cliquez sur "Celestial Hub.exe".',
      '',
      'Au premier demarrage il demande un mot de passe : c\'est lui qui protegera',
      'vos fichiers. Tout le monde sur le reseau pourra lire, envoyer ET supprimer',
      'ce que contient le dossier "Fichiers" a cote de l\'executable.',
      '',
      'La fenetre affiche deux adresses :',
      '  - celle en localhost, pour ce PC ;',
      '  - celle en 192.168.x.x ou 10.x.x.x, a taper sur le telephone ou une',
      '    autre machine du meme reseau.',
      '',
      'Le pare-feu Windows demandera l\'autorisation au premier lancement :',
      'acceptez pour les reseaux PRIVES uniquement. Refusez pour les reseaux',
      'publics - ce Hub n\'est pas fait pour internet.',
      '',
      'Fermez la fenetre pour arreter le Hub.',
      '',
      'Rien n\'est installe sur la machine : ce dossier peut vivre sur une cle USB,',
      'et se supprime d\'un bloc.',
      '',
    ].join('\r\n'),
    'utf8',
  )

  const octets = await taille(SORTIE)
  console.log(`\nTermine : ${SORTIE}`)
  console.log(`Taille  : ${(octets / 1024 / 1024).toFixed(0)} Mo`)
}

main().catch((err) => {
  console.error('\nportable : ' + err.message)
  process.exit(1)
})
