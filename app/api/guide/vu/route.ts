import { mutateDb } from '@/lib/db'
import { normalizeRel } from '@/lib/paths'
import { notifyChange } from '@/lib/events'
import { handle, ok, fail } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Acquitte (ou desacquitte) une marque de guidage. On stocke l'empreinte vue
 * plutot qu'un booleen : si Claude Code reecrit la marque avec un autre texte,
 * elle se rallume d'elle-meme.
 *
 * Le fichier .hub-guide.json n'est jamais modifie ici : il appartient a l'outil
 * qui l'ecrit.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const corps = (await req.json().catch(() => ({}))) as {
      chemin?: unknown
      signature?: unknown
      vu?: unknown
    }

    const chemin = typeof corps.chemin === 'string' ? normalizeRel(corps.chemin) : ''
    if (!chemin) return fail('Chemin manquant.')

    const vu = corps.vu === undefined ? true : Boolean(corps.vu)
    const signature = typeof corps.signature === 'string' ? corps.signature : ''
    if (vu && !signature) return fail('Empreinte manquante.')

    await mutateDb((db) => {
      if (vu) db.guideVus[chemin] = signature
      else delete db.guideVus[chemin]
    })

    notifyChange()
    return ok({ chemin, vu })
  })
}
