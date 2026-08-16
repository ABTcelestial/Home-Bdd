import fsp from 'node:fs/promises'
import path from 'node:path'
import { getRoot } from '@/lib/config'
import { TRASH_DIR } from '@/lib/paths'
import { mutateDb, dropNotes } from '@/lib/db'
import { notifyChange } from '@/lib/events'
import { handle, requireLocal, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vidage definitif (PRD 5.4) : reserve au PC serveur. Double protection —
 * le bouton n'est pas affiche aux clients, et l'API refuse toute requete qui
 * ne vient pas de localhost.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const refus = requireLocal(req)
    if (refus) return refus

    const root = getRoot()
    const absTrash = path.join(root, TRASH_DIR)
    const erreurs: string[] = []
    let supprimes = 0

    const db = await mutateDb((current) => current)
    for (const entree of db.corbeille) {
      const abs = path.join(root, ...entree.fichier.split('/'))
      try {
        await fsp.rm(abs, { recursive: true, force: true })
        supprimes++
      } catch (err) {
        erreurs.push(`${entree.origine} : ${fsErrorMessage(err)}`)
      }
    }

    // Nettoyage des orphelins deposes a la main dans .corbeille
    try {
      for (const nom of await fsp.readdir(absTrash)) {
        await fsp.rm(path.join(absTrash, nom), { recursive: true, force: true }).catch(() => undefined)
      }
    } catch {
      /* dossier absent : rien a nettoyer */
    }

    await mutateDb((current) => {
      for (const entree of current.corbeille) dropNotes(current, entree.fichier)
      current.corbeille = []
    })

    notifyChange()
    return Response.json({ ok: true, supprimes, erreurs })
  })
}
