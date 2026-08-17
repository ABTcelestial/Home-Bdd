import path from 'node:path'
import { PathError, TRASH_DIR, normalizeRel } from './chemins'

/**
 * Partie serveur des chemins : conversion d'un chemin relatif (slashs) vers le
 * chemin Windows reel, avec verification anti-traversee.
 */

export {
  TRASH_DIR,
  DB_FILE,
  GUIDE_FILE,
  PathError,
  validateName,
  normalizeRel,
  parentOf,
  baseName,
  joinRel,
  isInside,
} from './chemins'

/**
 * Convertit un chemin relatif en chemin absolu dans la racine.
 * Rejette toute tentative de sortie (`..`, chemin absolu) et l'acces direct a
 * la corbeille, sauf demande explicite (restauration).
 */
export function resolveInRoot(root: string, rel: string, opts: { allowTrash?: boolean } = {}): string {
  const clean = normalizeRel(rel)
  if (clean.split('/').includes('..')) throw new PathError('Chemin invalide.')
  if (!opts.allowTrash && clean.split('/')[0] === TRASH_DIR) {
    throw new PathError('Acces a la corbeille interdit par ce biais.')
  }
  const abs = path.resolve(root, ...clean.split('/'))
  const rootResolved = path.resolve(root)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    throw new PathError('Chemin en dehors de la racine.')
  }
  return abs
}

/** Chemin relatif (slashs) d'un chemin absolu contenu dans la racine. */
export function relFromRoot(root: string, abs: string): string {
  return path.relative(path.resolve(root), abs).split(path.sep).join('/')
}
