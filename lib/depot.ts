'use client'

/**
 * Extraction des fichiers d'un glisser-deposer. Si le navigateur le permet
 * (Chrome, Edge, Firefox recents), un dossier depose est parcouru
 * recursivement pour recreer son arborescence a l'arrivee.
 */

export type FichierDepose = { fichier: File; relatif: string }

type Entree = {
  isFile: boolean
  isDirectory: boolean
  name: string
  file: (cb: (f: File) => void, err: (e: unknown) => void) => void
  createReader: () => { readEntries: (cb: (e: Entree[]) => void, err: (e: unknown) => void) => void }
}

function lireDossier(reader: ReturnType<Entree['createReader']>): Promise<Entree[]> {
  return new Promise((resolve) => {
    const tout: Entree[] = []
    const suivant = () => {
      reader.readEntries((entrees) => {
        if (!entrees.length) {
          resolve(tout)
          return
        }
        tout.push(...entrees)
        suivant() // readEntries ne renvoie que 100 elements a la fois
      }, () => resolve(tout))
    }
    suivant()
  })
}

async function parcourir(entree: Entree, prefixe: string, sortie: FichierDepose[]): Promise<void> {
  if (entree.isFile) {
    const fichier = await new Promise<File | null>((resolve) => {
      entree.file((f) => resolve(f), () => resolve(null))
    })
    if (fichier) sortie.push({ fichier, relatif: prefixe ? `${prefixe}/${entree.name}` : entree.name })
    return
  }
  if (entree.isDirectory) {
    const enfants = await lireDossier(entree.createReader())
    const chemin = prefixe ? `${prefixe}/${entree.name}` : entree.name
    for (const enfant of enfants) await parcourir(enfant, chemin, sortie)
  }
}

export async function fichiersDeposes(dt: DataTransfer): Promise<FichierDepose[]> {
  const sortie: FichierDepose[] = []
  const items = dt.items

  if (items && typeof items[0]?.webkitGetAsEntry === 'function') {
    const entrees: Entree[] = []
    for (let i = 0; i < items.length; i++) {
      const entree = items[i].webkitGetAsEntry() as unknown as Entree | null
      if (entree) entrees.push(entree)
    }
    if (entrees.length) {
      for (const entree of entrees) await parcourir(entree, '', sortie)
      return sortie
    }
  }

  for (const fichier of Array.from(dt.files || [])) {
    sortie.push({ fichier, relatif: fichier.name })
  }
  return sortie
}

/** Fichiers choisis via <input type="file"> (avec webkitdirectory eventuel). */
export function fichiersChoisis(liste: FileList | null): FichierDepose[] {
  if (!liste) return []
  return Array.from(liste).map((fichier) => ({
    fichier,
    relatif: (fichier as File & { webkitRelativePath?: string }).webkitRelativePath || fichier.name,
  }))
}
