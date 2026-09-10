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
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const RACINE_DEFAUT = 'D:\\CelestialHub'
const GUIDE = '.hub-guide.json'
// Le sous-dossier ou vivent les builds de TEST — jamais a cote d une version livree.
const TEST = 'test'
const TONS = ['info', 'action', 'alerte']
// 1.0.0, 1.0.0-T4, 2.3.1-N10I
const VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9]+)?$/
const PROJET = /^[a-z0-9][a-z0-9-]*$/

const AIDE = `
hub-depose — deposer un livrable dans le Celestial Hub

  --projet <nom>        dossier du projet dans le Hub (ex: fonds, chantiers-mobile)
  --version <version>   1.0.0 pour une version publiee, 1.0.0-T4 pour un test
  --fichier <chemin>    l'artefact a deposer (repetable). Facultatif si --readme
                        ou --checklist est fourni : documenter une version deja
                        deposee ne doit pas obliger a recopier ses binaires.
  --bulle <texte>       ce que Ryan doit en faire (affiche dans l'app)
  --ton <ton>           info | action | alerte        (defaut: action)
  --marquer <nom>       ne faire briller que ce fichier du dossier de version
                        (defaut: tous les artefacts deposes). A utiliser quand
                        le dossier a un point d'entree : le guide, pas l'APK.
  --readme <chemin>     README.md a placer dans le dossier de version
  --checklist <chemin>  CHECKLIST.md a placer dans le dossier de version
  --archiver            descend la version publiee actuelle dans archive/<AAAA-MM>/
  --pourquoi <texte>    raison de l'archivage, ecrite dans le NOTE.md du mois
  --racine <chemin>     racine du Hub (defaut: ${RACINE_DEFAUT}, ou HUB_ROOT)
  --retirer <chemin>    eteint une marque (chemin relatif a la racine du Hub) et
                        s'arrete la. Le fichier n'est pas supprime.
  --aide

Regles appliquees :
  - un build de TEST (version a suffixe : 1.0.0-T4, 1.1.0-R1) est depose dans
    <projet>/test/<version>/, JAMAIS a cote d'une version livree. Regle de Ryan
    du 2026-09-10 : le dossier d'un projet ne montre que ce qui est parti chez
    un client ;
  - une version SANS suffixe -T est la version publiee ; il ne peut y en avoir
    qu'une hors archive/ (utiliser --archiver pour remplacer l'ancienne) ;
  - un artefact deja present dans une version PUBLIEE n'est jamais ecrase : il
    faut --archiver --pourquoi pour le descendre d'abord (un README ou une
    CHECKLIST, eux, se redeposent librement : documenter une version livree
    est un usage normal) ;
  - le dossier de version recoit un README.md minimal s'il n'en a pas ;
  - tout dossier portant au moins un artefact recoit un EMPREINTES.md (nom,
    taille, SHA-256), reecrit a chaque depot sur le contenu REEL du dossier :
    ni le nom, ni versionName, ni versionCode n'identifient un binaire ;
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
/* Empreintes des artefacts                                            */
/* ------------------------------------------------------------------- */
//
// POURQUOI CE FICHIER EXISTE — mesure du 2026-09-10, sur les deux Hub a la fois.
//
// Ni le nom, ni le numero de version, ni le versionCode n'identifient un binaire.
// Compte a l'aapt2 ce matin-la, sans supposer :
//
//   · chantiers-mobile : CINQ binaires differents portent le `versionCode 3`
//     (T10 a 108 284 426 octets sur deux ABI ; T11/T12/T13/T14 a 40 498 746,
//     40 500 874, 40 503 474 et 40 504 642 octets sur arm64 seul). QUATRE fichiers
//     s'appellent `app-release.apk`. Et `celestial-chantiers-1.0.0.apk` existe en
//     deux exemplaires : vc4 (publie) et vc1 (dans 1.0.0-T7).
//   · salle-des-fetes : TROIS binaires sous le `versionCode 6`, et
//     `celestial-salle-des-fetes-1.1.0.apk` porte deux binaires selon le dossier.
//   · les DIX APK de Chantiers annoncent `versionName 1.0.0`.
//
// Consequence concrete, et c'est elle qui a fait ecrire ce code : quand un client
// dit « j'ai la 1.0.0 », l'app affiche `v1.0.0`, le registre enregistre `1.0.0`, et
// rien de tout ca ne dit LEQUEL des dix il a. La reponse ne peut venir que de la
// TAILLE et de l'EMPREINTE du fichier — deux choses qu'aucun ecran n'affiche et que
// personne ne note apres coup.
//
// Alors on les note AU DEPOT, quand elles sont encore sous la main. Trois lignes par
// binaire, et « lequel a-t-il ? » devient une comparaison au lieu d'une enquete.
//
// Le fichier est REECRIT a chaque depot, et il decrit TOUT le dossier — pas seulement
// ce qui vient d'arriver. Un fichier d'empreintes qui ne parlerait que du dernier
// artefact serait la version de ce piege qu'on essaie justement de fermer.
const ARTEFACTS = new Set(['.apk', '.aab', '.exe', '.msi', '.zip', '.dmg', '.appimage'])
const EMPREINTES = 'EMPREINTES.md'

async function sha256(chemin) {
  const h = crypto.createHash('sha256')
  // Par flux : un APK fait 100 Mo et un installeur Electron davantage ; les lire
  // d'un bloc en memoire marcherait aujourd hui et casserait sans prevenir plus tard.
  await new Promise((resoudre, rejeter) => {
    const flux = fs.createReadStream(chemin)
    flux.on('data', (bloc) => h.update(bloc))
    flux.on('end', resoudre)
    flux.on('error', rejeter)
  })
  return h.digest('hex')
}

async function ecrireEmpreintes(dossierVersion, projet, version) {
  const noms = fs
    .readdirSync(dossierVersion)
    .filter((n) => ARTEFACTS.has(path.extname(n).toLowerCase()))
    .sort()
  // Aucun artefact — deux cas, et le second a failli m'echapper (releve par la session
  // parallele en revue de cette PR le 2026-09-10).
  //
  //  · Le dossier n'en a JAMAIS porte : un depot de documentation seule. On ne cree rien
  //    — un tableau vide ferait croire qu'il en a porte.
  //  · ⚠ Le dossier en portait et n'en porte PLUS : alors un EMPREINTES.md existe deja,
  //    et le laisser en place le ferait DECRIRE DES FICHIERS ABSENTS. Ce serait pire que
  //    de ne rien avoir, parce que son propre en-tete promet qu'il est reecrit a chaque
  //    depot : un lecteur fait confiance a sa date. C'est le motif exact que ce depot a
  //    paye trois fois cette nuit-la — un README qui criait NE PAS LIVRER sur un binaire
  //    corrige, un commentaire decrivant une branche morte, un tableau d'artefact resté
  //    sur le binaire remplace.
  //
  // On ne SUPPRIME pas : on date. Le fichier dit ce qu'il sait, y compris qu'il ne sait
  // plus rien.
  if (noms.length === 0) {
    const existant = path.join(dossierVersion, EMPREINTES)
    if (!fs.existsSync(existant)) return null
    await fsp.writeFile(
      existant,
      `# Empreintes — ${projet} ${version}\n\n` +
        `⚠ **Au ${jourCourant()}, ce dossier ne porte plus aucun artefact.**\n\n` +
        `Il en portait : ce fichier decrivait leur taille et leur empreinte. Ils ont ete\n` +
        `retires ou renommes **hors de \`hub-depose.mjs\`**, qui ne peut donc pas dire ce\n` +
        `qu'ils sont devenus. Le tableau precedent a ete retire plutot que laisse en place :\n` +
        `un tableau qui nomme des fichiers absents est pire qu'un tableau absent.\n`,
      'utf8',
    )
    return 0
  }

  const lignes = []
  for (const nom of noms) {
    const chemin = path.join(dossierVersion, nom)
    const octets = fs.statSync(chemin).size
    lignes.push({ nom, octets, sha: await sha256(chemin) })
  }

  const texte =
    `# Empreintes — ${projet} ${version}\n\n` +
    `Ecrit par \`hub-depose.mjs\` le ${jourCourant()}. **Ne pas editer a la main** : il est\n` +
    `reecrit a chaque depot dans ce dossier.\n\n` +
    `> **A quoi ca sert.** Ni le nom du fichier, ni \`versionName\`, ni \`versionCode\` n'identifient\n` +
    `> un binaire — mesure : cinq APK de \`chantiers-mobile\` partagent le \`versionCode 3\`, et les\n` +
    `> dix annoncent \`1.0.0\`. Pour repondre a « quel binaire ce client a-t-il ? », on compare la\n` +
    `> **taille** et le **SHA-256**, et rien d'autre.\n\n` +
    `| fichier | octets | SHA-256 |\n|---|---:|---|\n` +
    lignes.map((l) => `| \`${l.nom}\` | ${l.octets.toLocaleString('fr-FR')} | \`${l.sha}\` |`).join('\n') +
    `\n\n⚠ **Tableau vrai au ${jourCourant()}, date du dernier depot dans ce dossier.** Un\n` +
    `renommage ou un retrait fait A LA MAIN ne passe pas par \`hub-depose.mjs\` et ne met\n` +
    `donc PAS ce tableau a jour. En cas de doute, rehacher le fichier.\n\n` +
    `**Verifier un fichier recu**, sans outil Android :\n\n` +
    '```bash\n' +
    `sha256sum <fichier>        # Linux, macOS, Git Bash\n` +
    `certutil -hashfile <fichier> SHA256   # Windows, sans rien installer\n` +
    '```\n'

  await fsp.writeFile(path.join(dossierVersion, EMPREINTES), texte, 'utf8')
  return lignes.length
}

/* ------------------------------------------------------------------- */
/* Archivage de la version publiee                                     */
/* ------------------------------------------------------------------ */

function versionsPubliees(dossierProjet) {
  if (!fs.existsSync(dossierProjet)) return []
  return fs
    .readdirSync(dossierProjet, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive' && e.name !== TEST && VERSION.test(e.name))
    .map((e) => e.name)
    .filter((nom) => !nom.includes('-'))
}

async function archiver(dossierProjet, version, pourquoi) {
  const mois = moisCourant()
  const cible = path.join(dossierProjet, 'archive', mois)
  await fsp.mkdir(cible, { recursive: true })
  // Deux binaires DIFFERENTS peuvent porter le meme numero dans le meme mois :
  // une version remise a zero, ou renumerotee (1.0.1 est redevenue 1.0.0 le
  // 27/08). Si la place est prise, on refuse et on nomme le dossier de repli
  // plutot que de laisser rename() echouer sur un message d systeme illisible.
  const destination = path.join(cible, version)
  if (fs.existsSync(destination)) {
    // Le dossier doit nommer la date de PUBLICATION du binaire qu il contient,
    // pas celle de l archivage : c est elle qui l identifie six mois plus tard.
    // Le script ne la connait pas — il la demande au lieu de l inventer.
    throw new Error(
      `archive/${mois}/${version}/ existe deja et contient un AUTRE binaire du meme numero. ` +
        `Descends la version publiee a la main dans archive/${mois}/${version}-publiee-<JJ-MM de sa publication>/, ` +
        `ajoute la raison au NOTE.md du mois, puis relance SANS --archiver.`,
    )
  }
  await fsp.rename(path.join(dossierProjet, version), destination)

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

  // Retrait d'une marque : rien d'autre a fournir, et le fichier reste en place.
  if (args.retirer) {
    const cle = args.retirer.replace(/\\/g, '/').replace(/^\/+/, '')
    const cible = path.join(racine, GUIDE)
    let donnees = {}
    try {
      donnees = JSON.parse(await fsp.readFile(cible, 'utf8'))
    } catch {
      throw new Error(`${GUIDE} illisible ou absent : rien a retirer.`)
    }
    if (!(cle in donnees)) throw new Error(`Aucune marque sur "${cle}".`)
    delete donnees[cle]
    const tmp = cible + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(donnees, null, 2) + '\n', 'utf8')
    await fsp.rename(tmp, cible)
    console.log(`retiree : ${cle}`)
    return
  }

  if (!projet || !PROJET.test(projet)) {
    throw new Error("--projet manquant ou invalide (minuscules, chiffres et tirets : 'chantiers-mobile').")
  }
  if (!version || !VERSION.test(version)) {
    throw new Error("--version manquante ou invalide (1.0.0, ou 1.0.0-T4 pour un test).")
  }
  // Documenter une version deja deposee est un cas legitime : on n'exige un
  // artefact que si rien d'autre n'est fourni.
  if (args.fichier.length === 0 && !args.readme && !args.checklist) {
    throw new Error('Rien a deposer : donner --fichier, ou --readme / --checklist.')
  }
  const ton = args.ton || 'action'
  if (!TONS.includes(ton)) throw new Error(`--ton doit valoir ${TONS.join(', ')}.`)

  if (!fs.existsSync(racine)) throw new Error(`Racine du Hub introuvable : ${racine}`)

  const dossierProjet = path.join(racine, projet)
  const estTest = version.includes('-')
  // ⚠ UN BUILD DE TEST NE S'ASSIED PAS A COTE D'UNE VERSION LIVREE. Regle de Ryan
  // (2026-09-10) : le dossier d'un projet ne doit montrer QUE ce qui est parti chez un
  // client. Le 10/09 il y avait NEUF dossiers de test a cote de la version publiee de
  // chantiers-mobile, dont deux portaient le meme nom de fichier officiel avec des
  // binaires differents. Un dossier ou l'on doit CHOISIR est un dossier ou l'on se trompe.
  //
  // Les builds de test vont donc dans `<projet>/test/<version>/`, et rien d'autre ne
  // change : meme README, meme CHECKLIST, memes empreintes.
  const dossierVersion = estTest ? path.join(dossierProjet, TEST, version) : path.join(dossierProjet, version)
  // ⚠ LE CHEMIN AFFICHE ET LE CHEMIN DES MARQUES DOIVENT ETRE LE VRAI. Sans ca, le
  // script annonce `projet/1.0.0-T1/x.apk` alors que le fichier est dans `projet/test/...`,
  // et le fichier de guidage pointe a cote — la marque ne brille sur rien.
  const rel = estTest ? `${projet}/${TEST}/${version}` : `${projet}/${version}`

  // Un binaire publie ne disparait JAMAIS sans laisser de trace.
  //
  // Le 27/08 la promotion de Chantiers 1.0.0 a ecrase le binaire publie du
  // 24/08 : le dossier portait deja le meme numero, donc l invariant ci-dessous
  // ne voyait aucune "autre" version publiee a descendre, --archiver restait
  // sans effet, et la copie ecrasait simplement les fichiers en place. Aucune
  // erreur, aucune ligne de NOTE.md. L APK n a pu etre sauve que parce qu EAS
  // gardait encore l artefact du build ; un installeur Electron est construit
  // localement et n aurait ete rattrape par rien.
  //
  // On ne refuse QUE l ecrasement d un artefact. Redeposer un README ou une
  // CHECKLIST sur une version publiee reste permis : documenter une version
  // deja livree est un usage normal, revendique par --aide.
  if (!estTest && fs.existsSync(dossierVersion)) {
    const ecrases = args.fichier
      .map((f) => path.basename(f))
      .filter((nom) => fs.existsSync(path.join(dossierVersion, nom)))
    if (ecrases.length > 0 && !args.archiver) {
      throw new Error(
        `${projet}/${version} est PUBLIEE et contient deja ${ecrases.join(', ')}. ` +
          `Deposer par-dessus detruirait le binaire publie sans trace. Relancer avec ` +
          `--archiver --pourquoi "<raison>" pour le descendre dans archive/ d abord, ` +
          `ou deposer un build de test (${version}-T<n>).`,
      )
    }
    if (ecrases.length > 0) {
      if (!args.pourquoi) throw new Error('--archiver exige --pourquoi "<raison>" : un NOTE.md sans raison ne sert a rien.')
      const vers = await archiver(dossierProjet, version, args.pourquoi)
      console.log(`archive : ${version} -> ${vers}`)
    }
  }

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
    console.log(`depose  : ${rel}/${nom}`)
  }

  const docs = []
  for (const [option, cible] of [
    ['readme', 'README.md'],
    ['checklist', 'CHECKLIST.md'],
  ]) {
    if (!args[option]) continue
    if (!fs.existsSync(args[option])) throw new Error(`Fichier introuvable : ${args[option]}`)
    await fsp.copyFile(args[option], path.join(dossierVersion, cible))
    docs.push(cible)
    console.log(`depose  : ${rel}/${cible}`)
  }

  // README minimal : mieux qu'un dossier muet dans six mois. Mais s'il y a deja
  // de la documentation dans le dossier (un "0 - LIS-MOI.md" par exemple), un
  // squelette vide ne ferait qu'ajouter du bruit a cote.
  const documente = fs.readdirSync(dossierVersion).some((n) => n.toLowerCase().endsWith('.md'))
  const readme = path.join(dossierVersion, 'README.md')
  if (!documente && !fs.existsSync(readme)) {
    await fsp.writeFile(
      readme,
      `# ${projet} ${version}\n\n` +
        `${estTest ? 'Build de test' : 'Version publiee'} — depose le ${jourCourant()}.\n\n` +
        `## Contenu\n\n${deposes.map((n) => `- \`${n}\``).join('\n')}\n\n` +
        `## Ce qui change\n\n_A completer._\n\n## Quoi tester\n\n_A completer._\n`,
      'utf8',
    )
    console.log(`cree    : ${rel}/README.md (squelette)`)
  }

  // Les empreintes se prennent MAINTENANT, pendant que les fichiers sont sous la main.
  // Apres coup c'est une enquete : il faut retrouver la machine, l'artefact EAS, ou le
  // client lui-meme. (Et un depot de documentation seule en profite aussi : le tableau
  // est recalcule sur le contenu reel du dossier, pas sur ce qui vient d'arriver.)
  // `null` = rien a dire (aucun artefact, aucun fichier d'empreintes) ; `0` = le dossier
  // en portait et n'en porte plus, et le fichier vient d'etre remis a l'heure. Les deux
  // sont faux au sens de JavaScript, donc on teste le `null` explicitement — sinon le cas
  // qui MERITE le plus d'etre annonce serait le seul a se taire.
  const empreintes = await ecrireEmpreintes(dossierVersion, projet, version)
  if (empreintes !== null) {
    console.log(
      empreintes === 0
        ? `empreintes : ${rel}/${EMPREINTES} — plus aucun artefact, tableau retire`
        : `empreintes : ${rel}/${EMPREINTES} — ${empreintes} artefact(s)`,
    )
  }

  const bulle = args.bulle || (estTest ? 'Build de test a verifier' : `${projet} ${version} publiee`)

  // Un dossier avec un point d'entree ne doit pas allumer quatre marques pour
  // une seule chose a faire : --marquer designe la ligne qui brille.
  // Sans artefact, c'est la documentation qu'on vient de poser qui porte la marque.
  let aMarquer = deposes.length > 0 ? deposes : docs
  if (args.marquer) {
    if (!fs.existsSync(path.join(dossierVersion, args.marquer))) {
      throw new Error(`--marquer "${args.marquer}" : ce fichier n'est pas dans ${projet}/${version}/.`)
    }
    aMarquer = [args.marquer]
  }

  const entrees = {}
  for (const nom of aMarquer) {
    entrees[`${rel}/${nom}`] = { brille: true, bulle, ton }
  }
  await majGuide(racine, entrees)
  console.log(`marque  : ${aMarquer.length} element(s) dans ${GUIDE} — "${bulle}"`)
}

main().catch((err) => {
  console.error('hub-depose : ' + err.message)
  process.exit(1)
})
