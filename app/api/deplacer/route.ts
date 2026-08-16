import path from 'node:path'
import { getRoot } from '@/lib/config'
import {
  normalizeRel,
  resolveInRoot,
  parentOf,
  baseName,
  joinRel,
  isInside,
} from '@/lib/paths'
import { exists, moveEntry, uniquePath } from '@/lib/fsops'
import { mutateDb, remapNotes } from '@/lib/db'
import { notifyChange } from '@/lib/events'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Deplacement (couper / coller) d'un ou plusieurs elements vers un dossier
 * choisi dans l'arbre. Les notes suivent les fichiers.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      chemins?: string[]
      destination?: string
    }
    const chemins = (body.chemins || []).map(normalizeRel).filter(Boolean)
    const destination = normalizeRel(body.destination)

    if (chemins.length === 0) return fail('Aucun element a deplacer.')

    const root = getRoot()
    const absDest = resolveInRoot(root, destination)
    if (!(await exists(absDest))) return fail("Le dossier de destination n'existe plus.", 404)

    const deplaces: { de: string; vers: string }[] = []
    const erreurs: string[] = []

    for (const chemin of chemins) {
      const nom = baseName(chemin)
      if (parentOf(chemin) === destination) continue // deja au bon endroit
      if (isInside(chemin, destination)) {
        erreurs.push(`"${nom}" ne peut pas etre deplace dans lui-meme.`)
        continue
      }

      const abs = resolveInRoot(root, chemin)
      if (!(await exists(abs))) {
        erreurs.push(`"${nom}" n'existe plus.`)
        continue
      }

      try {
        const nomFinal = await uniquePath(absDest, nom)
        await moveEntry(abs, path.join(absDest, nomFinal))
        const nouveau = joinRel(destination, nomFinal)
        deplaces.push({ de: chemin, vers: nouveau })
      } catch (err) {
        erreurs.push(`"${nom}" : ${fsErrorMessage(err)}`)
      }
    }

    if (deplaces.length) {
      await mutateDb((db) => {
        for (const item of deplaces) remapNotes(db, item.de, item.vers)
      })
      notifyChange()
    }

    if (erreurs.length && !deplaces.length) return fail(erreurs.join(' '), 400)
    return Response.json({ ok: true, deplaces, erreurs })
  })
}
