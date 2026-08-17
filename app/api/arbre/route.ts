import { NextResponse } from 'next/server'
import { getRoot } from '@/lib/config'
import { readDb } from '@/lib/db'
import { readGuide } from '@/lib/guide'
import { checkRoot, scanRoot } from '@/lib/tree'
import { currentVersion } from '@/lib/events'
import { handle, isLocalRequest } from '@/lib/api'
import type { TreePayload } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Arborescence complete + notes : la seule requete dont l'UI a besoin au chargement. */
export async function GET(req: Request) {
  return handle(async () => {
    const racine = getRoot()
    const isServer = isLocalRequest(req)
    const etat = await checkRoot(racine)

    if (!etat.ok) {
      const payload: TreePayload = {
        racine,
        version: currentVersion(),
        tree: [],
        notes: {},
        isServer,
        guide: [],
        totals: { dossiers: 0, fichiers: 0, taille: 0 },
        ok: false,
        erreur: etat.erreur,
      }
      return NextResponse.json(payload)
    }

    const force = new URL(req.url).searchParams.get('rescan') === '1'
    const [scan, db] = await Promise.all([scanRoot(force), readDb()])
    const guide = await readGuide(db.guideVus)
    const payload: TreePayload = {
      racine,
      version: currentVersion(),
      tree: scan.tree,
      notes: db.notes,
      isServer,
      guide: guide.marques,
      guideErreur: guide.erreur,
      totals: scan.totals,
      ok: true,
    }
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    })
  })
}
