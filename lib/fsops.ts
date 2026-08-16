import fsp from 'node:fs/promises'
import path from 'node:path'

/** Le nom existe deja ? on suffixe " (1)", " (2)"... comme Windows. */
export async function uniquePath(dir: string, nom: string): Promise<string> {
  const ext = path.extname(nom)
  const base = ext ? nom.slice(0, -ext.length) : nom
  let candidate = nom
  let i = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await fsp.access(path.join(dir, candidate))
    } catch {
      return candidate
    }
    candidate = `${base} (${i})${ext}`
    i++
    if (i > 9999) throw new Error('Impossible de trouver un nom libre.')
  }
}

export async function exists(target: string): Promise<boolean> {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

/** Deplacement tolerant aux volumes differents (rename echoue en EXDEV). */
export async function moveEntry(from: string, to: string): Promise<void> {
  try {
    await fsp.rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await fsp.cp(from, to, { recursive: true, force: true })
    await fsp.rm(from, { recursive: true, force: true })
  }
}

/** Taille recursive d'un dossier (affichee dans la corbeille). */
export async function dirSize(target: string): Promise<number> {
  let total = 0
  const stack = [target]
  while (stack.length) {
    const current = stack.pop() as string
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(abs)
      else if (entry.isFile()) {
        try {
          total += (await fsp.stat(abs)).size
        } catch {
          /* ignore */
        }
      }
    }
  }
  return total
}
