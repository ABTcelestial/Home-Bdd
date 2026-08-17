import { subscribe, currentVersion } from '@/lib/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Flux SSE (PRD 5.6). Le navigateur recoit `event: change` des qu'un fichier
 * bouge sur le disque, qu'il vienne de l'app ou de l'explorateur Windows.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder()

  // Le nettoyage doit etre atteignable depuis `cancel` autant que depuis
  // `start` : un navigateur qui lache le flux (onglet ferme, telephone
  // verrouille, WiFi qui bascule) ne declenche pas toujours `req.signal`.
  // Sans ce chemin, le ping continuait a ecrire toutes les 25 s dans un flux
  // mort et l'abonnement n'etait jamais retire.
  let fermer = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (payload: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          // Flux deja ferme : on arrete tout plutot que de reessayer sans fin.
          fermer()
        }
      }

      send(`retry: 3000\n\n`)
      send(`event: hello\ndata: ${JSON.stringify({ version: currentVersion() })}\n\n`)

      const unsubscribe = subscribe(send)
      // Ping regulier : garde la connexion ouverte a travers les proxys / WiFi.
      const ping = setInterval(() => send(`: ping\n\n`), 25_000)

      fermer = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        unsubscribe()
        try {
          controller.close()
        } catch {
          /* deja ferme */
        }
      }

      req.signal.addEventListener('abort', fermer)
    },
    cancel() {
      fermer()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
