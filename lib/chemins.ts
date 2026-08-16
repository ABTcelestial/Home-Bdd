/**
 * Helpers de chemins PURS : aucun import Node, donc utilisables aussi bien
 * dans les routes API que dans les composants du navigateur.
 *
 * Toute l'app manipule des chemins RELATIFS a la racine, en slashs "/"
 * (portable, lisible dans les URL).
 */

export const TRASH_DIR = '.corbeille'
export const DB_FILE = 'db.json'

/** Caracteres interdits par Windows dans un nom de fichier. */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

export class PathError extends Error {}

/** Retourne un message d'erreur, ou null si le nom est valide. */
export function validateName(name: string): string | null {
  if (!name || !name.trim()) return 'Le nom ne peut pas etre vide.'
  if (name.length > 200) return 'Le nom est trop long (200 caracteres maximum).'
  if (name === '.' || name === '..') return 'Nom reserve.'
  if (ILLEGAL_CHARS.test(name)) return 'Caracteres interdits : < > : " / \\ | ? *'
  if (name.endsWith(' ') || name.endsWith('.')) return 'Le nom ne peut pas finir par un espace ou un point.'
  const base = name.split('.')[0].toUpperCase()
  if (RESERVED.has(base)) return `"${base}" est un nom reserve par Windows.`
  if (name === TRASH_DIR) return 'Nom reserve par le Hub.'
  return null
}

/** Nettoie un chemin relatif recu du client : "/a//b/" -> "a/b". */
export function normalizeRel(rel: string | null | undefined): string {
  if (!rel) return ''
  return rel
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s.length > 0 && s !== '.')
    .join('/')
}

/** Le parent d'un chemin relatif ("a/b/c" -> "a/b", "a" -> ""). */
export function parentOf(rel: string): string {
  const clean = normalizeRel(rel)
  const i = clean.lastIndexOf('/')
  return i === -1 ? '' : clean.slice(0, i)
}

export function baseName(rel: string): string {
  const clean = normalizeRel(rel)
  const i = clean.lastIndexOf('/')
  return i === -1 ? clean : clean.slice(i + 1)
}

export function joinRel(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => normalizeRel(p)).filter(Boolean).join('/')
}

/** "b" est-il a l'interieur de "a" (ou egal) ? Bloque les deplacements circulaires. */
export function isInside(a: string, b: string): boolean {
  const pa = normalizeRel(a)
  const pb = normalizeRel(b)
  if (pa === '') return true
  return pb === pa || pb.startsWith(pa + '/')
}

/** Libelle du dossier parent pour l'UI ("" -> "racine"). */
export function libelleDossier(rel: string): string {
  return rel === '' ? 'racine du Hub' : rel
}
