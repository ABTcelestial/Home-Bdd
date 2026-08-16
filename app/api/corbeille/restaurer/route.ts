import fsp from 'node:fs/promises'
import path from 'node:path'
import { getRoot } from '@/lib/config'
import { resolveInRoot, parentOf, baseName, joinRel } from '@/lib/paths'
import { moveEntry, uniquePath } from '@/lib/fsops'
import { mutateDb, remapNotes } from '@/lib/db'
import { notifyChange } from '@/lib/events'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Restauration (PRD 5.4) : accessible a tout le monde. Le fichier retourne a
 * son emplacement d'origine, et le chemin est recree si le dossier parent a
 * disparu entre-temps.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { ids?: string[]; id?: string }
    const ids = body.ids?.length ? body.ids : body.id ? [body.id] : []
    if (!ids.length) return fail('Aucun element a restaurer.')

    const root = getRoot()
    const db = await mutateDb((current) => current) // lecture coherente
    const restaures: { id: string; chemin: string }[] = []
    const erreurs: string[] = []

    for (const id of ids) {
      const entree = db.corbeille.find((e) => e.id === id)
      if (!entree) {
        erreurs.push('Element introuvable dans la corbeille.')
        continue
      }
      const nom = baseName(entree.origine)
      try {
        const source = resolveInRoot(root, entree.fichier, { allowTrash: true })
        const dossierParent = parentOf(entree.origine)
        const absParent = resolveInRoot(root, dossierParent)
        await fsp.mkdir(absParent, { recursive: true })

        const nomFinal = await uniquePath(absParent, nom)
        await moveEntry(source, path.join(absParent, nomFinal))
        const nouveau = joinRel(dossierParent, nomFinal)

        await mutateDb((current) => {
          remapNotes(current, entree.fichier, nouveau)
          current.corbeille = current.corbeille.filter((e) => e.id !== id)
        })
        restaures.push({ id, chemin: nouveau })
      } catch (err) {
        erreurs.push(`"${nom}" : ${fsErrorMessage(err)}`)
      }
    }

    if (restaures.length) notifyChange()
    if (erreurs.length && !restaures.length) return fail(erreurs.join(' '), 400)
    return Response.json({ ok: true, restaures, erreurs })
  })
}
