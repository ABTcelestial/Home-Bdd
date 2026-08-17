import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { getRoot } from './config'
import { GUIDE_FILE, normalizeRel } from './paths'
import type { MarqueGuide, TonGuide } from './types'

/**
 * Lecture du fichier de guidage `.hub-guide.json`, pose a la racine du Hub par
 * Claude Code ou par un script de build.
 *
 * Contrat volontairement tolerant, parce que le producteur est un outil
 * exterieur qu'on ne controle pas :
 *
 *   {
 *     "Builds/app-1.4.2.apk": { "brille": true, "bulle": "A tester", "ton": "action" },
 *     "Checklists/N10.md":    "3 cases encore vides"      <- raccourci
 *   }
 *
 * Une enveloppe { "elements": { ... } } est acceptee aussi. Tout ce qui n'est
 * pas comprehensible est ignore silencieusement, entree par entree : une faute
 * de frappe sur une marque n'en fait pas disparaitre quinze autres.
 */

const TONS: readonly TonGuide[] = ['info', 'action', 'alerte']
const MAX_BULLE = 240
const MAX_MARQUES = 300

function estTon(valeur: unknown): valeur is TonGuide {
  return typeof valeur === 'string' && (TONS as readonly string[]).includes(valeur)
}

/** Empreinte courte du contenu : elle change des que Claude reecrit la marque. */
function signature(brille: boolean, bulle: string, ton: TonGuide): string {
  return crypto.createHash('sha1').update(`${brille}|${ton}|${bulle}`).digest('hex').slice(0, 10)
}

function lireEntree(chemin: string, brut: unknown): MarqueGuide | null {
  // Raccourci : "chemin": "le texte de la bulle"
  if (typeof brut === 'string') {
    const bulle = brut.trim().slice(0, MAX_BULLE)
    if (!bulle) return null
    return { chemin, brille: true, bulle, ton: 'info', signature: signature(true, bulle, 'info'), vu: false }
  }

  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null
  const objet = brut as Record<string, unknown>

  const bulle = typeof objet.bulle === 'string' ? objet.bulle.trim().slice(0, MAX_BULLE) : ''
  // `brille` vaut vrai par defaut : marquer un fichier sert justement a le voir.
  const brille = objet.brille === undefined ? true : Boolean(objet.brille)
  const ton = estTon(objet.ton) ? objet.ton : 'info'

  // Une marque qui n'allume rien et ne dit rien n'a pas de raison d'exister.
  if (!brille && !bulle) return null

  return { chemin, brille, bulle, ton, signature: signature(brille, bulle, ton), vu: false }
}

export type LectureGuide = { marques: MarqueGuide[]; erreur?: string }

/**
 * @param vus Empreintes deja marquees "fait" (db.json). Une marque dont
 *            l'empreinte a change redevient a voir toute seule.
 */
export async function readGuide(vus: Record<string, string> = {}): Promise<LectureGuide> {
  const fichier = path.join(getRoot(), GUIDE_FILE)

  let brut: string
  try {
    brut = await fsp.readFile(fichier, 'utf8')
  } catch {
    return { marques: [] } // pas de fichier : cas normal, aucun guidage en cours
  }

  let donnees: unknown
  try {
    donnees = JSON.parse(brut)
  } catch {
    return { marques: [], erreur: `${GUIDE_FILE} est illisible (JSON invalide).` }
  }

  if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) {
    return { marques: [], erreur: `${GUIDE_FILE} doit contenir un objet.` }
  }

  const objet = donnees as Record<string, unknown>
  const source =
    objet.elements && typeof objet.elements === 'object' && !Array.isArray(objet.elements)
      ? (objet.elements as Record<string, unknown>)
      : objet

  const marques: MarqueGuide[] = []
  for (const [cle, valeur] of Object.entries(source)) {
    if (marques.length >= MAX_MARQUES) break
    const chemin = normalizeRel(cle)
    if (!chemin) continue
    const marque = lireEntree(chemin, valeur)
    if (!marque) continue
    marque.vu = vus[chemin] === marque.signature
    marques.push(marque)
  }

  return { marques }
}
