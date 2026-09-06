import { fail, handle } from '@/lib/api'
import { exigerTerminal } from '@/lib/terminal'
import { bureau, depart, parcourir, ParcoursErreur } from '@/lib/parcourir'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Choix du dossier de depart d'une session, UNE COUCHE A LA FOIS.
 *
 * Sans chemin demande, on ouvre directement sur le Bureau plutot que sur la
 * liste des lecteurs : c'est de la que part le choix dans 90 % des cas. Les
 * lecteurs et les raccourcis restent joints pour aller ailleurs.
 *
 * Cette route double celle de /api/admin/parcourir sur le meme code, mais pas
 * sur la meme garde : l'admin est reservee au PC serveur, celle-ci s'ouvre au
 * telephone une fois le PIN du terminal donne. C'est voulu - un terminal dont
 * on ne peut pas choisir le dossier depuis le telephone ne sert a rien.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const garde = await exigerTerminal()
    if ('erreur' in garde) return garde.erreur

    const demande = (new URL(req.url).searchParams.get('chemin') || '').trim()

    try {
      if (!demande) {
        const points = depart()
        // Le Bureau peut ne pas exister (profil deplace, poste anglais/francais
        // sans dossier Desktop) : on retombe alors sur les lecteurs.
        try {
          const surLeBureau = await parcourir(bureau())
          return Response.json({
            ok: true,
            ...surLeBureau,
            racines: points.dossiers,
            raccourcis: points.raccourcis,
          })
        } catch {
          return Response.json({ ok: true, ...points, racines: points.dossiers })
        }
      }

      const points = depart()
      return Response.json({
        ok: true,
        ...(await parcourir(demande)),
        racines: points.dossiers,
        raccourcis: points.raccourcis,
      })
    } catch (err) {
      if (err instanceof ParcoursErreur) return fail(err.message, err.statut)
      throw err
    }
  })
}
