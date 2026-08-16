import fsp from 'node:fs/promises'
import path from 'node:path'
import { getRoot } from '@/lib/config'
import { readDb, mutateDb } from '@/lib/db'
import { baseName } from '@/lib/paths'
import { handle, isLocalRequest } from '@/lib/api'
import type { TrashItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Contenu de la corbeille. On verifie au passage que les fichiers listes sont
 * toujours sur le disque : une entree fantome (suppression manuelle depuis
 * Windows) est retiree silencieusement.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const root = getRoot()
    const db = await readDb()
    const vivants: TrashItem[] = []
    const fantomes: string[] = []

    for (const entree of db.corbeille) {
      const abs = path.join(root, ...entree.fichier.split('/'))
      try {
        await fsp.access(abs)
        vivants.push({
          id: entree.id,
          nom: baseName(entree.origine),
          origine: entree.origine,
          supprimeLe: entree.supprimeLe,
          type: entree.type,
          taille: entree.taille,
        })
      } catch {
        fantomes.push(entree.id)
      }
    }

    if (fantomes.length) {
      await mutateDb((current) => {
        current.corbeille = current.corbeille.filter((e) => !fantomes.includes(e.id))
      })
    }

    return Response.json({
      ok: true,
      elements: vivants,
      isServer: isLocalRequest(req),
    })
  })
}
