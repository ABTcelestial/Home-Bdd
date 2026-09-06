import { fail, handle, ok } from '@/lib/api'
import { etatTerminal, exigerTerminal, MAX_TITRE, nettoyerTitre } from '@/lib/terminal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Etat du terminal et liste des sessions (PRD 11).
 *
 * GET repond meme verrouille : l'interface a besoin de savoir s'il faut
 * demander le PIN, dire qu'aucun PIN n'est pose, ou annoncer que le module
 * natif manque. Elle ne recoit la liste des sessions qu'une fois deverrouillee.
 */
export async function GET() {
  return handle(async () => {
    const etat = await etatTerminal()
    if (!etat.actif || !etat.deverrouille) {
      return Response.json({ ok: true, ...etat, sessions: [] })
    }
    const garde = await exigerTerminal()
    if ('erreur' in garde) return garde.erreur
    return Response.json({ ok: true, ...etat, sessions: garde.gest.liste() })
  })
}

/** Ouvre une session (PRD 11). Le dossier vient du selecteur par couches. */
export async function POST(req: Request) {
  return handle(async () => {
    const garde = await exigerTerminal()
    if ('erreur' in garde) return garde.erreur

    const corps = (await req.json().catch(() => ({}))) as {
      titre?: unknown
      cwd?: unknown
      cols?: unknown
      rows?: unknown
    }

    const cols = Number(corps.cols)
    const rows = Number(corps.rows)

    try {
      const session = garde.gest.creer({
        titre: nettoyerTitre(typeof corps.titre === 'string' ? corps.titre : ''),
        cwd: typeof corps.cwd === 'string' && corps.cwd.trim() ? corps.cwd.trim() : undefined,
        cols: Number.isInteger(cols) && cols > 0 && cols <= 500 ? cols : 80,
        rows: Number.isInteger(rows) && rows > 0 && rows <= 300 ? rows : 24,
      })
      return ok({ session: session.resume() })
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Ouverture impossible.', 400)
    }
  })
}

/** Ferme une session. C'est la seule fermeture voulue par l'utilisateur. */
export async function DELETE(req: Request) {
  return handle(async () => {
    const garde = await exigerTerminal()
    if ('erreur' in garde) return garde.erreur

    const id = (new URL(req.url).searchParams.get('id') || '').trim()
    if (!id) return fail('Session manquante.')
    if (id.length > MAX_TITRE) return fail('Session invalide.')
    if (!garde.gest.fermer(id)) return fail("Cette session n'existe plus.", 404)
    return ok()
  })
}
