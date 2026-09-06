import { handle, requireLocal, fail } from '@/lib/api'
import { parcourir, ParcoursErreur } from '@/lib/parcourir'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Explorateur de dossiers du PC serveur, pour choisir la racine sans avoir a
 * taper le chemin a la main (PRD 5.9). Localhost uniquement.
 *
 * Le parcours lui-meme vit dans lib/parcourir.ts : le Terminal LAN s'en sert
 * aussi, derriere sa propre garde. La garde locale, elle, reste ici et ne
 * change pas.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const refus = requireLocal(req)
    if (refus) return refus

    const demande = (new URL(req.url).searchParams.get('chemin') || '').trim()
    try {
      return Response.json({ ok: true, ...(await parcourir(demande)) })
    } catch (err) {
      if (err instanceof ParcoursErreur) return fail(err.message, err.statut)
      throw err
    }
  })
}
