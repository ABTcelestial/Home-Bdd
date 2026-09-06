import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Exploration du disque du PC serveur, UNE COUCHE A LA FOIS.
 *
 * On ne construit jamais l'arbre entier : chaque appel ne lit que les
 * sous-dossiers directs du dossier demande. C'est ce qui rend le choix
 * instantane meme sur un disque de plusieurs teraoctets, la ou un scan
 * recursif ferait attendre plusieurs minutes.
 *
 * Extrait de app/api/admin/parcourir/route.ts, ou ce code vivait seul : le
 * Terminal LAN a besoin du meme parcours, mais derriere une autre garde.
 * Une seule implementation, deux gardes differentes.
 */

export type EntreeDossier = { nom: string; chemin: string }

export type Parcours = {
  chemin: string
  parent: string | null
  dossiers: EntreeDossier[]
  raccourcis?: EntreeDossier[]
}

export class ParcoursErreur extends Error {
  statut: number
  constructor(message: string, statut = 400) {
    super(message)
    this.statut = statut
  }
}

/** Lettres de lecteur presentes sur la machine (Windows). */
function lecteurs(): string[] {
  const out: string[] = []
  for (let code = 65; code <= 90; code++) {
    const lettre = `${String.fromCharCode(code)}:\\`
    try {
      if (fs.existsSync(lettre)) out.push(lettre)
    } catch {
      /* lecteur non pret */
    }
  }
  return out
}

export function bureau(): string {
  return path.join(os.homedir(), 'Desktop')
}

/** Les points de depart : lecteurs et raccourcis usuels. */
export function depart(): Parcours {
  const racines = process.platform === 'win32' ? lecteurs() : ['/']
  return {
    chemin: '',
    parent: null,
    dossiers: racines.map((r) => ({ nom: r, chemin: r })),
    raccourcis: [
      { nom: 'Bureau', chemin: bureau() },
      { nom: 'Dossier personnel', chemin: os.homedir() },
      { nom: 'Documents', chemin: path.join(os.homedir(), 'Documents') },
    ].filter((r) => fs.existsSync(r.chemin)),
  }
}

/** Sous-dossiers directs de `demande`, et rien d'autre. */
export async function parcourir(demande: string): Promise<Parcours> {
  if (!demande) return depart()
  if (!path.isAbsolute(demande)) throw new ParcoursErreur('Chemin complet requis.')

  let entrees: import('node:fs').Dirent[]
  try {
    entrees = await fsp.readdir(demande, { withFileTypes: true })
  } catch {
    throw new ParcoursErreur('Dossier illisible ou inexistant.', 404)
  }

  const dossiers = entrees
    .filter((e) => e.isDirectory())
    .map((e) => ({ nom: e.name, chemin: path.join(demande, e.name) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))

  const parent = path.dirname(demande)
  return { chemin: demande, parent: parent === demande ? null : parent, dossiers }
}
