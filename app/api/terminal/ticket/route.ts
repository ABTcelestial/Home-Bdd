import { fail, handle, ok, remoteAddr } from '@/lib/api'
import { exigerTerminal, MAX_TITRE } from '@/lib/terminal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Ticket d'ouverture de socket.
 *
 * Une requete `upgrade` WebSocket ne traverse pas le middleware de Next : elle
 * n'est donc protegee par rien. Plutot que de redire ici la verification des
 * cookies - deux implementations qui finiraient par diverger - le navigateur
 * vient chercher un ticket sur CETTE route, qui est bel et bien gardee par le
 * middleware (session du Hub) et par exigerTerminal (PIN du terminal).
 *
 * Le ticket est a usage unique, lie a l'adresse IP du demandeur, valable 30
 * secondes. Il est demande a chaque (re)connexion, ce qui evite de retaper le
 * PIN a chaque passage de tunnel (PRD 20).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const garde = await exigerTerminal()
    if ('erreur' in garde) return garde.erreur

    const corps = (await req.json().catch(() => ({}))) as { sessionId?: unknown }
    const sessionId = typeof corps.sessionId === 'string' ? corps.sessionId.trim() : ''
    if (!sessionId) return fail('Session manquante.')
    if (sessionId.length > MAX_TITRE) return fail('Session invalide.')
    if (!garde.gest.obtenir(sessionId)) return fail("Cette session n'existe plus.", 404)

    const { jeton, expire } = garde.gest.emettreTicket({
      sessionId,
      ip: remoteAddr(req),
    })
    return ok({ ticket: jeton, expire })
  })
}
