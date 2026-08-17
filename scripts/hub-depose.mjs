#!/usr/bin/env node
/**
 * hub-depose — depose un livrable dans le Celestial Hub, au bon endroit, et le
 * signale dans l'app.
 *
 * Pourquoi un script plutot qu'un "copie le fichier et edite le JSON" :
 * .hub-guide.json est ecrit par plusieurs sessions qui ne se voient pas. Edite
 * a la main, il finit casse (et toutes les marques disparaissent d'un coup).
 * Ici l'ecriture est atomique et le format ne peut pas deraper.
 *
 * Usage :
 *   node hub-depose.mjs --projet fonds --version 1.0.0-T4 \
 *        --fichier "C:\\...\\celestial-fonds.apk" \
 *        --bulle "A tester sur ton telephone" --ton action
 *
 *   node hub-depose.mjs --aide
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const RACINE_DEFAUT = 'D:\\CelestialHub'
const GUIDE = '.hub-guide.json'
const TONS = ['info', 'action', 'alerte']
// 1.0.0, 1.0.0-T4, 2.3.1-N10I
const VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9]+)?$/
const PROJET = /^[a-z0-9][a-z0-9-]*$/

const AIDE = `
hub-depose — deposer un livrable dans le Celestial Hub

  --projet <nom>        dossier du projet dans le Hub (ex: fonds, chantiers-mobile)
  --version <version>   1.0.0 pour une version publiee, 1.0.0-T4 pour un test
  --fichier <chemin>    l'artefact a deposer (repetable)
  --bulle <texte>       ce que Ryan doit en faire (affiche dans l'app)
  --ton <ton>           info | action | alerte        (defaut: action)
  --readme <chemin>     README.md a placer dans le dossier de version
  --checklist <chemin>  CHECKLIST.md a placer dans le dossier de version
  --archiver            descend la version publiee actuelle dans archive/<AAAA-MM>/
  --pourquoi <texte>    raison de l'archivage, ecrite dans le NOTE.md du mois
  --racine <chemin>     racine du Hub (defaut: ${RACINE_DEFAUT}, ou HUB_ROOT)
  --aide

Regles appliquees :
  - une version SANS suffixe -T est la version publiee ; il ne peut y en avoir
    qu'une hors archive/ (utiliser --archiver pour remplacer l'ancienne) ;
  - le dossier de version recoit un README.md minimal s'il n'en a pas ;
  - rien n'est jamais ecrit dans db.json ni dans .corbeille/.
`

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

function lireArgs(argv) {
  const out = { fichier: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const cle = a.slice(2)
    if (cle === 'aide' || cle === 'archiver') {
      out[cle] = true
      continue
    }
    const valeur = argv[++i]
    if (valeur === undefined) throw new Error(`--${cle} attend une valeur.`)
    if (cle === 'fichier') out.fichier.push(valeur)
    else out[cle] = valeur
  }
  return out
}

function moisCourant() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function jourCourant() {
  return new Date().toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */
/* Fichier de guidage                                                  */
/* ------------------------------------------------------------------ */

/** Ecriture atomique : un lecteur ne voit jamais un JSON a moitie ecrit. */
async function majGuide(racine, entrees) {
  const cible = path.join(racine, GUIDE)
  let donnees = {}
  try {
    const brut = await fsp.readFile(cible, 'utf8')
    const parse = JSON.parse(brut)
    if (parse && typeof parse === 'object' && !Array.isArray(parse)) donnees = parse
  } catch {
    // absent ou casse : on repart d'un objet vide plutot que de refuser de
    // deposer. Le fichier casse est de toute facon deja signale dans l'app.
  }
  for (const [chemin, valeur] of Object.entries(entrees)) donnees[chemin] = valeur
  const tmp = cible + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify(donnees, null, 2) + '\n', 'utf8')
  await fsp.rename(tmp, cible)
}

/* ------------------------------------------------------------------ */
/* Archivage de la version publiee                                     */
/* ------------------------------------------------------------------ */

function versionsPubliees(dossierProjet) {
  if (!fs.existsSync(dossierProjet)) return []
  return fs
    .readdirSync(dossierProjet, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive' && VERSION.test(e.name))
    .map((e) => e.name)
    .filter((nom) => !nom.includes('-'))
}

async function archiver(dossierProjet, version, pourquoi) {
  const mois = moisCourant()
  const cible = path.join(dossierProjet, 'archive', mois)
  await fsp.mkdir(cible, { recursive: true })
  await fsp.rename(path.join(dossierProjet, version), path.join(cible, version))

  const note = path.join(cible, 'NOTE.md')
  const ligne = `- **${version}** archivee le ${jourCourant()} — ${pourquoi}\n`
  let contenu = ''
  try {
    contenu = await fsp.readFile(note, 'utf8')
  } catch {
    contenu = `# Archive ${mois}\n\nCe qui est parti ce mois-ci, et pourquoi.\n\n`
  }
  await fsp.writeFile(note, contenu + ligne, 'utf8')
  return path.join('archive', mois, version)
}

/* ------------------------------------------------------------------ */

async function main() {
  const args = lireArgs(process.argv.slice(2))
  if (args.aide || process.argv.length <= 2) {
    console.log(AIDE)
    return
  }

  const racine = args.racine || process.env.HUB_ROOT || RACINE_DEFAUT
  const { projet, version } = args

  if (!projet || !PROJET.test(projet)) {
    throw new Error("--projet manquant ou invalide (minuscules, chiffres et tirets : 'chantiers-mobile').")
  }
  if (!version || !VERSION.test(version)) {
    throw new Error("--version manquante ou invalide (1.0.0, ou 1.0.0-T4 pour un test).")
  }
  if (args.fichier.length === 0) throw new Error('--fichier manquant.')
  const ton = args.ton || 'action'
  if (!TONS.includes(ton)) throw new Error(`--ton doit valoir ${TONS.join(', ')}.`)

  if (!fs.existsSync(racine)) throw new Error(`Racine du Hub introuvable : ${racine}`)

  const dossierProjet = path.join(racine, projet)
  const dossierVersion = path.join(dossierProjet, version)
  const estTest = version.includes('-')

  // Invariant : au plus une version publiee hors archive/.
  if (!estTest) {
    const publiees = versionsPubliees(dossierProjet).filter((v) => v !== version)
    if (publiees.length > 0) {
      if (!args.archiver) {
        throw new Error(
          `${projet} publie deja ${publiees.join(', ')}. Relancer avec --archiver ` +
            `--pourquoi "<raison>" pour la descendre dans archive/, ou deposer un build de test (-T<n>).`,
        )
      }
      if (!args.pourquoi) throw new Error('--archiver exige --pourquoi "<raison>" : un NOTE.md sans raison ne sert a rien.')
      for (const ancienne of publiees) {
        const vers = await archiver(dossierProjet, ancienne, args.pourquoi)
        console.log(`archive : ${ancienne} -> ${vers}`)
      }
    }
  }

  await fsp.mkdir(dossierVersion, { recursive: true })

  const deposes = []
  for (const source of args.fichier) {
    if (!fs.existsSync(source)) throw new Error(`Fichier introuvable : ${source}`)
    const nom = path.basename(source)
    await fsp.copyFile(source, path.join(dossierVersion, nom))
    deposes.push(nom)
    console.log(`depose  : ${projet}/${version}/${nom}`)
  }

  for (const [option, cible] of [
    ['readme', 'README.md'],
    ['checklist', 'CHECKLIST.md'],
  ]) {
    if (!args[option]) continue
    if (!fs.existsSync(args[option])) throw new Error(`Fichier introuvable : ${args[option]}`)
    await fsp.copyFile(args[option], path.join(dossierVersion, cible))
    console.log(`depose  : ${projet}/${version}/${cible}`)
  }

  // README minimal : mieux qu'un dossier muet dans six mois.
  const readme = path.join(dossierVersion, 'README.md')
  if (!fs.existsSync(readme)) {
    await fsp.writeFile(
      readme,
      `# ${projet} ${version}\n\n` +
        `${estTest ? 'Build de test' : 'Version publiee'} — depose le ${jourCourant()}.\n\n` +
        `## Contenu\n\n${deposes.map((n) => `- \`${n}\``).join('\n')}\n\n` +
        `## Ce qui change\n\n_A completer._\n\n## Quoi tester\n\n_A completer._\n`,
      'utf8',
    )
    console.log(`cree    : ${projet}/${version}/README.md (squelette)`)
  }

  const bulle = args.bulle || (estTest ? 'Build de test a verifier' : `${projet} ${version} publiee`)
  const entrees = {}
  for (const nom of deposes) {
    entrees[`${projet}/${version}/${nom}`] = { brille: true, bulle, ton }
  }
  await majGuide(racine, entrees)
  console.log(`marque  : ${deposes.length} element(s) dans ${GUIDE} — "${bulle}"`)
}

main().catch((err) => {
  console.error('hub-depose : ' + err.message)
  process.exit(1)
})
