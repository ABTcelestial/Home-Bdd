import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { handle, requireLocal, fail } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lettres de lecteur presentes sur la machine (Windows). */
function lecteurs(): string[] {
  const out: string[] = []
  for (let code = 65; code <= 90; code++) {
    const lettre = `${String.fromCharCode(code)}:\\`
    try {
      if (fs.existsSync(lettre)) out.push(lettre)
    } catch {
      /* lecteur non pret */
    }
  }
  return out
}

/**
 * Explorateur de dossiers du PC serveur, pour choisir la racine sans avoir a
 * taper le chemin a la main (PRD 5.9). Localhost uniquement.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const refus = requireLocal(req)
    if (refus) return refus

    const demande = (new URL(req.url).searchParams.get('chemin') || '').trim()

    if (!demande) {
      const racines = process.platform === 'win32' ? lecteurs() : ['/']
      return Response.json({
        ok: true,
        chemin: '',
        parent: null,
        dossiers: racines.map((r) => ({ nom: r, chemin: r })),
        raccourcis: [
          { nom: 'Dossier personnel', chemin: os.homedir() },
          { nom: 'Bureau', chemin: path.join(os.homedir(), 'Desktop') },
          { nom: 'Documents', chemin: path.join(os.homedir(), 'Documents') },
        ].filter((r) => fs.existsSync(r.chemin)),
      })
    }

    if (!path.isAbsolute(demande)) return fail('Chemin complet requis.')

    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(demande, { withFileTypes: true })
    } catch {
      return fail("Dossier illisible ou inexistant.", 404)
    }

    const dossiers = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ nom: e.name, chemin: path.join(demande, e.name) }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))

    const parent = path.dirname(demande)
    return Response.json({
      ok: true,
      chemin: demande,
      parent: parent === demande ? null : parent,
      dossiers,
    })
  })
}
