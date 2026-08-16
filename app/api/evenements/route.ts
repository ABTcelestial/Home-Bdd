import { subscribe, currentVersion } from '@/lib/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Flux SSE (PRD 5.6). Le navigateur recoit `event: change` des qu'un fichier
 * bouge sur le disque, qu'il vienne de l'app ou de l'explorateur Windows.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (payload: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          closed = true
        }
      }

      send(`retry: 3000\n\n`)
      send(`event: hello\ndata: ${JSON.stringify({ version: currentVersion() })}\n\n`)

      const unsubscribe = subscribe(send)
      // Ping regulier : garde la connexion ouverte a travers les proxys / WiFi.
      const ping = setInterval(() => send(`: ping\n\n`), 25_000)

      const close = () => {
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

      req.signal.addEventListener('abort', close)
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
