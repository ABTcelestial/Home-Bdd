import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { Readable } from 'node:stream'
import { getRoot } from '@/lib/config'
import { resolveInRoot, baseName } from '@/lib/paths'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Telechargement en flux (PRD 5.3) : le fichier n'est jamais charge en RAM,
 * un ISO de 5 Go passe a la vitesse du reseau local. Les requetes `Range` sont
 * supportees pour permettre la reprise d'un transfert interrompu.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url)
    const chemin = url.searchParams.get('chemin') || ''
    if (!chemin) return fail('Chemin manquant.')

    const abs = resolveInRoot(getRoot(), chemin)
    let stat
    try {
      stat = await fsp.stat(abs)
    } catch (err) {
      return fail(fsErrorMessage(err), 404)
    }
    if (!stat.isFile()) return fail('Seuls les fichiers peuvent etre telecharges.', 400)

    const nom = baseName(chemin)
    const enLigne = url.searchParams.get('vue') === '1'
    const disposition = enLigne ? 'inline' : 'attachment'
    const asciiName = nom.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    const headers: Record<string, string> = {
      'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Last-Modified': new Date(stat.mtimeMs).toUTCString(),
    }

    const range = req.headers.get('range')
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      if (match) {
        const size = stat.size
        let start = match[1] ? parseInt(match[1], 10) : 0
        let end = match[2] ? parseInt(match[2], 10) : size - 1
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
        }
        end = Math.min(end, size - 1)
        const node = fs.createReadStream(abs, { start, end })
        return new Response(Readable.toWeb(node) as unknown as ReadableStream, {
          status: 206,
          headers: {
            ...headers,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(end - start + 1),
          },
        })
      }
    }

    const node = fs.createReadStream(abs)
    return new Response(Readable.toWeb(node) as unknown as ReadableStream, {
      headers: { ...headers, 'Content-Length': String(stat.size) },
    })
  })
}
