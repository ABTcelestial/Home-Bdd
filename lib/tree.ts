import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { getRoot } from './config'
import { DB_FILE, TRASH_DIR } from './paths'
import { extOf } from './filetypes'
import type { FsNode } from './types'

/**
 * Scan du disque (PRD 5.5) : le systeme de fichiers est la source de verite,
 * on le relit et on en deduit l'arborescence. Un cache tres court evite de
 * re-scanner a chaque composant qui interroge l'API dans la meme seconde.
 */

const CACHE_MS = 1200
const MAX_ENTRIES = 200_000

export type ScanResult = {
  tree: FsNode[]
  signature: string
  totals: { dossiers: number; fichiers: number; taille: number }
  scannedAt: number
}

type CacheEntry = { root: string; result: ScanResult }
let cache: CacheEntry | null = null
let inflight: Promise<ScanResult> | null = null

function sortNodes(nodes: FsNode[]): FsNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' })
  })
}

async function walk(
  absDir: string,
  relDir: string,
  hash: crypto.Hash,
  totals: { dossiers: number; fichiers: number; taille: number },
  budget: { left: number },
  depth: number,
): Promise<FsNode[]> {
  if (depth > 32 || budget.left <= 0) return []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true })
  } catch {
    return [] // dossier illisible (droits Windows) : on l'ignore sans casser le scan
  }

  const nodes: FsNode[] = []
  for (const entry of entries) {
    if (budget.left-- <= 0) break
    const name = entry.name
    const rel = relDir ? `${relDir}/${name}` : name
    // Elements internes du Hub, invisibles dans l'arbre.
    if (!relDir && (name === TRASH_DIR || name === DB_FILE)) continue
    // Les liens symboliques sont ignores : ils peuvent boucler ou sortir de la racine.
    if (entry.isSymbolicLink()) continue

    const abs = path.join(absDir, name)
    let stat: import('node:fs').Stats
    try {
      stat = await fsp.stat(abs)
    } catch {
      continue
    }

    if (entry.isDirectory()) {
      const children = await walk(abs, rel, hash, totals, budget, depth + 1)
      totals.dossiers++
      hash.update(`d:${rel}\n`)
      nodes.push({
        name,
        path: rel,
        type: 'dir',
        size: 0,
        mtime: stat.mtimeMs,
        ext: '',
        children,
        count: children.length,
      })
    } else if (entry.isFile()) {
      totals.fichiers++
      totals.taille += stat.size
      hash.update(`f:${rel}:${stat.size}:${Math.round(stat.mtimeMs)}\n`)
      nodes.push({
        name,
        path: rel,
        type: 'file',
        size: stat.size,
        mtime: stat.mtimeMs,
        ext: extOf(name),
      })
    }
  }
  return sortNodes(nodes)
}

async function doScan(root: string): Promise<ScanResult> {
  const hash = crypto.createHash('sha1')
  const totals = { dossiers: 0, fichiers: 0, taille: 0 }
  const tree = await walk(path.resolve(root), '', hash, totals, { left: MAX_ENTRIES }, 0)
  return { tree, signature: hash.digest('hex'), totals, scannedAt: Date.now() }
}

/** Scan avec cache court. `force: true` ignore le cache (bouton "re-scanner"). */
export async function scanRoot(force = false): Promise<ScanResult> {
  const root = getRoot()
  if (!force && cache && cache.root === root && Date.now() - cache.result.scannedAt < CACHE_MS) {
    return cache.result
  }
  if (inflight && !force) return inflight
  const promise = doScan(root).then((result) => {
    cache = { root, result }
    inflight = null
    return result
  })
  inflight = promise
  return promise.catch((err) => {
    inflight = null
    throw err
  })
}

export function invalidateScan(): void {
  cache = null
}

/** La racine est-elle utilisable (existe, dossier, accessible en ecriture) ? */
export async function checkRoot(dir: string): Promise<{ ok: boolean; erreur?: string }> {
  try {
    const stat = await fsp.stat(dir)
    if (!stat.isDirectory()) return { ok: false, erreur: "Ce chemin n'est pas un dossier." }
  } catch {
    return { ok: false, erreur: "Ce dossier n'existe pas ou n'est pas accessible." }
  }
  try {
    await fsp.access(dir, (await import('node:fs')).constants.R_OK | (await import('node:fs')).constants.W_OK)
  } catch {
    return { ok: false, erreur: 'Dossier accessible en lecture seule.' }
  }
  return { ok: true }
}

/** Recherche a plat : aplatit l'arbre pour la colonne de gauche. */
export function flatten(nodes: FsNode[], out: FsNode[] = []): FsNode[] {
  for (const node of nodes) {
    out.push(node)
    if (node.children) flatten(node.children, out)
  }
  return out
}
