import fsp from 'node:fs/promises'
import path from 'node:path'
import { getRoot } from './config'
import { DB_FILE } from './paths'

/**
 * "Fausse BDD" du PRD (5.5) : un seul db.json a la racine, qui ne stocke QUE
 * les metadonnees. Le systeme de fichiers reste la source de verite.
 */

export type TrashEntry = {
  id: string
  fichier: string // chemin relatif dans .corbeille
  origine: string // chemin relatif d'origine
  supprimeLe: string // ISO
  type: 'file' | 'dir'
  taille: number
}

export type Db = {
  racine: string
  notes: Record<string, string>
  corbeille: TrashEntry[]
  /**
   * Marques de guidage acquittees : chemin -> empreinte vue. On garde
   * l'empreinte et pas un simple booleen, pour qu'une marque reecrite par
   * Claude Code redevienne a voir sans rien faire de special.
   */
  guideVus: Record<string, string>
}

function emptyDb(root: string): Db {
  return { racine: root, notes: {}, corbeille: [], guideVus: {} }
}

function dbPath(root: string): string {
  return path.join(root, DB_FILE)
}

/** Les ecritures sont serialisees pour eviter deux writes concurrents. */
let queue: Promise<unknown> = Promise.resolve()

export async function readDb(): Promise<Db> {
  const root = getRoot()
  try {
    const raw = await fsp.readFile(dbPath(root), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Db>
    return {
      racine: root,
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
      corbeille: Array.isArray(parsed.corbeille) ? parsed.corbeille : [],
      guideVus: parsed.guideVus && typeof parsed.guideVus === 'object' ? parsed.guideVus : {},
    }
  } catch {
    return emptyDb(root)
  }
}

async function writeDb(db: Db): Promise<void> {
  const root = getRoot()
  await fsp.mkdir(root, { recursive: true })
  const target = dbPath(root)
  const tmp = `${target}.tmp`
  await fsp.writeFile(tmp, JSON.stringify({ ...db, racine: root }, null, 2), 'utf8')
  await fsp.rename(tmp, target)
}

/** Lit, modifie et reecrit db.json de facon atomique et serialisee. */
export function mutateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await readDb()
    const result = await fn(db)
    await writeDb(db)
    return result
  })
  // La file continue meme si une mutation echoue.
  queue = run.catch(() => undefined)
  return run as Promise<T>
}

/** Cree un db.json vierge dans une racine qui n'en a pas encore. */
export async function ensureDb(): Promise<void> {
  const root = getRoot()
  try {
    await fsp.access(dbPath(root))
  } catch {
    await writeDb(emptyDb(root))
  }
}

/**
 * Deplace les notes quand un fichier/dossier est renomme ou deplace :
 * une note attachee a "a/b.txt" suit vers "c/b.txt", et les notes des enfants
 * d'un dossier suivent aussi.
 */
export function remapNotes(db: Db, from: string, to: string): void {
  const notes = db.notes
  for (const key of Object.keys(notes)) {
    if (key === from) {
      notes[to] = notes[key]
      delete notes[key]
    } else if (key.startsWith(from + '/')) {
      notes[to + key.slice(from.length)] = notes[key]
      delete notes[key]
    }
  }
}

/** Supprime les notes d'un chemin et de ses enfants. */
export function dropNotes(db: Db, target: string): Record<string, string> {
  const removed: Record<string, string> = {}
  for (const key of Object.keys(db.notes)) {
    if (key === target || key.startsWith(target + '/')) {
      removed[key] = db.notes[key]
      delete db.notes[key]
    }
  }
  return removed
}
