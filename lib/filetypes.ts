/**
 * Classification des fichiers par extension (PRD 5.2) : une categorie donne
 * l'icone et la teinte. Module pur : utilisable cote client comme serveur.
 */

export type FileKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'archive'
  | 'image'
  | 'video'
  | 'audio'
  | 'binaire'
  | 'code'
  | 'texte'
  | 'defaut'

const MAP: Record<string, FileKind> = {}
function register(kind: FileKind, exts: string[]) {
  for (const e of exts) MAP[e] = kind
}

register('pdf', ['pdf'])
register('word', ['doc', 'docx', 'odt', 'rtf'])
register('excel', ['xls', 'xlsx', 'ods', 'csv', 'tsv'])
register('archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst'])
register('image', ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'heic'])
register('video', ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'm4v', 'mpg', 'mpeg'])
register('audio', ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus'])
register('binaire', ['exe', 'msi', 'iso', 'img', 'dmg', 'apk', 'bin', 'dll', 'sys', 'jar'])
register('code', ['js', 'jsx', 'ts', 'tsx', 'py', 'html', 'htm', 'css', 'scss', 'sql', 'sh', 'bat', 'ps1', 'php', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'json', 'xml', 'yml', 'yaml', 'toml'])
register('texte', ['txt', 'md', 'log', 'env', 'ini', 'cfg', 'conf', 'nfo'])

export function kindOf(ext: string): FileKind {
  return MAP[ext.toLowerCase()] || 'defaut'
}

/** Teintes legeres du PRD (fond blanc, couleur uniquement sur l'icone). */
export const KIND_COLOR: Record<FileKind, string> = {
  pdf: '#dc2626',
  word: '#2563eb',
  excel: '#16a34a',
  archive: '#7c3aed',
  image: '#ea580c',
  video: '#991b1b',
  audio: '#7c3aed',
  binaire: '#374151',
  code: '#b45309',
  texte: '#4b5563',
  defaut: '#6b7280',
}

/* ------------------------------------------------------------------ */
/* Editeur de texte integre (PRD 5.8)                                  */
/* ------------------------------------------------------------------ */

export const TEXT_EXTENSIONS = new Set([
  'md', 'markdown',
  'txt', 'log', 'env', 'ini', 'cfg', 'conf', 'nfo', 'gitignore', 'gitattributes',
  'json', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'toml',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'html', 'htm', 'css', 'scss', 'sql', 'sh', 'bat', 'ps1',
  'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'svg',
])

/** Taille maximale editable (PRD 5.8) : au-dela, lecture seule. */
export const MAX_EDITABLE_SIZE = 5 * 1024 * 1024

export function isTextExt(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext.toLowerCase())
}

export function isMarkdown(ext: string): boolean {
  const e = ext.toLowerCase()
  return e === 'md' || e === 'markdown'
}

/** Un fichier sans extension est candidat a la detection de contenu. */
export function maybeText(name: string, ext: string): boolean {
  if (ext) return isTextExt(ext)
  return !name.includes('.') || name.startsWith('.')
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} o`
  const units = ['Ko', 'Mo', 'Go', 'To']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

export function formatDate(ms: number | string): string {
  const d = typeof ms === 'string' ? new Date(ms) : new Date(ms)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  if (i <= 0) return ''
  return name.slice(i + 1).toLowerCase()
}
