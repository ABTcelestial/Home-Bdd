import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { getRoot } from '@/lib/config'
import { normalizeRel, resolveInRoot, baseName, TRASH_DIR } from '@/lib/paths'
import { moveEntry, dirSize } from '@/lib/fsops'
import { mutateDb, remapNotes, type TrashEntry } from '@/lib/db'
import { notifyChange } from '@/lib/events'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Suppression douce (PRD 5.4) : rien n'est efface, tout part dans le dossier
 * cache `.corbeille/` avec son emplacement d'origine dans db.json.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { chemins?: string[] }
    const chemins = (body.chemins || []).map(normalizeRel).filter(Boolean)
    if (chemins.length === 0) return fail('Aucun element a supprimer.')

    const root = getRoot()
    const absTrash = path.join(root, TRASH_DIR)
    await fsp.mkdir(absTrash, { recursive: true })

    const entrees: TrashEntry[] = []
    const erreurs: string[] = []

    for (const chemin of chemins) {
      const nom = baseName(chemin)
      try {
        const abs = resolveInRoot(root, chemin)
        const stat = await fsp.stat(abs)
        const id = crypto.randomUUID()
        const nomCorbeille = `${id}__${nom}`
        const taille = stat.isDirectory() ? await dirSize(abs) : stat.size
        await moveEntry(abs, path.join(absTrash, nomCorbeille))
        entrees.push({
          id,
          fichier: `${TRASH_DIR}/${nomCorbeille}`,
          origine: chemin,
          supprimeLe: new Date().toISOString(),
          type: stat.isDirectory() ? 'dir' : 'file',
          taille,
        })
      } catch (err) {
        erreurs.push(`"${nom}" : ${fsErrorMessage(err)}`)
      }
    }

    if (entrees.length) {
      await mutateDb((db) => {
        for (const entree of entrees) {
          // La note suit l'element dans la corbeille et reviendra a la restauration.
          remapNotes(db, entree.origine, entree.fichier)
          db.corbeille.unshift(entree)
        }
      })
      notifyChange()
    }

    if (erreurs.length && !entrees.length) return fail(erreurs.join(' '), 400)
    return Response.json({ ok: true, supprimes: entrees.length, erreurs })
  })
}
