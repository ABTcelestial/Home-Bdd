import fsp from 'node:fs/promises'
import path from 'node:path'
import { getRoot } from '@/lib/config'
import { normalizeRel, resolveInRoot, validateName, joinRel } from '@/lib/paths'
import { exists } from '@/lib/fsops'
import { notifyChange } from '@/lib/events'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Creation d'un dossier a n'importe quel niveau (PRD 5.3). */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { parent?: string; nom?: string }
    const parent = normalizeRel(body.parent)
    const nom = (body.nom || '').trim()

    const erreur = validateName(nom)
    if (erreur) return fail(erreur)

    const absParent = resolveInRoot(getRoot(), parent)
    const abs = path.join(absParent, nom)
    if (await exists(abs)) return fail('Un element porte deja ce nom a cet endroit.')

    try {
      await fsp.mkdir(abs, { recursive: false })
    } catch (err) {
      return fail(fsErrorMessage(err), 400)
    }

    notifyChange()
    return Response.json({ ok: true, chemin: joinRel(parent, nom) })
  })
}
