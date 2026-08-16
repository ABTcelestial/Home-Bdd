import { normalizeRel, resolveInRoot } from '@/lib/paths'
import { getRoot } from '@/lib/config'
import { exists } from '@/lib/fsops'
import { mutateDb } from '@/lib/db'
import { notifyChange } from '@/lib/events'
import { fail, handle } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_NOTE = 20_000

/** Note libre attachee a un fichier ou un dossier (PRD 5.3), stockee dans db.json. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { chemin?: string; note?: string }
    const chemin = normalizeRel(body.chemin)
    const note = (body.note ?? '').toString()

    if (!chemin) return fail('Chemin manquant.')
    if (note.length > MAX_NOTE) return fail('Note trop longue (20 000 caracteres maximum).')

    const abs = resolveInRoot(getRoot(), chemin)
    if (!(await exists(abs))) return fail("Cet element n'existe plus.", 404)

    await mutateDb((db) => {
      if (note.trim()) db.notes[chemin] = note
      else delete db.notes[chemin]
    })

    notifyChange()
    return Response.json({ ok: true, chemin, note })
  })
}
