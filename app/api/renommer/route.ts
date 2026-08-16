import path from 'node:path'
import fsp from 'node:fs/promises'
import { getRoot } from '@/lib/config'
import { normalizeRel, resolveInRoot, validateName, parentOf, joinRel, baseName } from '@/lib/paths'
import { exists, moveEntry } from '@/lib/fsops'
import { mutateDb, remapNotes } from '@/lib/db'
import { notifyChange } from '@/lib/events'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Renommage fichier ou dossier, avec verification des caracteres Windows. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { chemin?: string; nom?: string }
    const chemin = normalizeRel(body.chemin)
    const nom = (body.nom || '').trim()

    if (!chemin) return fail('Chemin manquant.')
    const erreur = validateName(nom)
    if (erreur) return fail(erreur)
    if (nom === baseName(chemin)) return Response.json({ ok: true, chemin })

    const root = getRoot()
    const abs = resolveInRoot(root, chemin)
    if (!(await exists(abs))) return fail("Cet element n'existe plus.", 404)

    const parent = parentOf(chemin)
    const cible = path.join(path.dirname(abs), nom)
    // Sur Windows le systeme est insensible a la casse : renommer "a.txt" en
    // "A.txt" doit rester possible.
    if (cible.toLowerCase() !== abs.toLowerCase() && (await exists(cible))) {
      return fail('Un element porte deja ce nom a cet endroit.')
    }

    try {
      await moveEntry(abs, cible)
    } catch (err) {
      return fail(fsErrorMessage(err), 400)
    }

    const nouveau = joinRel(parent, nom)
    await mutateDb((db) => remapNotes(db, chemin, nouveau))
    await fsp.stat(cible).catch(() => undefined)
    notifyChange()
    return Response.json({ ok: true, chemin: nouveau })
  })
}
