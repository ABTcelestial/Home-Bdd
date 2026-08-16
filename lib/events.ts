import { scanRoot, invalidateScan } from './tree'

/**
 * Temps reel (PRD 5.6). Un seul scanner cote serveur compare la signature du
 * disque toutes les N secondes et pousse un evenement SSE aux navigateurs
 * connectes. Les clients gardent en plus un polling de secours si le SSE tombe.
 */

const WATCH_MS = Number(process.env.HUB_WATCH_MS || 4000)

type Bus = {
  clients: Set<(payload: string) => void>
  timer: NodeJS.Timeout | null
  signature: string
  version: number
}

const globalRef = globalThis as unknown as { __hubBus?: Bus }

function bus(): Bus {
  if (!globalRef.__hubBus) {
    globalRef.__hubBus = { clients: new Set(), timer: null, signature: '', version: 1 }
  }
  return globalRef.__hubBus
}

export function currentVersion(): number {
  return bus().version
}

function broadcast(): void {
  const b = bus()
  const payload = `event: change\ndata: ${JSON.stringify({ version: b.version })}\n\n`
  for (const send of b.clients) {
    try {
      send(payload)
    } catch {
      b.clients.delete(send)
    }
  }
}

async function tick(): Promise<void> {
  const b = bus()
  try {
    const result = await scanRoot()
    if (result.signature !== b.signature) {
      b.signature = result.signature
      b.version++
      broadcast()
    }
  } catch {
    // racine inaccessible : on reessaiera au prochain tick
  }
}

function startWatcher(): void {
  const b = bus()
  if (b.timer) return
  b.timer = setInterval(() => {
    void tick()
  }, WATCH_MS)
  // Ne bloque pas l'arret du process.
  b.timer.unref?.()
}

function stopWatcherIfIdle(): void {
  const b = bus()
  if (b.clients.size === 0 && b.timer) {
    clearInterval(b.timer)
    b.timer = null
  }
}

export function subscribe(send: (payload: string) => void): () => void {
  const b = bus()
  b.clients.add(send)
  startWatcher()
  return () => {
    b.clients.delete(send)
    stopWatcherIfIdle()
  }
}

/**
 * A appeler apres toute mutation faite depuis l'app : on invalide le cache et
 * on previent immediatement les autres navigateurs, sans attendre le tick.
 */
export function notifyChange(): void {
  const b = bus()
  invalidateScan()
  b.version++
  broadcast()
  // Recale la signature en arriere-plan pour ne pas rediffuser deux fois.
  void scanRoot(true).then((r) => {
    b.signature = r.signature
  }).catch(() => undefined)
}
